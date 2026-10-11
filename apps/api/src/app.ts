import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { errorHandler } from './lib/http';
import { authenticate, readOnlyForLeitor, requireRole } from './middleware/auth';
import { authRouter, usersRouter } from './modules/auth/routes';
import { orgsRouter } from './modules/orgs/routes';
import { tasksRouter } from './modules/tasks/routes';
import { ticketsRouter } from './modules/tickets/routes';
import { dashboardRouter } from './modules/dashboard/routes';
import { messagesRouter } from './modules/messages/routes';
import { whatsappRouter } from './modules/whatsapp/routes';
import { webhookRouter } from './modules/whatsapp/webhook';
import { quotesRouter } from './modules/quotes/routes';
import { reportsRouter } from './modules/reports/routes';
import { adminRouter } from './modules/admin/routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // atrás do nginx do front-end
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN.split(','), credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    try {
      const { prisma } = await import('./db');
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', db: 'ok' });
    } catch {
      res.status(503).json({ status: 'erro', db: 'indisponível' });
    }
  });

  // Webhook: autenticado por segredo compartilhado (não usa cookie de sessão)
  app.use('/api/webhooks', rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }), webhookRouter);

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);

  const priv = express.Router();
  priv.use(authenticate, readOnlyForLeitor);
  priv.use(rateLimit({ windowMs: 60_000, limit: process.env.NODE_ENV === 'test' ? 10000 : 600, standardHeaders: true, legacyHeaders: false }));
  priv.use('/dashboard', dashboardRouter);
  priv.use('/tasks', tasksRouter);
  priv.use('/tickets', ticketsRouter);
  priv.use('/messages', messagesRouter);
  priv.use('/quotes', quotesRouter);
  priv.use('/reports', reportsRouter);
  priv.use('/whatsapp', requireRole('ADMIN', 'TECNICO'), whatsappRouter);
  priv.use('/', orgsRouter);
  priv.use('/', adminRouter);
  app.use('/api', priv);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
  app.use(errorHandler);
  return app;
}
