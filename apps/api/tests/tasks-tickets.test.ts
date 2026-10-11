import { beforeEach, describe, expect, it, afterAll } from 'vitest';
import { prisma } from '../src/db';
import { login, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); const p = (x: number) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

describe('Tarefas', () => {
  it('cria, valida e conclui uma tarefa registrando histórico', async () => {
    const a = await login('TECNICO');
    expect((await a.post('/api/tasks').send({ title: '' })).status).toBe(400);
    const c = await a.post('/api/tasks').send({ title: 'Trocar toner da impressora', priority: 'ALTA', dueDate: day(0) });
    expect(c.status).toBe(201);
    expect(c.body.status).toBe('NOVA');
    expect(c.body.number).toBeGreaterThan(0);
    const u = await a.patch(`/api/tasks/${c.body.id}`).send({ status: 'CONCLUIDA' });
    expect(u.body.status).toBe('CONCLUIDA');
    expect(u.body.completedAt).toBeTruthy();
    const d = await a.get(`/api/tasks/${c.body.id}`);
    expect(d.body.history.some((h: any) => h.field === 'status' && h.oldValue === 'NOVA' && h.newValue === 'CONCLUIDA')).toBe(true);
    // reabrir limpa a data de conclusão
    const r = await a.patch(`/api/tasks/${c.body.id}`).send({ status: 'EM_ANDAMENTO' });
    expect(r.body.completedAt).toBeNull();
  });
  it('visualizações: hoje, atrasadas, próximos, sem prazo, aguardando, concluídas', async () => {
    const a = await login('TECNICO');
    const mk = (title: string, extra: object = {}) => a.post('/api/tasks').send({ title, ...extra });
    await mk('Vence hoje', { dueDate: day(0) });
    await mk('Atrasada', { dueDate: day(-2) });
    await mk('Em três dias', { dueDate: day(3) });
    await mk('Sem prazo');
    await mk('Esperando', { status: 'AGUARDANDO_RETORNO' });
    await mk('Pronta', { status: 'CONCLUIDA', dueDate: day(-5) });
    const titles = async (view: string) => (await a.get(`/api/tasks?view=${view}`)).body.map((t: any) => t.title).sort();
    expect(await titles('hoje')).toEqual(['Vence hoje']);
    expect(await titles('atrasadas')).toEqual(['Atrasada']);
    expect(await titles('proximos')).toEqual(['Em três dias']);
    expect(await titles('sem_prazo')).toEqual(['Esperando', 'Sem prazo']);
    expect(await titles('aguardando')).toEqual(['Esperando']);
    expect(await titles('concluidas')).toEqual(['Pronta']);
    expect((await titles('todas')).length).toBe(6);
  });
  it('"Minhas tarefas" considera o responsável', async () => {
    const a = await login('TECNICO');
    const me = (await a.get('/api/auth/me')).body;
    await a.post('/api/tasks').send({ title: 'Minha', assigneeId: me.id });
    await a.post('/api/tasks').send({ title: 'De outro' });
    const r = await a.get('/api/tasks?view=minhas');
    expect(r.body.map((t: any) => t.title)).toEqual(['Minha']);
  });
  it('rejeita prazo inválido e ordena por prioridade', async () => {
    const a = await login('TECNICO');
    expect((await a.post('/api/tasks').send({ title: 'Prazo ruim', dueDate: 'ontem' })).status).toBe(400);
    await a.post('/api/tasks').send({ title: 'Baixa', priority: 'BAIXA' });
    await a.post('/api/tasks').send({ title: 'Crítica', priority: 'CRITICA' });
    expect((await a.get('/api/tasks')).body[0].title).toBe('Crítica');
  });
  it('protege contra injeção SQL em filtros', async () => {
    const a = await login('TECNICO');
    await a.post('/api/tasks').send({ title: 'Normal' });
    const r = await a.get(`/api/tasks?q=${encodeURIComponent("'; DROP TABLE \"Task\"; --")}`);
    expect(r.status).toBe(200);
    expect((await a.get('/api/tasks')).body.length).toBe(1);
  });
});

describe('Chamados', () => {
  it('cria com número único, comenta e atualiza com histórico cronológico', async () => {
    const a = await login('TECNICO');
    const t1 = await a.post('/api/tickets').send({ title: 'PC não liga', category: 'HARDWARE', priority: 'ALTA' });
    const t2 = await a.post('/api/tickets').send({ title: 'Sem internet', category: 'INTERNET' });
    expect(t1.status).toBe(201);
    expect(t2.body.number).toBe(t1.body.number + 1);
    expect(t1.body.status).toBe('NOVO');
    expect((await a.post(`/api/tickets/${t1.body.id}/comments`).send({ body: '' })).status).toBe(400);
    expect((await a.post(`/api/tickets/${t1.body.id}/comments`).send({ body: 'Fonte queimada' })).status).toBe(201);
    await a.patch(`/api/tickets/${t1.body.id}`).send({ status: 'EM_ANDAMENTO' });
    const d = (await a.get(`/api/tickets/${t1.body.id}`)).body;
    expect(d.comments).toHaveLength(1);
    expect(d.history.length).toBeGreaterThanOrEqual(3);
    expect(new Date(d.history[0].createdAt).getTime()).toBeGreaterThanOrEqual(new Date(d.history.at(-1).createdAt).getTime());
  });
  it('só conclui com solução aplicada e registra data de conclusão', async () => {
    const a = await login('TECNICO');
    const t = (await a.post('/api/tickets').send({ title: 'Impressora travada', category: 'IMPRESSORAS' })).body;
    expect((await a.patch(`/api/tickets/${t.id}`).send({ status: 'CONCLUIDO' })).status).toBe(400);
    const ok = await a.patch(`/api/tickets/${t.id}`).send({ status: 'CONCLUIDO', solution: 'Reinstalado o driver' });
    expect(ok.status).toBe(200);
    expect(ok.body.closedAt).toBeTruthy();
    expect(ok.body.solution).toBe('Reinstalado o driver');
  });
  it('filtra, pesquisa e ordena', async () => {
    const a = await login('TECNICO');
    await a.post('/api/tickets').send({ title: 'Wi-Fi caiu', category: 'REDE' });
    await a.post('/api/tickets').send({ title: 'Senha do e-mail', category: 'EMAIL', status: 'PENDENTE' });
    expect((await a.get('/api/tickets?category=REDE')).body).toHaveLength(1);
    expect((await a.get('/api/tickets?q=senha')).body).toHaveLength(1);
    expect((await a.get('/api/tickets?status=PENDENTE')).body).toHaveLength(1);
    expect((await a.get('/api/tickets?sort=number&dir=asc')).body[0].title).toBe('Wi-Fi caiu');
    expect((await a.get('/api/tickets?category=INVALIDA')).status).toBe(400);
  });
  it('cadastros: empresa, filial, contato e vínculo com chamados/tarefas', async () => {
    const a = await login('TECNICO');
    const emp = (await a.post('/api/companies').send({ name: 'Empresa Teste Ltda' })).body;
    const fil = (await a.post('/api/branches').send({ companyId: emp.id, name: 'Filial Centro' })).body;
    const ct = (await a.post('/api/contacts').send({ name: 'Maria Teste', phone: '+55 (11) 98888-7777', companyId: emp.id, branchId: fil.id, isDirector: true })).body;
    expect(ct.phone).toBe('5511988887777');
    await a.post('/api/tickets').send({ title: 'Chamado da Maria', requesterId: ct.id, companyId: emp.id, branchId: fil.id });
    await a.post('/api/tasks').send({ title: 'Tarefa da Maria', requesterId: ct.id });
    const det = (await a.get(`/api/contacts/${ct.id}`)).body;
    expect(det.tickets).toHaveLength(1);
    expect(det.tasks).toHaveLength(1);
    expect((await a.get(`/api/tickets?branchId=${fil.id}`)).body).toHaveLength(1);
    expect((await a.get('/api/companies')).body[0]._count.branches).toBe(1);
    // empresa com filiais não pode ser removida por engano (admin)
    const ad = await login('ADMIN');
    expect((await ad.delete(`/api/companies/${emp.id}`)).status).toBe(409);
    // dashboard conta solicitações da diretoria
    const dash = (await a.get('/api/dashboard')).body;
    expect(dash.counters.directionRequests).toBe(2);
    expect(dash.counters.openTickets).toBe(1);
  });
});
