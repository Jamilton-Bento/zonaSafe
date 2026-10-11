import { config } from '../../config';
import { getSetting, setSetting } from '../../lib/settings';

export interface WaState {
  instance: string;
  connection: 'open' | 'connecting' | 'close' | 'unknown';
  confirmedAt: string | null;      // última vez em que a API confirmou o estado
  lastConnectedAt: string | null;
  lastMessageAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  paused: boolean;
  pausedReason: string | null;
  consecutiveFailures: number;
  sendsToday: { date: string; count: number };
}

const KEY = 'whatsapp.state';
const blank = (): WaState => ({
  instance: config.EVOLUTION_INSTANCE, connection: 'unknown', confirmedAt: null, lastConnectedAt: null,
  lastMessageAt: null, lastError: null, lastErrorAt: null, paused: false, pausedReason: null,
  consecutiveFailures: 0, sendsToday: { date: '', count: 0 },
});

export async function loadState(): Promise<WaState> {
  return { ...blank(), ...(await getSetting<Partial<WaState>>(KEY, {})) };
}
export async function patchState(patch: Partial<WaState>): Promise<WaState> {
  const s = { ...(await loadState()), ...patch };
  await setSetting(KEY, s);
  return s;
}
export async function recordError(msg: string) {
  return patchState({ lastError: msg.slice(0, 300), lastErrorAt: new Date().toISOString() });
}

/** QR Code: mantido SOMENTE em memória, com expiração curta. Nunca vai ao banco. */
let qr: { base64: string; expiresAt: number } | null = null;
export const QR_TTL_MS = 45_000;
export function setQr(base64: string) { qr = { base64, expiresAt: Date.now() + QR_TTL_MS }; }
export function clearQr() { qr = null; }
export function getQr() {
  if (qr && qr.expiresAt < Date.now()) qr = null;
  return qr;
}
