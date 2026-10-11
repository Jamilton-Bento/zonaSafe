import { ReportType } from '@prisma/client';
import { prisma } from '../../db';
import { brl, fmtDate, fmtDateTime } from '../../lib/dates';
import { TICKET_OPEN } from '../tickets/routes';

const OPEN = ['NOVA', 'PENDENTE', 'EM_ANDAMENTO', 'AGUARDANDO_RETORNO'] as const;
export const REPORT_TITLES: Record<ReportType, string> = {
  TAREFAS_PENDENTES: 'Tarefas pendentes',
  TAREFAS_ATRASADAS: 'Tarefas atrasadas',
  CHAMADOS_ABERTOS: 'Chamados abertos',
  ATENDIMENTOS_CONCLUIDOS: 'Atendimentos concluídos (últimos 7 dias)',
  ORCAMENTOS_AGUARDANDO_APROVACAO: 'Orçamentos aguardando aprovação',
};
const MAX = 20;

export async function buildReport(type: ReportType, now = new Date()): Promise<{ title: string; count: number; text: string }> {
  let lines: string[] = [];
  let count = 0;
  const who = (r: { name: string } | null) => (r ? ` — ${r.name}` : '');
  switch (type) {
    case 'TAREFAS_PENDENTES':
    case 'TAREFAS_ATRASADAS': {
      const where = type === 'TAREFAS_PENDENTES' ? { status: { in: [...OPEN] } } : { status: { in: [...OPEN] }, dueDate: { lt: now } };
      const rows = await prisma.task.findMany({ where, include: { requester: { select: { name: true } } }, orderBy: [{ dueDate: 'asc' }], take: 200 });
      count = rows.length;
      lines = rows.slice(0, MAX).map((t) => `• #${t.number} ${t.title} [${t.priority}] prazo ${fmtDate(t.dueDate)}${who(t.requester)}`);
      break;
    }
    case 'CHAMADOS_ABERTOS': {
      const rows = await prisma.ticket.findMany({ where: { status: { in: [...TICKET_OPEN] } }, include: { requester: { select: { name: true } } }, orderBy: { openedAt: 'asc' }, take: 200 });
      count = rows.length;
      lines = rows.slice(0, MAX).map((t) => `• #${t.number} ${t.title} [${t.status}] aberto ${fmtDate(t.openedAt)}${who(t.requester)}`);
      break;
    }
    case 'ATENDIMENTOS_CONCLUIDOS': {
      const since = new Date(now.getTime() - 7 * 86400_000);
      const rows = await prisma.ticket.findMany({ where: { status: 'CONCLUIDO', closedAt: { gte: since } }, include: { requester: { select: { name: true } } }, orderBy: { closedAt: 'desc' }, take: 200 });
      count = rows.length;
      lines = rows.slice(0, MAX).map((t) => `• #${t.number} ${t.title} concluído ${fmtDate(t.closedAt)}${who(t.requester)}`);
      break;
    }
    case 'ORCAMENTOS_AGUARDANDO_APROVACAO': {
      const rows = await prisma.quoteRequest.findMany({ where: { status: 'AGUARDANDO_APROVACAO' }, include: { offers: { select: { totalCents: true, meetsSpecs: true } } }, take: 200 });
      count = rows.length;
      lines = rows.slice(0, MAX).map((q) => {
        const valid = q.offers.filter((o) => o.meetsSpecs);
        const min = valid.length ? brl(Math.min(...valid.map((o) => o.totalCents))) : 'sem ofertas válidas';
        return `• #${q.number} ${q.product} (x${q.quantity}) — menor total válido: ${min}`;
      });
      break;
    }
  }
  const title = REPORT_TITLES[type];
  const head = `*${title}* — ${fmtDateTime(now)}\nTotal: ${count}`;
  const tail = count > MAX ? `\n… e mais ${count - MAX}. Veja o restante no sistema.` : '';
  return { title, count, text: count ? `${head}\n${lines.join('\n')}${tail}` : `${head}\nNada a informar.` };
}
