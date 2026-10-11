import { beforeAll, beforeEach, describe, expect, it, afterAll } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/db';
import { app, login, mkUser, PASSWORD, resetDb } from './helpers';

beforeAll(resetDb);
beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('Conexão com PostgreSQL', () => {
  it('health check consulta o banco', async () => {
    const r = await request(app).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: 'ok', db: 'ok' });
  });
});

describe('Autenticação', () => {
  it('rejeita rotas privadas sem sessão', async () => {
    for (const p of ['/api/tasks', '/api/tickets', '/api/dashboard', '/api/messages', '/api/whatsapp/status', '/api/users']) {
      expect((await request(app).get(p)).status).toBe(401);
    }
  });
  it('faz login, acessa /me e faz logout', async () => {
    await mkUser('ADMIN');
    const agent = request.agent(app);
    const bad = await agent.post('/api/auth/login').send({ email: 'admin@teste.local', password: 'errada' });
    expect(bad.status).toBe(401);
    const ok = await agent.post('/api/auth/login').send({ email: 'admin@teste.local', password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    expect(ok.body.passwordHash).toBeUndefined();
    expect((await agent.get('/api/auth/me')).body.role).toBe('ADMIN');
    await agent.post('/api/auth/logout');
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
  it('armazena senha com hash bcrypt', async () => {
    const u = await mkUser('ADMIN');
    expect(u.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(u.passwordHash).not.toContain(PASSWORD);
  });
  it('bloqueia a conta após 5 senhas incorretas', async () => {
    await mkUser('TECNICO');
    for (let i = 0; i < 5; i++) await request(app).post('/api/auth/login').send({ email: 'tecnico@teste.local', password: 'x' });
    const r = await request(app).post('/api/auth/login').send({ email: 'tecnico@teste.local', password: PASSWORD });
    expect(r.status).toBe(429);
  });
  it('usuário inativo não entra', async () => {
    const u = await mkUser('TECNICO');
    await prisma.user.update({ where: { id: u.id }, data: { active: false } });
    const r = await request(app).post('/api/auth/login').send({ email: u.email, password: PASSWORD });
    expect(r.status).toBe(401);
  });
  it('cookie adulterado é recusado', async () => {
    const r = await request(app).get('/api/tasks').set('Cookie', 'central_session=abc.def.ghi');
    expect(r.status).toBe(401);
  });
});

describe('Controle de permissões', () => {
  it('LEITOR lê mas não escreve', async () => {
    const a = await login('LEITOR');
    expect((await a.get('/api/tasks')).status).toBe(200);
    expect((await a.post('/api/tasks').send({ title: 'x tarefa' })).status).toBe(403);
    expect((await a.post('/api/tickets').send({ title: 'x chamado' })).status).toBe(403);
  });
  it('TECNICO não gerencia usuários, auditoria nem exclui registros', async () => {
    const t = await login('TECNICO');
    expect((await t.get('/api/users')).status).toBe(403);
    expect((await t.post('/api/users').send({})).status).toBe(403);
    expect((await t.get('/api/audit')).status).toBe(403);
    const task = await t.post('/api/tasks').send({ title: 'Tarefa de teste' });
    expect((await t.delete(`/api/tasks/${task.body.id}`)).status).toBe(403);
    expect((await t.post('/api/whatsapp/qr')).status).toBe(403);
    expect((await t.post('/api/whatsapp/disconnect')).status).toBe(403);
  });
  it('ADMIN cria usuário e não pode rebaixar a si mesmo', async () => {
    const a = await login('ADMIN');
    const c = await a.post('/api/users').send({ name: 'Novo', email: 'novo@teste.local', password: 'SenhaBoa#12345', role: 'TECNICO' });
    expect(c.status).toBe(201);
    expect(c.body.passwordHash).toBeUndefined();
    const me = (await a.get('/api/auth/me')).body;
    expect((await a.patch(`/api/users/${me.id}`).send({ role: 'LEITOR' })).status).toBe(400);
    expect((await a.post('/api/users').send({ name: 'Fraco', email: 'f@teste.local', password: '123', role: 'LEITOR' })).status).toBe(400);
  });
  it('registra auditoria de login', async () => {
    const a = await login('ADMIN');
    const log = await a.get('/api/audit');
    expect(log.body.some((l: any) => l.action === 'login')).toBe(true);
  });
});
