import cron from 'node-cron';
import { ReportSchedule } from '@prisma/client';
import { prisma } from '../../db';
import { logger } from '../../lib/logger';
import { slotKey } from '../../lib/dates';
import { buildReport } from './builder';
import { SendBlocked, sendText } from '../whatsapp/service';
import { recoverPending } from '../whatsapp/webhook';
import { purgeOldMessages } from '../messages/routes';
import { getSetting } from '../../lib/settings';
import { config } from '../../config';

export const MAX_REPORT_FAILURES = 3;

export type RunOutcome = 'enviado' | 'duplicado' | 'bloqueado' | 'falha';

/**
 * Executa um agendamento. `trigger`:
 *  - "agendado": usa o horário (slot) como chave única => nunca dispara duas vezes o mesmo horário;
 *  - "manual"/"teste": chave própria, usada pelo administrador.
 */
export async function runSchedule(s: ReportSchedule, trigger: 'agendado' | 'manual' | 'teste', now = new Date()): Promise<{ outcome: RunOutcome; detail?: string }> {
  const key = trigger === 'agendado' ? slotKey(now) : `${trigger}:${now.getTime()}`;
  let run;
  try {
    run = await prisma.reportRun.create({ data: { scheduleId: s.id, slotKey: key, status: 'IGNORADO', trigger } });
  } catch (e: any) {
    if (e?.code === 'P2002') return { outcome: 'duplicado' };
    throw e;
  }
  const finish = (status: 'SUCESSO' | 'FALHA' | 'IGNORADO', detail?: string) =>
    prisma.reportRun.update({ where: { id: run.id }, data: { status, detail: detail?.slice(0, 400), finishedAt: new Date() } });

  try {
    const report = await buildReport(s.type, now);
    await sendText(s.destinationJid, report.text, { reason: `relatório ${s.name}` });
    await finish('SUCESSO', `${report.count} item(ns)`);
    await prisma.reportSchedule.update({ where: { id: s.id }, data: { failureCount: 0, ...(trigger === 'teste' ? { tested: true } : {}) } });
    return { outcome: 'enviado' };
  } catch (e) {
    const msg = (e as Error).message;
    if (e instanceof SendBlocked) {
      // Pausa/desconexão/limite: não é falha do agendamento, apenas não enviamos.
      await finish('IGNORADO', msg);
      return { outcome: 'bloqueado', detail: msg };
    }
    await finish('FALHA', msg);
    const fresh = await prisma.reportSchedule.update({ where: { id: s.id }, data: { failureCount: { increment: 1 } } });
    if (fresh.failureCount >= MAX_REPORT_FAILURES && fresh.active) {
      await prisma.reportSchedule.update({ where: { id: s.id }, data: { active: false, pausedReason: `${fresh.failureCount} falhas seguidas: ${msg}`.slice(0, 300) } });
      await prisma.notification.create({ data: { kind: 'relatorio', title: `Relatório "${s.name}" pausado`, body: `Pausado após ${fresh.failureCount} falhas consecutivas. Último erro: ${msg}`.slice(0, 400), link: '/relatorios' } });
    }
    return { outcome: 'falha', detail: msg };
  }
}

export function isDue(s: ReportSchedule, now: Date): boolean {
  if (!s.active || !s.tested) return false;
  if (now.getHours() !== s.hour || now.getMinutes() !== s.minute) return false;
  if (s.frequency === 'SEMANAL') return s.weekday === now.getDay();
  if (s.frequency === 'MENSAL') return s.monthDay === now.getDate();
  return true;
}

export async function tick(now = new Date()) {
  const all = await prisma.reportSchedule.findMany({ where: { active: true, tested: true } });
  const results = [];
  for (const s of all.filter((x) => isDue(x, now))) results.push({ id: s.id, ...(await runSchedule(s, 'agendado', now)) });
  return results;
}

export function startScheduler() {
  cron.schedule('* * * * *', () => { tick().catch((e) => logger.error('falha no agendador', { err: String(e) })); });
  // manutenção: reprocessa eventos pendentes e aplica retenção diariamente às 03:10
  cron.schedule('*/5 * * * *', () => { recoverPending().catch(() => undefined); });
  cron.schedule('10 3 * * *', async () => {
    const days = await getSetting('retentionDays', config.RETENTION_MESSAGE_DAYS);
    const r = await purgeOldMessages(days);
    logger.info('retenção aplicada', r);
  });
  logger.info('agendador iniciado');
}
