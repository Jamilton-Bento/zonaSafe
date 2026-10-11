import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db';
import { HttpError, parse, wrap } from '../../lib/http';
import { parseDue } from '../../lib/dates';
import { audit, recordChanges, recordEvent } from '../../lib/audit';

export const ticketsRouter = Router();

const STATUS = ['NOVO', 'TRIAGEM', 'PENDENTE', 'EM_ANDAMENTO', 'AGUARDANDO_SOLICITANTE', 'AGUARDANDO_FORNECEDOR', 'CONCLUIDO', 'CANCELADO'] as const;
const PRIORITY = ['BAIXA', 'NORMAL', 'ALTA', 'CRITICA'] as const;
const CATEGORY = ['HARDWARE', 'SOFTWARE', 'REDE', 'INTERNET', 'SERVIDORES', 'SISTEMAS_EMPRESARIAIS', 'IMPRESSORAS', 'ACESSOS', 'EMAIL', 'TELEFONIA', 'COMPRAS', 'OUTROS'] as const;
export const TICKET_OPEN = ['NOVO', 'TRIAGEM', 'PENDENTE', 'EM_ANDAMENTO', 'AGUARDANDO_SOLICITANTE', 'AGUARDANDO_FORNECEDOR'] as const;

const id = z.string().min(1).nullable().optional();
const schema = z.object({
  title: z.string().trim().min(2, 'Informe um título').max(200),
  description: z.string().max(10000).nullable().optional(),
  requesterId: id, companyId: id, branchId: id, assigneeId: id,
  category: z.enum(CATEGORY).optional(),
  priority: z.enum(PRIORITY).optional(),
  status: z.enum(STATUS).optional(),
  dueDate: z.string().nullable().optional(),
  solution: z.string().max(10000).nullable().optional(),
  sourceMessageId: z.string().optional(),
});

const include = {
  requester: { select: { id: true, name: true, phone: true, isDirector: true } },
  company: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
} satisfies Prisma.TicketInclude;

ticketsRouter.get('/', wrap(async (req, res) => {
  const q = z.object({
    q: z.string().optional(),
    status: z.enum(STATUS).optional(),
    open: z.enum(['1', '0']).optional(),
    priority: z.enum(PRIORITY).optional(),
    category: z.enum(CATEGORY).optional(),
    companyId: z.string().optional(), branchId: z.string().optional(), requesterId: z.string().optional(),
    sort: z.enum(['openedAt', 'dueDate', 'priority', 'number']).default('openedAt'),
    dir: z.enum(['asc', 'desc']).default('desc'),
  }).parse(req.query);
  const where: Prisma.TicketWhereInput = {
    status: q.status ?? (q.open === '1' ? { in: [...TICKET_OPEN] } : undefined),
    priority: q.priority, category: q.category, companyId: q.companyId, branchId: q.branchId, requesterId: q.requesterId,
    ...(q.q ? { OR: [
      { title: { contains: q.q, mode: 'insensitive' } },
      { description: { contains: q.q, mode: 'insensitive' } },
      ...(Number.isInteger(Number(q.q)) ? [{ number: Number(q.q) }] : []),
    ] } : {}),
  };
  res.json(await prisma.ticket.findMany({ where, include, orderBy: { [q.sort]: q.dir }, take: 500 }));
}));

ticketsRouter.get('/:id', wrap(async (req, res) => {
  const t = await prisma.ticket.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { ...include, comments: { orderBy: { createdAt: 'asc' } }, messages: { orderBy: { sentAt: 'asc' }, include: { conversation: { select: { title: true, remoteJid: true } } } } },
  });
  const history = await prisma.historyEntry.findMany({ where: { entityType: 'ticket', entityId: t.id }, orderBy: { createdAt: 'desc' } });
  res.json({ ...t, history });
}));

ticketsRouter.post('/', wrap(async (req, res) => {
  const { sourceMessageId, dueDate, ...d } = parse(schema, req.body);
  let due: Date | null = null;
  try { due = parseDue(dueDate); } catch { throw new HttpError(400, 'Prazo inválido'); }
  const status = d.status ?? 'NOVO';
  if (status === 'CONCLUIDO' && !d.solution?.trim()) throw new HttpError(400, 'Informe a solução aplicada para concluir o chamado');
  const t = await prisma.ticket.create({ data: { ...d, status, dueDate: due, closedAt: status === 'CONCLUIDO' ? new Date() : null }, include });
  if (sourceMessageId) {
    await prisma.message.update({ where: { id: sourceMessageId }, data: { ticketId: t.id, processing: 'CONVERTIDA', analyzedAt: new Date() } });
  }
  await recordEvent('ticket', t.id, req.user, sourceMessageId ? 'aberto a partir de mensagem do WhatsApp' : 'aberto');
  await audit(req, 'chamado_criado', { entity: 'ticket', entityId: t.id, detail: `#${t.number} ${t.title}` });
  res.status(201).json(t);
}));

ticketsRouter.patch('/:id', wrap(async (req, res) => {
  const { sourceMessageId: _s, dueDate, ...d } = parse(schema.partial(), req.body);
  const before = await prisma.ticket.findUniqueOrThrow({ where: { id: req.params.id } });
  const data: Prisma.TicketUncheckedUpdateInput = { ...d };
  if (dueDate !== undefined) {
    try { data.dueDate = parseDue(dueDate); } catch { throw new HttpError(400, 'Prazo inválido'); }
  }
  const newStatus = d.status ?? before.status;
  const solution = d.solution !== undefined ? d.solution : before.solution;
  if (newStatus === 'CONCLUIDO' && !solution?.trim()) throw new HttpError(400, 'Informe a solução aplicada para concluir o chamado');
  if (d.status && d.status !== before.status) {
    data.closedAt = d.status === 'CONCLUIDO' || d.status === 'CANCELADO' ? new Date() : null;
  }
  const after = await prisma.ticket.update({ where: { id: before.id }, data, include });
  await recordChanges('ticket', before.id, req.user, before, after,
    ['title', 'description', 'status', 'priority', 'category', 'dueDate', 'assigneeId', 'requesterId', 'companyId', 'branchId', 'solution']);
  res.json(after);
}));

ticketsRouter.post('/:id/comments', wrap(async (req, res) => {
  const { body } = parse(z.object({ body: z.string().trim().min(1, 'Escreva o comentário').max(5000) }), req.body);
  await prisma.ticket.findUniqueOrThrow({ where: { id: req.params.id } });
  const c = await prisma.ticketComment.create({ data: { ticketId: req.params.id, body, authorId: req.user!.id, authorName: req.user!.name } });
  await recordEvent('ticket', req.params.id, req.user, 'comentário interno adicionado');
  res.status(201).json(c);
}));

ticketsRouter.delete('/:id', wrap(async (req, res) => {
  if (req.user!.role !== 'ADMIN') throw new HttpError(403, 'Somente administradores podem excluir chamados');
  await prisma.ticket.delete({ where: { id: req.params.id } });
  await prisma.historyEntry.deleteMany({ where: { entityType: 'ticket', entityId: req.params.id } });
  await audit(req, 'chamado_excluido', { entity: 'ticket', entityId: req.params.id });
  res.json({ ok: true });
}));
