import { beforeEach, describe, expect, it, afterAll } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/db';
import { app, login, resetDb, simulatedUpsert, useFakeTransport, waitFor, WEBHOOK_HEADERS, FakeTransport } from './helpers';
import { loadState } from '../src/modules/whatsapp/state';

let fake: FakeTransport;
beforeEach(async () => { await resetDb(); fake = useFakeTransport(); });
afterAll(() => prisma.$disconnect());

const post = (body: unknown, headers: Record<string, string> = WEBHOOK_HEADERS) =>
  request(app).post('/api/webhooks/evolution').set(headers).send(body as object);

describe('Webhooks (eventos SIMULADOS)', () => {
  it('rejeita eventos sem segredo ou com segredo errado', async () => {
    const ev = simulatedUpsert('A1', 'olá');
    expect((await post(ev, {})).status).toBe(401);
    expect((await post(ev, { 'x-webhook-secret': 'errado' })).status).toBe(401);
    expect(await prisma.webhookEvent.count()).toBe(0);
    expect(await prisma.message.count()).toBe(0);
  });
  it('rejeita payload malformado e ignora instância desconhecida', async () => {
    expect((await post({ foo: 'bar' })).status).toBe(400);
    const other = { ...simulatedUpsert('A2', 'x'), instance: 'outra' };
    expect((await post(other)).status).toBe(202);
    expect(await prisma.webhookEvent.count()).toBe(0);
  });
  it('processa mensagem de texto, cria conversa e não grava a apikey', async () => {
    await prisma.contact.create({ data: { name: 'João Cadastrado', phone: '5511988887777' } });
    const r = await post(simulatedUpsert('MSG1', 'Preciso de ajuda com a impressora'));
    expect(r.status).toBe(202);
    const m = await waitFor(() => prisma.message.findFirst({ where: { externalId: 'MSG1' }, include: { conversation: true } }));
    expect(m.body).toBe('Preciso de ajuda com a impressora');
    expect(m.type).toBe('text');
    expect(m.direction).toBe('ENTRADA');
    expect(m.processing).toBe('PENDENTE');
    expect(m.conversation.title).toBe('João Cadastrado');
    expect(m.conversation.contactId).toBeTruthy();
    const ev = await prisma.webhookEvent.findFirstOrThrow();
    expect(JSON.stringify(ev.payload)).not.toContain('nao-deve-ser-gravada');
    await waitFor(async () => (await prisma.webhookEvent.findFirst({ where: { status: 'PROCESSADO' } })));
    expect((await loadState()).lastMessageAt).toBeTruthy();
  });
  it('previne duplicidade: o mesmo evento enviado várias vezes gera uma única mensagem', async () => {
    const ev = simulatedUpsert('DUP1', 'mensagem repetida');
    const results = await Promise.all([post(ev), post(ev), post(ev), post(ev)]);
    expect(results.filter((r) => r.status === 202)).toHaveLength(1);
    expect(results.filter((r) => r.status === 200 && r.body.duplicate)).toHaveLength(3);
    await waitFor(() => prisma.message.findFirst({ where: { externalId: 'DUP1' } }));
    await new Promise((r) => setTimeout(r, 200));
    expect(await prisma.message.count({ where: { externalId: 'DUP1' } })).toBe(1);
    expect(await prisma.webhookEvent.count()).toBe(1);
  });
  it('reentrega com formato de evento diferente (MESSAGES_UPSERT) continua idempotente no nível da mensagem', async () => {
    await post(simulatedUpsert('DUP2', 'oi'));
    await waitFor(() => prisma.message.findFirst({ where: { externalId: 'DUP2' } }));
    const again = { ...simulatedUpsert('DUP2', 'oi'), event: 'MESSAGES_UPSERT' };
    expect((await post(again)).status).toBe(200);
    expect(await prisma.message.count()).toBe(1);
  });
  it('mensagens de grupo usam o participante como remetente', async () => {
    await post(simulatedUpsert('G1', 'alguém aí?', { jid: '120363000000000000@g.us', participant: '5511977776666@s.whatsapp.net' }));
    const m = await waitFor(() => prisma.message.findFirst({ where: { externalId: 'G1' }, include: { conversation: true } }));
    expect(m.conversation.isGroup).toBe(true);
    expect(m.senderJid).toBe('5511977776666@s.whatsapp.net');
  });
  it('trata imagem com legenda, áudio e ignora status/reações/protocolo', async () => {
    const base = simulatedUpsert('X', '');
    const withMsg = (id: string, message: object) => ({ ...base, data: { ...base.data, key: { ...base.data.key, id }, message } });
    await post(withMsg('IMG1', { imageMessage: { caption: 'foto do rack' } }));
    await post(withMsg('AUD1', { audioMessage: { seconds: 5 } }));
    await post(withMsg('REA1', { reactionMessage: { text: '👍' } }));
    await post(withMsg('PRO1', { protocolMessage: { type: 0 } }));
    await post({ ...base, data: { ...base.data, key: { ...base.data.key, id: 'ST1', remoteJid: 'status@broadcast' } } });
    await waitFor(async () => (await prisma.webhookEvent.count({ where: { status: { in: ['PROCESSADO', 'IGNORADO'] } } })) === 5);
    const msgs = await prisma.message.findMany({ orderBy: { externalId: 'asc' } });
    expect(msgs.map((m) => [m.externalId, m.type, m.body])).toEqual([['AUD1', 'audio', null], ['IMG1', 'image', 'foto do rack']]);
  });
  it('mensagem editada atualiza o texto sem duplicar', async () => {
    await post(simulatedUpsert('ED1', 'texto original'));
    await waitFor(() => prisma.message.findFirst({ where: { externalId: 'ED1' } }));
    const edit = simulatedUpsert('ED2', '');
    edit.event = 'messages.edited';
    (edit.data as any).message = { editedMessage: { message: { protocolMessage: { key: { id: 'ED1' }, editedMessage: { conversation: 'texto corrigido' }, type: 14 } } } };
    await post(edit);
    await waitFor(async () => (await prisma.message.findFirst({ where: { externalId: 'ED1', edited: true } })));
    const m = await prisma.message.findFirstOrThrow({ where: { externalId: 'ED1' } });
    expect(m.body).toBe('texto corrigido');
    expect(await prisma.message.count()).toBe(1);
  });
  it('connection.update atualiza o estado e registra a última conexão', async () => {
    await post({ event: 'connection.update', instance: process.env.EVOLUTION_INSTANCE, data: { instance: process.env.EVOLUTION_INSTANCE, state: 'open' }, date_time: 'a' });
    const st = await waitFor(async () => { const s = await loadState(); return s.connection === 'open' ? s : null; });
    expect(st.lastConnectedAt).toBeTruthy();
    await post({ event: 'connection.update', instance: process.env.EVOLUTION_INSTANCE, data: { state: 'close', statusReason: 401 }, date_time: 'b' });
    const st2 = await waitFor(async () => { const s = await loadState(); return s.connection === 'close' ? s : null; });
    expect(st2.lastError).toContain('401');
  });
  it('central de mensagens: busca, filtros, tarefa/chamado a partir da mensagem e marcação', async () => {
    await post(simulatedUpsert('C1', 'A rede do financeiro caiu'));
    await post(simulatedUpsert('C2', 'Bom dia pessoal', { jid: '120363111@g.us', participant: '5511900000000@s.whatsapp.net' }));
    await waitFor(async () => (await prisma.message.count()) === 2);
    const a = await login('TECNICO');
    expect((await a.get('/api/messages?q=financeiro')).body.total).toBe(1);
    expect((await a.get('/api/messages?group=1')).body.total).toBe(1);
    const n = new Date(); const pd = (x: number) => String(x).padStart(2, '0'); const today = `${n.getFullYear()}-${pd(n.getMonth() + 1)}-${pd(n.getDate())}`;
    expect((await a.get(`/api/messages?from=${today}&to=${today}`)).body.total).toBe(2);
    expect((await a.get('/api/messages?from=2001-01-01&to=2001-01-02')).body.total).toBe(0);
    const msg = (await a.get('/api/messages?q=financeiro')).body.items[0];
    const t = await a.post('/api/tasks').send({ title: 'Verificar rede do financeiro', sourceMessageId: msg.id });
    expect(t.status).toBe(201);
    const k = await a.post('/api/tickets').send({ title: 'Rede caiu', category: 'REDE', sourceMessageId: msg.id });
    expect(k.status).toBe(201);
    const full = (await a.get(`/api/messages/${msg.id}`)).body;
    expect(full.processing).toBe('CONVERTIDA');
    expect(full.ticket.id).toBe(k.body.id);
    const other = (await a.get('/api/messages?q=Bom dia')).body.items[0];
    expect((await a.patch(`/api/messages/${other.id}`).send({ processing: 'ANALISADA' })).body.analyzedAt).toBeTruthy();
    const link = await a.patch(`/api/messages/${other.id}`).send({ taskId: t.body.id });
    expect(link.body.task.id).toBe(t.body.id);
    expect((await a.delete(`/api/messages/${other.id}`)).status).toBe(403);
    expect((await (await login('ADMIN')).delete(`/api/messages/${other.id}`)).status).toBe(200);
  });
  it('evento com falha pode ser reprocessado de forma controlada', async () => {
    await post(simulatedUpsert('RP1', 'vai falhar'));
    await waitFor(() => prisma.message.findFirst({ where: { externalId: 'RP1' } }));
    const ev = await prisma.webhookEvent.findFirstOrThrow();
    await prisma.webhookEvent.update({ where: { id: ev.id }, data: { status: 'FALHA', error: 'erro simulado' } });
    await prisma.message.deleteMany();
    const admin = await login('ADMIN');
    const r = await admin.post(`/api/whatsapp/events/${ev.id}/reprocess`);
    expect(r.body.status).toBe('PROCESSADO');
    expect(await prisma.message.count()).toBe(1);
    expect((await admin.post(`/api/whatsapp/events/${ev.id}/reprocess`)).status).toBe(400);
  });
});

describe('Integração WhatsApp: conexão, QR, desconexão e envio', () => {
  it('não afirma conexão sem confirmação da API (API indisponível => desconhecido)', async () => {
    const a = await login('ADMIN');
    fake.state = 'open';
    expect((await a.get('/api/whatsapp/status')).body.connection).toBe('open');
    fake.reachable = false;
    const s = (await a.get('/api/whatsapp/status')).body;
    expect(s.apiReachable).toBe(false);
    expect(s.connection).toBe('unknown');
    expect(s.lastError).toContain('indisponível');
  });
  it('QR Code: só administrador, não é persistido no banco e some ao conectar', async () => {
    const admin = await login('ADMIN');
    const tech = await login('TECNICO');
    const q = await admin.post('/api/whatsapp/qr');
    expect(q.body.qr.base64).toContain('QRSIMULADO');
    expect((await tech.post('/api/whatsapp/qr')).status).toBe(403);
    expect((await tech.get('/api/whatsapp/status')).body.qr).toBeNull();
    expect((await admin.get('/api/whatsapp/status')).body.qr.base64).toContain('QRSIMULADO');
    expect(JSON.stringify(await prisma.setting.findMany())).not.toContain('QRSIMULADO');
    expect(JSON.stringify(await prisma.webhookEvent.findMany())).not.toContain('QRSIMULADO');
    fake.state = 'open';
    expect((await admin.get('/api/whatsapp/status')).body.qr).toBeNull();
  });
  it('desconexão e reconexão', async () => {
    const admin = await login('ADMIN');
    fake.state = 'open';
    expect((await admin.get('/api/whatsapp/status')).body.connection).toBe('open');
    expect((await admin.post('/api/whatsapp/disconnect')).status).toBe(200);
    expect(fake.loggedOut).toBe(1);
    expect((await admin.get('/api/whatsapp/status')).body.connection).toBe('close');
    expect((await admin.post('/api/whatsapp/qr')).body.qr).toBeTruthy();
    fake.state = 'open';
    const s = (await admin.get('/api/whatsapp/status')).body;
    expect(s.connection).toBe('open');
    expect(s.lastConnectedAt).toBeTruthy();
  });
  it('configura instância e webhook com segredo; mostra erro se a API cair', async () => {
    const admin = await login('ADMIN');
    expect((await admin.post('/api/whatsapp/instance/ensure')).body.created).toBe(true);
    expect(fake.webhookSet?.secret).toBe(process.env.WEBHOOK_SECRET);
    expect((await admin.post('/api/whatsapp/instance/ensure')).body.created).toBe(false);
    fake.reachable = false;
    expect((await admin.post('/api/whatsapp/instance/ensure')).status).toBe(502);
  });
  it('envio exige conexão confirmada, respeita pausa e aciona o disjuntor após falhas', async () => {
    const admin = await login('ADMIN');
    expect((await admin.post('/api/whatsapp/send-test').send({ to: '5511999990000' })).status).toBe(409); // sem conexão
    fake.state = 'open';
    await admin.get('/api/whatsapp/status');
    expect((await admin.post('/api/whatsapp/send-test').send({ to: '5511999990000' })).status).toBe(200);
    expect(fake.sent).toHaveLength(1);
    await admin.post('/api/whatsapp/pause').send({ paused: true });
    expect((await admin.post('/api/whatsapp/send-test').send({ to: '5511999990000' })).status).toBe(409);
    expect(fake.sent).toHaveLength(1);
    await admin.post('/api/whatsapp/pause').send({ paused: false });
    fake.failSend = true;
    for (let i = 0; i < 3; i++) await admin.post('/api/whatsapp/send-test').send({ to: '5511999990000' });
    const st = await loadState();
    expect(st.paused).toBe(true);
    expect(st.pausedReason).toContain('falhas');
    expect(await prisma.notification.count({ where: { kind: 'whatsapp' } })).toBe(1);
    fake.failSend = false;
    expect((await admin.post('/api/whatsapp/send-test').send({ to: '5511999990000' })).status).toBe(409); // segue pausado
  });
  it('o front nunca recebe a chave da Evolution API', async () => {
    const admin = await login('ADMIN');
    const body = JSON.stringify((await admin.get('/api/whatsapp/status')).body);
    expect(body).not.toContain(process.env.EVOLUTION_API_KEY!);
    expect(body).not.toContain(process.env.WEBHOOK_SECRET!);
  });
});
