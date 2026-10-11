import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { parse, wrap } from '../../lib/http';
import { requireRole } from '../../middleware/auth';
import { getSetting, setSetting } from '../../lib/settings';
import { config } from '../../config';

export const adminRouter = Router();

adminRouter.get('/search', wrap(async (req, res) => {
  const q = (typeof req.query.q === 'string' ? req.query.q : '').trim();
  if (q.length < 2) return res.json({ tasks: [], tickets: [], contacts: [], messages: [], quotes: [] });
  const ci = { contains: q, mode: 'insensitive' as const };
  const num = /^\d+$/.test(q) ? Number(q) : undefined;
  const [tasks, tickets, contacts, messages, quotes] = await Promise.all([
    prisma.task.findMany({ where: { OR: [{ title: ci }, ...(num ? [{ number: num }] : [])] }, take: 5, select: { id: true, number: true, title: true, status: true } }),
    prisma.ticket.findMany({ where: { OR: [{ title: ci }, ...(num ? [{ number: num }] : [])] }, take: 5, select: { id: true, number: true, title: true, status: true } }),
    prisma.contact.findMany({ where: { OR: [{ name: ci }, { email: ci }] }, take: 5, select: { id: true, name: true } }),
    prisma.message.findMany({ where: { body: ci }, take: 5, orderBy: { sentAt: 'desc' }, select: { id: true, body: true, sentAt: true } }),
    prisma.quoteRequest.findMany({ where: { OR: [{ product: ci }, ...(num ? [{ number: num }] : [])] }, take: 5, select: { id: true, number: true, product: true, status: true } }),
  ]);
  res.json({ tasks, tickets, contacts, messages, quotes });
}));

adminRouter.get('/team', wrap(async (_req, res) => res.json(await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }))));

adminRouter.get('/notifications', wrap(async (_req, res) => res.json(await prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }))));
adminRouter.post('/notifications/read-all', wrap(async (_req, res) => { await prisma.notification.updateMany({ where: { read: false }, data: { read: true } }); res.json({ ok: true }); }));

adminRouter.get('/audit', requireRole('ADMIN'), wrap(async (_req, res) => res.json(await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }))));

adminRouter.get('/settings', requireRole('ADMIN'), wrap(async (_req, res) => {
  res.json({ retentionDays: await getSetting('retentionDays', config.RETENTION_MESSAGE_DAYS) });
}));
adminRouter.put('/settings', requireRole('ADMIN'), wrap(async (req, res) => {
  const { retentionDays } = parse(z.object({ retentionDays: z.number().int().min(7).max(3650) }), req.body);
  await setSetting('retentionDays', retentionDays);
  res.json({ retentionDays });
}));
