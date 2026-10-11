import { Router } from 'express';
import { Prisma, TaskStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db';
import { HttpError, parse, wrap } from '../../lib/http';
import { addDays, endOfDay, parseDue, startOfDay } from '../../lib/dates';
import { audit, recordChanges, recordEvent } from '../../lib/audit';

export const tasksRouter = Router();

const STATUS = ['NOVA', 'PENDENTE', 'EM_ANDAMENTO', 'AGUARDANDO_RETORNO', 'CONCLUIDA', 'CANCELADA'] as const;
const PRIORITY = ['BAIXA', 'NORMAL', 'ALTA', 'CRITICA'] as const;
const CATEGORY = ['HARDWARE', 'SOFTWARE', 'REDE', 'INTERNET', 'SERVIDORES', 'SISTEMAS_EMPRESARIAIS', 'IMPRESSORAS', 'ACESSOS', 'EMAIL', 'TELEFONIA', 'COMPRAS', 'OUTROS'] as const;
const OPEN: TaskStatus[] = ['NOVA', 'PENDENTE', 'EM_ANDAMENTO', 'AGUARDANDO_RETORNO'];

const id = z.string().min(1).nullable().optional();
const dueField = z.string().nullable().optional();
const baseSchema = z.object({
  title: z.string().trim().min(2, 'Informe um título').max(200),
  description: z.string().max(5000).nullable().optional(),
  requesterId: id, companyId: id, branchId: id, assigneeId: id,
  category: z.enum(CATEGORY).optional(),
  priority: z.enum(PRIORITY).optional(),
  status: z.enum(STATUS).optional(),
  dueDate: dueField,
  notes: z.string().max(5000).nullable().optional(),
  sourceMessageId: z.string().optional(),
});

const include = {
  requester: { select: { id: true, name: true, phone: true, isDirector: true } },
  company: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
} satisfies Prisma.TaskInclude;

export function taskViewWhere(view: string, userId: string): Prisma.TaskWhereInput {
  const now = new Date();
  switch (view) {
    case 'minhas': return { assigneeId: userId, status: { in: OPEN } };
    case 'hoje': return { status: { in: OPEN }, dueDate: { gte: startOfDay(now), lte: endOfDay(now) } };
    case 'proximos': return { status: { in: OPEN }, dueDate: { gt: endOfDay(now), lte: endOfDay(addDays(now, 7)) } };
    case 'atrasadas': return { status: { in: OPEN }, dueDate: { lt: now } };
    case 'sem_prazo': return { status: { in: OPEN }, dueDate: null };
    case 'aguardando': return { status: 'AGUARDANDO_RETORNO' };
    case 'concluidas': return { status: 'CONCLUIDA' };
    default: return {};
  }
}

tasksRouter.get('/', wrap(async (req, res) => {
  const q = z.object({
    view: z.string().default('todas'),
    q: z.string().optional(),
    status: z.enum(STATUS).optional(),
    priority: z.enum(PRIORITY).optional(),
    companyId: z.string().optional(),
    branchId: z.string().optional(),
    requesterId: z.string().optional(),
  }).parse(req.query);
  const where: Prisma.TaskWhereInput = {
    AND: [
      taskViewWhere(q.view, req.user!.id),
      {
        status: q.status, priority: q.priority, companyId: q.companyId, branchId: q.branchId, requesterId: q.requesterId,
        ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }] } : {}),
      },
    ],
  };
  const tasks = await prisma.task.findMany({ where, include, take: 500 });
  const rank = { CRITICA: 0, ALTA: 1, NORMAL: 2, BAIXA: 3 } as const;
  tasks.sort((a, b) => {
    const da = a.dueDate?.getTime() ?? Infinity, db = b.dueDate?.getTime() ?? Infinity;
    return rank[a.priority] - rank[b.priority] || da - db || a.number - b.number;
  });
  res.json(tasks);
}));

tasksRouter.get('/:id', wrap(async (req, res) => {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: req.params.id }, include: { ...include, messages: { include: { conversation: { select: { title: true, remoteJid: true } } } } } });
  const history = await prisma.historyEntry.findMany({ where: { entityType: 'task', entityId: task.id }, orderBy: { createdAt: 'desc' } });
  res.json({ ...task, history });
}));

tasksRouter.post('/', wrap(async (req, res) => {
  const { sourceMessageId, dueDate, ...d } = parse(baseSchema, req.body);
  let due: Date | null = null;
  try { due = parseDue(dueDate); } catch { throw new HttpError(400, 'Prazo inválido'); }
  const status = d.status ?? 'NOVA';
  const task = await prisma.task.create({
    data: { ...d, status, dueDate: due, completedAt: status === 'CONCLUIDA' ? new Date() : null },
    include,
  });
  if (sourceMessageId) {
    await prisma.message.update({ where: { id: sourceMessageId }, data: { taskId: task.id, processing: 'CONVERTIDA', analyzedAt: new Date() } });
  }
  await recordEvent('task', task.id, req.user, sourceMessageId ? 'criada a partir de mensagem do WhatsApp' : 'criada');
  await audit(req, 'tarefa_criada', { entity: 'task', entityId: task.id, detail: task.title });
  res.status(201).json(task);
}));

tasksRouter.patch('/:id', wrap(async (req, res) => {
  const { sourceMessageId: _s, dueDate, ...d } = parse(baseSchema.partial(), req.body);
  const before = await prisma.task.findUniqueOrThrow({ where: { id: req.params.id } });
  const data: Prisma.TaskUncheckedUpdateInput = { ...d };
  if (dueDate !== undefined) {
    try { data.dueDate = parseDue(dueDate); } catch { throw new HttpError(400, 'Prazo inválido'); }
  }
  if (d.status && d.status !== before.status) {
    data.completedAt = d.status === 'CONCLUIDA' ? new Date() : null;
  }
  const after = await prisma.task.update({ where: { id: before.id }, data, include });
  await recordChanges('task', before.id, req.user, before, after,
    ['title', 'description', 'status', 'priority', 'dueDate', 'assigneeId', 'requesterId', 'companyId', 'branchId', 'category', 'notes']);
  res.json(after);
}));

tasksRouter.delete('/:id', wrap(async (req, res) => {
  if (req.user!.role !== 'ADMIN') throw new HttpError(403, 'Somente administradores podem excluir tarefas');
  await prisma.task.delete({ where: { id: req.params.id } });
  await prisma.historyEntry.deleteMany({ where: { entityType: 'task', entityId: req.params.id } });
  await audit(req, 'tarefa_excluida', { entity: 'task', entityId: req.params.id });
  res.json({ ok: true });
}));
