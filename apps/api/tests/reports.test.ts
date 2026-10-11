import { beforeEach, describe, expect, it, afterAll } from 'vitest';
import { prisma } from '../src/db';
import { runSchedule, tick, isDue } from '../src/modules/reports/scheduler';
import { buildReport } from '../src/modules/reports/builder';
import { FakeTransport, login, resetDb, useFakeTransport } from './helpers';
import { patchState } from '../src/modules/whatsapp/state';

let fake: FakeTransport;
beforeEach(async () => { await resetDb(); fake = useFakeTransport(); fake.state = 'open'; await patchState({ connection: 'open' }); });
afterAll(() => prisma.$disconnect());

const GROUP = '120363999999999999@g.us';
const mkSchedule = async (admin: any, extra: object = {}) =>
  (await admin.post('/api/reports/schedules').send({ name: 'Pendências diárias', type: 'TAREFAS_PENDENTES', destinationJid: GROUP, frequency: 'DIARIA', hour: 8, minute: 0, ...extra })).body;

describe('Relatórios programados', () => {
  it('monta o relatório com dados reais', async () => {
    await prisma.task.create({ data: { title: 'Atrasada de verdade', dueDate: new Date(Date.now() - 86400_000) } });
    await prisma.task.create({ data: { title: 'No prazo', dueDate: new Date(Date.now() + 5 * 86400_000) } });
    const late = await buildReport('TAREFAS_ATRASADAS');
    expect(late.count).toBe(1);
    expect(late.text).toContain('Atrasada de verdade');
    expect(late.text).not.toContain('No prazo');
    expect((await buildReport('CHAMADOS_ABERTOS')).text).toContain('Nada a informar');
  });
  it('agendamento nasce inativo e só ativa depois de um teste bem-sucedido', async () => {
    const admin = await login('ADMIN');
    const s = await mkSchedule(admin);
    expect(s.active).toBe(false);
    expect((await admin.patch(`/api/reports/schedules/${s.id}`).send({ active: true })).status).toBe(400);
    expect(fake.sent).toHaveLength(0);
    // nenhum envio automático antes do teste
    await prisma.reportSchedule.update({ where: { id: s.id }, data: { active: true } });
    expect(await tick(new Date(2026, 9, 11, 8, 0))).toHaveLength(0);
    await prisma.reportSchedule.update({ where: { id: s.id }, data: { active: false } });
    const t = await admin.post(`/api/reports/schedules/${s.id}/test`);
    expect(t.status).toBe(200);
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0].number).toBe(GROUP);
    expect((await admin.patch(`/api/reports/schedules/${s.id}`).send({ active: true })).status).toBe(200);
    // mudar o destino invalida o teste
    const ch = await admin.patch(`/api/reports/schedules/${s.id}`).send({ destinationJid: '120363888888888888@g.us' });
    expect(ch.body.tested).toBe(false);
    expect(ch.body.active).toBe(false);
  });
  it('prevenção de envio duplicado: o mesmo horário nunca dispara duas vezes', async () => {
    const admin = await login('ADMIN');
    const s = await mkSchedule(admin);
    await admin.post(`/api/reports/schedules/${s.id}/test`);
    await prisma.reportSchedule.update({ where: { id: s.id }, data: { active: true } });
    fake.sent.length = 0;
    const at = new Date(2026, 9, 12, 8, 0, 5);
    const results = await Promise.all([tick(at), tick(at), tick(at)]);
    expect(results.flat().filter((r) => r.outcome === 'enviado')).toHaveLength(1);
    expect(results.flat().filter((r) => r.outcome === 'duplicado')).toHaveLength(2);
    expect(fake.sent).toHaveLength(1);
    expect(await tick(new Date(2026, 9, 12, 8, 0, 40))).toEqual([expect.objectContaining({ outcome: 'duplicado' })]);
    expect(await tick(new Date(2026, 9, 13, 8, 0, 1))).toEqual([expect.objectContaining({ outcome: 'enviado' })]);
    expect(await prisma.reportRun.count({ where: { trigger: 'agendado', status: 'SUCESSO' } })).toBe(2);
  });
  it('respeita frequência semanal/mensal e horário', async () => {
    const admin = await login('ADMIN');
    const w = await mkSchedule(admin, { frequency: 'SEMANAL', weekday: 1, hour: 9, minute: 30 });
    const m = await mkSchedule(admin, { frequency: 'MENSAL', monthDay: 5, hour: 7 });
    const sw = { ...w, active: true, tested: true }, sm = { ...m, active: true, tested: true };
    expect(isDue(sw, new Date(2026, 9, 12, 9, 30))).toBe(true);  // segunda-feira
    expect(isDue(sw, new Date(2026, 9, 13, 9, 30))).toBe(false); // terça
    expect(isDue(sw, new Date(2026, 9, 12, 9, 31))).toBe(false);
    expect(isDue(sm, new Date(2026, 10, 5, 7, 0))).toBe(true);
    expect(isDue(sm, new Date(2026, 10, 6, 7, 0))).toBe(false);
    expect((await admin.post('/api/reports/schedules').send({ name: 'x1', type: 'CHAMADOS_ABERTOS', destinationJid: GROUP, frequency: 'SEMANAL', hour: 8 })).status).toBe(400);
  });
  it('falhas persistentes pausam o agendamento e avisam o administrador', async () => {
    const admin = await login('ADMIN');
    const s = await mkSchedule(admin);
    await admin.post(`/api/reports/schedules/${s.id}/test`);
    await prisma.reportSchedule.update({ where: { id: s.id }, data: { active: true } });
    fake.failSend = true;
    for (let i = 0; i < 3; i++) {
      const cur = await prisma.reportSchedule.findUniqueOrThrow({ where: { id: s.id } });
      await runSchedule(cur, 'agendado', new Date(2026, 9, 20 + i, 8, 0));
      await patchState({ paused: false, consecutiveFailures: 0 }); // isola o disjuntor do WhatsApp deste teste
    }
    const after = await prisma.reportSchedule.findUniqueOrThrow({ where: { id: s.id } });
    expect(after.active).toBe(false);
    expect(after.pausedReason).toContain('3 falhas');
    expect(await prisma.notification.count({ where: { kind: 'relatorio' } })).toBe(1);
    expect(await prisma.reportRun.count({ where: { status: 'FALHA' } })).toBe(3);
  });
  it('WhatsApp pausado/desconectado: não envia, não conta como falha e registra no histórico', async () => {
    const admin = await login('ADMIN');
    const s = await mkSchedule(admin);
    await admin.post(`/api/reports/schedules/${s.id}/test`);
    await prisma.reportSchedule.update({ where: { id: s.id }, data: { active: true } });
    fake.sent.length = 0;
    await admin.post('/api/whatsapp/pause').send({ paused: true });
    const cur = await prisma.reportSchedule.findUniqueOrThrow({ where: { id: s.id } });
    const r = await runSchedule(cur, 'agendado', new Date(2026, 9, 25, 8, 0));
    expect(r.outcome).toBe('bloqueado');
    expect(fake.sent).toHaveLength(0);
    const run = await prisma.reportRun.findFirstOrThrow({ where: { trigger: 'agendado' } });
    expect(run.status).toBe('IGNORADO');
    expect((await prisma.reportSchedule.findUniqueOrThrow({ where: { id: s.id } })).failureCount).toBe(0);
  });
  it('somente administradores configuram agendamentos', async () => {
    const tech = await login('TECNICO');
    expect((await tech.post('/api/reports/schedules').send({ name: 'x1', type: 'CHAMADOS_ABERTOS', destinationJid: GROUP, frequency: 'DIARIA', hour: 8 })).status).toBe(403);
    expect((await tech.get('/api/reports/preview?type=CHAMADOS_ABERTOS')).status).toBe(200);
  });
});
