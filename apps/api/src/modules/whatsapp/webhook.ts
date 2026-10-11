import { Request, Response, Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { config } from '../../config';
import { prisma } from '../../db';
import { logger } from '../../lib/logger';
import { wrap } from '../../lib/http';
import { patchState, setQr } from './state';

/** Normaliza "messages.upsert" / "MESSAGES-UPSERT" => "MESSAGES_UPSERT". */
export const normEvent = (e: string) => e.replace(/[.\-]/g, '_').toUpperCase();

const envelope = z.object({
  event: z.string().min(1),
  instance: z.string().min(1),
  data: z.any(),
  date_time: z.string().optional(),
}).passthrough();

export function secretOk(received: unknown): boolean {
  if (typeof received !== 'string' || !config.WEBHOOK_SECRET) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(config.WEBHOOK_SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Chave de idempotência: evento + instância + id da mensagem (quando houver). */
export function dedupeKey(event: string, instance: string, data: any): string {
  const item = Array.isArray(data?.messages) ? data.messages[0] : data;
  const msgId = item?.key?.id ?? item?.keyId ?? item?.messageId;
  if (msgId) {
    // Edição/atualização da mesma mensagem tem marca de tempo/status próprios
    const extra = event === 'MESSAGES_EDITED' || event === 'MESSAGES_UPDATE'
      ? `:${item?.messageTimestamp ?? item?.status ?? item?.message?.editedMessage?.message?.protocolMessage?.timestampMs ?? ''}` : '';
    return `${event}:${instance}:${msgId}${extra}`;
  }
  if (event === 'CONNECTION_UPDATE') {
    return `${event}:${instance}:${data?.state}:${data?.date_time ?? crypto.createHash('sha1').update(JSON.stringify(data ?? {})).digest('hex').slice(0, 12)}`;
  }
  return `${event}:${instance}:${crypto.createHash('sha1').update(JSON.stringify(data ?? {})).digest('hex')}`;
}

export const webhookRouter = Router();

webhookRouter.post('/evolution', wrap(async (req: Request, res: Response) => {
  // 1) Autenticidade
  if (!secretOk(req.header('x-webhook-secret'))) {
    logger.warn('webhook rejeitado: segredo inválido', { ip: req.ip });
    return res.status(401).json({ error: 'não autorizado' });
  }
  // 2) Formato
  const parsed = envelope.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'evento inválido' });
  const { event: rawEvent, instance, data } = parsed.data;
  if (instance !== config.EVOLUTION_INSTANCE) return res.status(202).json({ ignored: 'instância desconhecida' });

  const event = normEvent(rawEvent);
  const key = dedupeKey(event, instance, data);
  // 3) Idempotência: o registro único é o próprio controle
  try {
    const row = await prisma.webhookEvent.create({
      data: { dedupeKey: key, event, instance, payload: sanitizePayload(parsed.data) as Prisma.InputJsonValue },
    });
    // 4) Resposta rápida; processamento assíncrono
    res.status(202).json({ accepted: true });
    setImmediate(() => { processEvent(row.id).catch((e) => logger.error('falha no processamento assíncrono', { err: String(e) })); });
  } catch (e: any) {
    if (e?.code === 'P2002') return res.status(200).json({ duplicate: true });
    throw e;
  }
}));

/** Remove a apikey do corpo antes de gravar o payload. */
function sanitizePayload(p: Record<string, unknown>) {
  const { apikey: _a, ...rest } = p as any;
  return rest;
}

// ---------------------------------------------------------------------------
import { processEventPayload } from './processor';

export async function processEvent(id: string): Promise<void> {
  const row = await prisma.webhookEvent.findUnique({ where: { id } });
  if (!row || row.status === 'PROCESSADO' || row.status === 'IGNORADO') return;
  try {
    const result = await processEventPayload(row.event, row.payload as any);
    await prisma.webhookEvent.update({
      where: { id },
      data: { status: result === 'ignored' ? 'IGNORADO' : 'PROCESSADO', processedAt: new Date(), attempts: { increment: 1 }, error: null },
    });
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    logger.error('falha ao processar evento', { event: row.event, err: msg });
    await prisma.webhookEvent.update({ where: { id }, data: { status: 'FALHA', error: msg, attempts: { increment: 1 } } });
    await patchState({ lastError: `Webhook ${row.event}: ${msg}`.slice(0, 300), lastErrorAt: new Date().toISOString() });
  }
}

/** Reprocessa eventos recebidos que ficaram pendentes (ex.: queda do back-end). */
export async function recoverPending() {
  const stale = await prisma.webhookEvent.findMany({
    where: { status: 'RECEBIDO', receivedAt: { lt: new Date(Date.now() - 30_000) } }, take: 100,
  });
  for (const ev of stale) await processEvent(ev.id);
  return stale.length;
}

export { setQr };
