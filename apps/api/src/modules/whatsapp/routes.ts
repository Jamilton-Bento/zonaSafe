import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { config } from '../../config';
import { HttpError, parse, wrap } from '../../lib/http';
import { audit } from '../../lib/audit';
import { requireRole } from '../../middleware/auth';
import { EvolutionError } from './client';
import * as svc from './service';
import { processEvent } from './webhook';

export const whatsappRouter = Router();
const admin = requireRole('ADMIN');

const asHttp = (e: unknown) => {
  if (e instanceof svc.SendBlocked) return new HttpError(409, e.message);
  if (e instanceof EvolutionError) return new HttpError(e.status === 429 ? 429 : 502, e.message);
  return e;
};

whatsappRouter.get('/status', wrap(async (req, res) => {
  const st = await svc.publicStatus();
  // O QR Code só é entregue a administradores.
  res.json({ ...st, qr: req.user!.role === 'ADMIN' ? st.qr : null, webhookConfigured: !!config.WEBHOOK_SECRET, apiKeyConfigured: !!config.EVOLUTION_API_KEY });
}));

whatsappRouter.post('/instance/ensure', admin, wrap(async (req, res) => {
  try {
    const r = await svc.ensureInstance();
    await audit(req, 'whatsapp_instancia_configurada', { detail: r.created ? 'criada' : 'já existia; webhook atualizado' });
    res.json(r);
  } catch (e) { throw asHttp(e); }
}));

whatsappRouter.post('/qr', admin, wrap(async (req, res) => {
  try {
    const r = await svc.requestQr();
    await audit(req, 'whatsapp_qr_solicitado');
    res.json(r);
  } catch (e) { throw asHttp(e); }
}));

whatsappRouter.post('/disconnect', admin, wrap(async (req, res) => {
  try { await svc.disconnect(); } catch (e) { throw asHttp(e); }
  await audit(req, 'whatsapp_desconectado');
  res.json({ ok: true });
}));

whatsappRouter.post('/pause', admin, wrap(async (req, res) => {
  const { paused, reason } = parse(z.object({ paused: z.boolean(), reason: z.string().max(200).optional() }), req.body);
  const st = await svc.setPaused(paused, reason ?? 'pausado manualmente');
  await audit(req, paused ? 'whatsapp_envio_pausado' : 'whatsapp_envio_retomado');
  res.json({ paused: st.paused });
}));

whatsappRouter.post('/send-test', admin, wrap(async (req, res) => {
  const { to } = parse(z.object({ to: z.string().min(8) }), req.body);
  try {
    await svc.sendText(to, 'Teste da Central de TI: esta mensagem confirma que o envio está configurado.', { reason: 'teste manual' });
  } catch (e) { throw asHttp(e); }
  await audit(req, 'whatsapp_envio_teste', { detail: to.replace(/\d(?=\d{4})/g, '*') });
  res.json({ ok: true });
}));

whatsappRouter.get('/events', admin, wrap(async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const rows = await prisma.webhookEvent.findMany({
    where: { status: status as any }, orderBy: { receivedAt: 'desc' }, take: 100,
    select: { id: true, event: true, status: true, error: true, attempts: true, receivedAt: true, processedAt: true },
  });
  res.json(rows);
}));

whatsappRouter.post('/events/:id/reprocess', admin, wrap(async (req, res) => {
  const ev = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: req.params.id } });
  if (ev.status !== 'FALHA') throw new HttpError(400, 'Somente eventos com falha podem ser reprocessados');
  if (ev.attempts >= 5) throw new HttpError(400, 'Limite de 5 tentativas atingido para este evento');
  await processEvent(ev.id);
  const after = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: ev.id } });
  res.json({ status: after.status, error: after.error });
}));
