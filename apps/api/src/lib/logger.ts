// Logger simples em JSON; nunca registre segredos (apikey, senhas, tokens).
const SENSITIVE = /(apikey|api_key|password|senha|secret|token|authorization|cookie)/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? '[oculto]' : scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: string, msg: string, extra?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'test' && level !== 'error') return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(scrub(extra) as object) });
  (level === 'error' ? console.error : console.log)(line);
}

export const logger = {
  info: (msg: string, extra?: Record<string, unknown>) => emit('info', msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => emit('warn', msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => emit('error', msg, extra),
};
