import { z } from 'zod';

const bool = (def: 'true' | 'false') => z.enum(['true', 'false']).default(def).transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter ao menos 32 caracteres'),
  COOKIE_SECURE: bool('false'),
  CORS_ORIGIN: z.string().default('http://localhost:8081'),
  EVOLUTION_API_URL: z.string().default('http://evolution-api:8080'),
  EVOLUTION_API_KEY: z.string().default(''),
  EVOLUTION_INSTANCE: z.string().default('central-ti'),
  // URL que a Evolution API (outro contêiner) usa para chamar este back-end
  WEBHOOK_PUBLIC_URL: z.string().default('http://api:3001/api/webhooks/evolution'),
  WEBHOOK_SECRET: z.string().default(''),
  // Limites de envio (proteção contra bloqueio / envio excessivo)
  WA_MIN_SEND_INTERVAL_MS: z.coerce.number().default(5000),
  WA_MAX_SENDS_PER_DAY: z.coerce.number().default(50),
  WA_MAX_CONSECUTIVE_FAILURES: z.coerce.number().default(3),
  WA_CONNECT_COOLDOWN_MS: z.coerce.number().default(30000),
  RETENTION_MESSAGE_DAYS: z.coerce.number().default(180),
  ENABLE_SCHEDULER: bool('true'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuração inválida: ${msg}`);
  }
  return parsed.data;
}

export const config: Config = loadConfig();
