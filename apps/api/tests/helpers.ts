import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { EvolutionTransport } from '../src/modules/whatsapp/client';
import { setTransport } from '../src/modules/whatsapp/service';

export const app = createApp();
export const PASSWORD = 'SenhaForte#2026';

export async function resetDb() {
  const tables = ['"HistoryEntry"', '"Message"', '"Conversation"', '"WebhookEvent"', '"TicketComment"', '"Ticket"', '"Task"', '"QuoteApproval"', '"QuoteOffer"', '"QuoteRequest"', '"ReportRun"', '"ReportSchedule"', '"Contact"', '"Branch"', '"Company"', '"Supplier"', '"Notification"', '"AuditLog"', '"Setting"', '"User"'];
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.join(',')} RESTART IDENTITY CASCADE`);
}

export async function mkUser(role: 'ADMIN' | 'TECNICO' | 'LEITOR', email = `${role.toLowerCase()}@teste.local`) {
  return prisma.user.create({ data: { name: `Usuário ${role}`, email, role, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
}

export async function login(role: 'ADMIN' | 'TECNICO' | 'LEITOR') {
  const email = `${role.toLowerCase()}@teste.local`;
  if (!(await prisma.user.findUnique({ where: { email } }))) await mkUser(role, email);
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  if (r.status !== 200) throw new Error('login de teste falhou: ' + JSON.stringify(r.body));
  return agent;
}

/** Transporte SIMULADO da Evolution API — usado exclusivamente nos testes automatizados. */
export class FakeTransport implements EvolutionTransport {
  state = 'close';
  reachable = true;
  sent: { number: string; text: string }[] = [];
  failSend = false;
  qrCalls = 0;
  loggedOut = 0;
  created = 0;
  webhookSet: { url: string; secret: string } | null = null;
  exists = false;
  private guard() { if (!this.reachable) throw new Error('Evolution API indisponível (simulado)'); }
  async connectionState() { this.guard(); return this.state; }
  async connect() { this.guard(); this.qrCalls++; return { base64: 'data:image/png;base64,QRSIMULADO', count: 1 }; }
  async logout() { this.guard(); this.loggedOut++; this.state = 'close'; }
  async restart() { this.guard(); }
  async createInstance() { this.guard(); this.created++; this.exists = true; }
  async setWebhook(url: string, secret: string) { this.guard(); this.webhookSet = { url, secret }; }
  async instanceExists() { this.guard(); return this.exists; }
  async sendText(number: string, text: string) {
    this.guard();
    if (this.failSend) throw new Error('falha simulada de envio');
    this.sent.push({ number, text });
    return { id: 'SIM' + this.sent.length };
  }
}
export function useFakeTransport() {
  const t = new FakeTransport();
  setTransport(t);
  return t;
}

export const WEBHOOK_HEADERS = { 'x-webhook-secret': process.env.WEBHOOK_SECRET! };

/** Evento SIMULADO no formato do webhook da Evolution API v2 (somente testes). */
export function simulatedUpsert(id: string, text: string, opts: { jid?: string; fromMe?: boolean; participant?: string; ts?: number } = {}) {
  return {
    event: 'messages.upsert',
    instance: process.env.EVOLUTION_INSTANCE,
    data: {
      key: { remoteJid: opts.jid ?? '5511988887777@s.whatsapp.net', fromMe: opts.fromMe ?? false, id, ...(opts.participant ? { participant: opts.participant } : {}) },
      pushName: 'Fulano Simulado',
      message: { conversation: text },
      messageType: 'conversation',
      messageTimestamp: opts.ts ?? Math.floor(Date.now() / 1000),
    },
    date_time: new Date().toISOString(),
    apikey: 'nao-deve-ser-gravada',
  };
}

export async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, ms = 3000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v as T;
    if (Date.now() > end) throw new Error('timeout aguardando condição');
    await new Promise((r) => setTimeout(r, 25));
  }
}
