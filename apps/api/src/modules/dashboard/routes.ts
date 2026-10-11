import { Router } from 'express';
import { prisma } from '../../db';
import { wrap } from '../../lib/http';
import { endOfDay, startOfDay } from '../../lib/dates';
import { loadState } from '../whatsapp/state';
import { TICKET_OPEN } from '../tickets/routes';

export const dashboardRouter = Router();
const OPEN = ['NOVA', 'PENDENTE', 'EM_ANDAMENTO', 'AGUARDANDO_RETORNO'] as const;
const taskSel = { id: true, number: true, title: true, priority: true, status: true, dueDate: true, requester: { select: { name: true, isDirector: true } } } as const;

dashboardRouter.get('/', wrap(async (_req, res) => {
  const now = new Date();
  const openTask = { status: { in: [...OPEN] } };
  const [openTickets, pendingTasks, overdue, dueToday, direction, quotesInProgress, quotesAwaiting, recentMessages, lastTickets, urgent, wa, unreadNotifications] = await Promise.all([
    prisma.ticket.count({ where: { status: { in: [...TICKET_OPEN] } } }),
    prisma.task.count({ where: openTask }),
    prisma.task.count({ where: { ...openTask, dueDate: { lt: now } } }),
    prisma.task.count({ where: { ...openTask, dueDate: { gte: startOfDay(now), lte: endOfDay(now) } } }),
    Promise.all([
      prisma.task.count({ where: { ...openTask, requester: { isDirector: true } } }),
      prisma.ticket.count({ where: { status: { in: [...TICKET_OPEN] }, requester: { isDirector: true } } }),
    ]).then(([t, k]) => t + k),
    prisma.quoteRequest.count({ where: { status: { in: ['RASCUNHO', 'EM_PESQUISA'] } } }),
    prisma.quoteRequest.count({ where: { status: 'AGUARDANDO_APROVACAO' } }),
    prisma.message.findMany({ where: { direction: 'ENTRADA' }, orderBy: { sentAt: 'desc' }, take: 8, select: { id: true, body: true, type: true, sentAt: true, processing: true, senderName: true, conversation: { select: { title: true } } } }),
    prisma.ticket.findMany({ where: { status: 'CONCLUIDO' }, orderBy: { closedAt: 'desc' }, take: 5, select: { id: true, number: true, title: true, closedAt: true, requester: { select: { name: true } } } }),
    prisma.task.findMany({ where: openTask, select: taskSel, take: 200 }),
    loadState(),
    prisma.notification.count({ where: { read: false } }),
  ]);
  const rank = { CRITICA: 0, ALTA: 1, NORMAL: 2, BAIXA: 3 } as const;
  const agora = urgent
    .sort((a, b) => {
      const oa = a.dueDate && a.dueDate < now ? 0 : 1, ob = b.dueDate && b.dueDate < now ? 0 : 1;
      return oa - ob || rank[a.priority] - rank[b.priority] || (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity);
    })
    .slice(0, 10);
  res.json({
    counters: { openTickets, pendingTasks, overdueTasks: overdue, dueToday, directionRequests: direction, quotesInProgress, quotesAwaitingApproval: quotesAwaiting, unreadNotifications },
    solveNow: agora,
    recentMessages,
    lastServed: lastTickets,
    whatsapp: { connection: wa.connection, confirmedAt: wa.confirmedAt, paused: wa.paused, lastError: wa.lastError },
  });
}));
