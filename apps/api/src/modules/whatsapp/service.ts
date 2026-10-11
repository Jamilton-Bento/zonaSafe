import { config } from '../../config';
import { prisma } from '../../db';
import { logger } from '../../lib/logger';
import { EvolutionClient, EvolutionError, EvolutionTransport } from './client';
import { clearQr, getQr, loadState, patchState, recordError, setQr, WaState } from './state';

let transport: EvolutionTransport = new EvolutionClient();
/** Somente para testes automatizados (eventos/respostas SIMULADOS). */
export function setTransport(t: EvolutionTransport) { transport = t; }

let lastConnectAttempt = 0;
const connectAttempts: number[] = [];

const mapState = (s: string): WaState['connection'] =>
  s === 'open' ? 'open' : s === 'connecting' ? 'connecting' : s === 'close' ? 'close' : 'unknown';

export async function refreshState(): Promise<{ state: WaState; apiReachable: boolean }> {
  try {
    const raw = await transport.connectionState();
    const conn = mapState(raw);
    const prev = await loadState();
    const patch: Partial<WaState> = { connection: conn, confirmedAt: new Date().toISOString() };
    if (conn === 'open' && prev.connection !== 'open') patch.lastConnectedAt = new Date().toISOString();
    if (conn === 'open') clearQr();
    return { state: await patchState(patch), apiReachable: true };
  } catch (e) {
    const msg = (e as Error).message;
    logger.warn('falha ao consultar estado da Evolution API', { err: msg });
    // Estado desconhecido: não afirmamos conexão sem confirmação da API.
    const state = await patchState({ connection: 'unknown', lastError: msg.slice(0, 300), lastErrorAt: new Date().toISOString() });
    return { state, apiReachable: false };
  }
}

/** Cria a instância (se não existir) e configura o webhook autenticado. */
export async function ensureInstance(): Promise<{ created: boolean }> {
  if (!config.WEBHOOK_SECRET || config.WEBHOOK_SECRET.length < 24) throw new EvolutionError('WEBHOOK_SECRET ausente ou curto demais (mín. 24 caracteres)');
  let created = false;
  if (!(await transport.instanceExists())) {
    await transport.createInstance();
    created = true;
  }
  await transport.setWebhook(config.WEBHOOK_PUBLIC_URL, config.WEBHOOK_SECRET);
  return { created };
}

/** Reconexão controlada: intervalo mínimo e no máximo 5 tentativas por hora. */
export async function requestQr(): Promise<{ qr: { base64: string; expiresInSeconds: number } | null; pairingCode?: string }> {
  const now = Date.now();
  if (now - lastConnectAttempt < config.WA_CONNECT_COOLDOWN_MS) {
    const cached = getQr();
    if (cached) return { qr: { base64: cached.base64, expiresInSeconds: Math.round((cached.expiresAt - now) / 1000) } };
    throw new EvolutionError(`Aguarde ${Math.ceil((config.WA_CONNECT_COOLDOWN_MS - (now - lastConnectAttempt)) / 1000)}s antes de gerar outro QR Code`, 429);
  }
  while (connectAttempts.length && connectAttempts[0] < now - 3600_000) connectAttempts.shift();
  if (connectAttempts.length >= 5) throw new EvolutionError('Limite de 5 tentativas de conexão por hora atingido. Aguarde antes de tentar novamente.', 429);
  lastConnectAttempt = now;
  connectAttempts.push(now);
  const r = await transport.connect();
  if (!r.base64) {
    // Sem QR: ou já está conectado ou a API ainda está iniciando a sessão.
    return { qr: null, pairingCode: r.pairingCode };
  }
  setQr(r.base64);
  return { qr: { base64: r.base64, expiresInSeconds: 45 }, pairingCode: r.pairingCode };
}

export async function disconnect() {
  await transport.logout();
  clearQr();
  await patchState({ connection: 'close', confirmedAt: new Date().toISOString() });
}

export async function setPaused(paused: boolean, reason: string | null = null) {
  return patchState({ paused, pausedReason: paused ? reason : null, ...(paused ? {} : { consecutiveFailures: 0 }) });
}

// ---------------- Envio autorizado ----------------
let lastSendAt = 0;

export class SendBlocked extends Error {}

/**
 * Único ponto de envio de mensagens. Aplica: pausa global, exigência de conexão
 * confirmada, intervalo mínimo, teto diário e disjuntor após falhas consecutivas.
 */
export async function sendText(number: string, text: string, ctx: { reason: string }): Promise<void> {
  const digits = number.replace(/[^\d]/g, '');
  const target = number.includes('@g.us') ? number : digits;
  if (!target) throw new SendBlocked('Destinatário inválido');
  let st = await loadState();
  if (st.paused) throw new SendBlocked(`Envio automático pausado${st.pausedReason ? `: ${st.pausedReason}` : ''}`);
  if (st.connection !== 'open') throw new SendBlocked('WhatsApp não está conectado (estado não confirmado pela API)');
  const today = new Date().toISOString().slice(0, 10);
  const count = st.sendsToday.date === today ? st.sendsToday.count : 0;
  if (count >= config.WA_MAX_SENDS_PER_DAY) throw new SendBlocked(`Limite diário de ${config.WA_MAX_SENDS_PER_DAY} envios atingido`);
  const wait = config.WA_MIN_SEND_INTERVAL_MS - (Date.now() - lastSendAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSendAt = Date.now();
  try {
    await transport.sendText(target, text);
    st = await patchState({ consecutiveFailures: 0, sendsToday: { date: today, count: count + 1 } });
  } catch (e) {
    const failures = st.consecutiveFailures + 1;
    const tripped = failures >= config.WA_MAX_CONSECUTIVE_FAILURES;
    await patchState({
      consecutiveFailures: failures,
      lastError: (e as Error).message.slice(0, 300),
      lastErrorAt: new Date().toISOString(),
      ...(tripped ? { paused: true, pausedReason: `${failures} falhas seguidas de envio — verifique a conexão antes de retomar` } : {}),
    });
    if (tripped) {
      await prisma.notification.create({ data: { kind: 'whatsapp', title: 'Envios do WhatsApp pausados', body: `${failures} falhas consecutivas (${ctx.reason}). Verifique a integração.`, link: '/whatsapp' } });
    }
    throw e;
  }
}

export async function publicStatus() {
  const { state, apiReachable } = await refreshState();
  const qr = getQr();
  return {
    ...state,
    apiReachable,
    qr: qr && state.connection !== 'open' ? { base64: qr.base64, expiresInSeconds: Math.max(0, Math.round((qr.expiresAt - Date.now()) / 1000)) } : null,
  };
}
