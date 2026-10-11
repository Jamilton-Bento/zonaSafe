import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db';
import { HttpError, parse, wrap } from '../../lib/http';
import { audit, recordEvent } from '../../lib/audit';
import { requireRole } from '../../middleware/auth';

export const messagesRouter = Router();

const include = {
  conversation: { select: { id: true, title: true, remoteJid: true, isGroup: true, contact: { select: { id: true, name: true, company: { select: { name: true } } } } } },
  task: { select: { id: true, number: true, title: true, status: true } },
  ticket: { select: { id: true, number: true, title: true, status: true } },
  aiAnalysis: { select: { id: true, status: true, intent: true, confidence: true, summary: true, action: true, error: true } },
} satisfies Prisma.MessageInclude;

messagesRouter.get('/', wrap(async (req, res) => {
  const q = z.object({
    q: z.string().optional(), contactId: z.string().optional(), conversationId: z.string().optional(),
    group: z.enum(['1', '0']).optional(),
    from: z.string().optional(), to: z.string().optional(),
    processing: z.enum(['PENDENTE', 'ANALISADA', 'IGNORADA', 'CONVERTIDA']).optional(),
    page: z.coerce.number().int().min(1).default(1),
  }).parse(req.query);
  const where: Prisma.MessageWhereInput = {
    processing: q.processing,
    conversationId: q.conversationId,
    conversation: { contactId: q.contactId, isGroup: q.group ? q.group === '1' : undefined },
    sentAt: {
      gte: q.from ? new Date(`${q.from}T00:00:00`) : undefined,
      lte: q.to ? new Date(`${q.to}T23:59:59.999`) : undefined,
    },
    ...(q.q ? { OR: [{ body: { contains: q.q, mode: 'insensitive' } }, { senderName: { contains: q.q, mode: 'insensitive' } }, { conversation: { title: { contains: q.q, mode: 'insensitive' } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.message.findMany({ where, include, orderBy: { sentAt: 'desc' }, take: 50, skip: (q.page - 1) * 50 }),
    prisma.message.count({ where }),
  ]);
  res.json({ items, total, page: q.page, pageSize: 50 });
}));

messagesRouter.get('/conversations', wrap(async (_req, res) => {
  res.json(await prisma.conversation.findMany({ orderBy: { lastMessageAt: 'desc' }, take: 200, select: { id: true, title: true, isGroup: true, remoteJid: true } }));
}));

messagesRouter.get('/:id', wrap(async (req, res) => {
  res.json(await prisma.message.findUniqueOrThrow({ where: { id: req.params.id }, include }));
}));

messagesRouter.patch('/:id', wrap(async (req, res) => {
  const d = parse(z.object({
    processing: z.enum(['ANALISADA', 'IGNORADA', 'PENDENTE']).optional(),
    taskId: z.string().nullable().optional(),
    ticketId: z.string().nullable().optional(),
  }), req.body);
  const msg = await prisma.message.findUniqueOrThrow({ where: { id: req.params.id } });
  const linking = d.taskId || d.ticketId;
  const updated = await prisma.message.update({
    where: { id: msg.id },
    data: {
      ...d,
      ...(linking ? { processing: 'CONVERTIDA' } : {}),
      ...(d.processing === 'ANALISADA' || d.processing === 'IGNORADA' || linking ? { analyzedAt: new Date() } : {}),
    },
    include,
  });
  if (d.taskId) await recordEvent('task', d.taskId, req.user, 'mensagem do WhatsApp vinculada');
  if (d.ticketId) await recordEvent('ticket', d.ticketId, req.user, 'mensagem do WhatsApp vinculada');
  res.json(updated);
}));

// Exclusão (política de retenção): somente administradores
messagesRouter.delete('/:id', requireRole('ADMIN'), wrap(async (req, res) => {
  await prisma.message.delete({ where: { id: req.params.id } });
  await audit(req, 'mensagem_excluida', { entity: 'message', entityId: req.params.id });
  res.json({ ok: true });
}));

/** Remove mensagens antigas que não estão vinculadas a tarefas/chamados. */
export async function purgeOldMessages(days: number) {
  const cutoff = new Date(Date.now() - days * 86400_000);
  const m = await prisma.message.deleteMany({ where: { sentAt: { lt: cutoff }, taskId: null, ticketId: null } });
  const w = await prisma.webhookEvent.deleteMany({ where: { receivedAt: { lt: new Date(Date.now() - 30 * 86400_000) } } });
  return { messages: m.count, webhookEvents: w.count };
}

messagesRouter.post('/purge', requireRole('ADMIN'), wrap(async (req, res) => {
  const { days } = parse(z.object({ days: z.number().int().min(7).max(3650) }), req.body);
  if (days < 7) throw new HttpError(400, 'Mínimo de 7 dias');
  const r = await purgeOldMessages(days);
  await audit(req, 'retencao_executada', { detail: `${days} dias: ${r.messages} mensagens` });
  res.json(r);
}));
