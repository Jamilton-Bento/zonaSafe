import { createApp } from './app';
import { config } from './config';
import { prisma } from './db';
import { logger } from './lib/logger';
import { startScheduler } from './modules/reports/scheduler';
import { recoverPending } from './modules/whatsapp/webhook';

async function main() {
  await prisma.$connect();
  const app = createApp();
  const server = app.listen(config.PORT, () => logger.info(`API ouvindo na porta ${config.PORT}`));
  if (config.ENABLE_SCHEDULER) startScheduler();
  recoverPending().catch(() => undefined);
  const stop = async () => { server.close(); await prisma.$disconnect(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
main().catch((e) => { console.error('Falha ao iniciar:', e.message); process.exit(1); });
