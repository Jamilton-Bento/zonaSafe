import { beforeEach, describe, expect, it, afterAll } from 'vitest';
import { prisma } from '../src/db';
import { analyzeOffers, offerTotal } from '../src/modules/quotes/calc';
import { login, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('Cálculos de orçamento', () => {
  it('total = unitário × quantidade + frete', () => {
    expect(offerTotal(250000, 3, 4990)).toBe(754990);
    expect(offerTotal(1, 1, 0)).toBe(1);
  });
  it('destaca o menor custo total válido, ignorando ofertas que não atendem', () => {
    const mk = (id: string, name: string, unit: number, ship: number, ok = true) => ({ id, supplierName: name, unitPriceCents: unit, quantity: 2, shippingCents: ship, meetsSpecs: ok, totalCents: offerTotal(unit, 2, ship) });
    const a = analyzeOffers([mk('1', 'A', 100000, 0), mk('2', 'B', 90000, 20000), mk('3', 'C', 50000, 0, false), mk('4', 'D', 95000, 0)]);
    expect(a.validCount).toBe(3);
    expect(a.complete).toBe(true);
    expect(a.lowestValidId).toBe('4'); // B: 200.000 (c/ frete) ; D: 190.000 ; A: 200.000 ; C (barata) não atende
    expect(a.recommendedId).toBe('4');
  });
  it('pesquisa incompleta (<3 fornecedores distintos válidos) não gera recomendação', () => {
    const mk = (id: string, name: string, ok = true) => ({ id, supplierName: name, unitPriceCents: 1000, quantity: 1, shippingCents: 0, meetsSpecs: ok, totalCents: 1000 });
    expect(analyzeOffers([mk('1', 'A'), mk('2', 'B')]).complete).toBe(false);
    expect(analyzeOffers([mk('1', 'A'), mk('2', 'B'), mk('3', 'C', false)]).recommendedId).toBeNull();
    expect(analyzeOffers([mk('1', 'A'), mk('2', 'a'), mk('3', 'A')]).complete).toBe(false);
    expect(analyzeOffers([]).lowestValidId).toBeNull();
  });
});

describe('Orçamentos via API e PDF', () => {
  const offer = (name: string, unit: number, extra: object = {}) => ({
    supplierName: name, product: 'Notebook 14" i5 16GB 512GB', brandModel: 'Marca X', unitPriceCents: unit, quantity: 2, shippingCents: 5000,
    deliveryDays: 5, warranty: '12 meses', availability: 'Em estoque', url: 'https://exemplo.com/produto', consultedAt: '2026-10-11', ...extra,
  });

  it('calcula total no servidor, bloqueia aprovação com pesquisa incompleta e gera PDF', async () => {
    const a = await login('TECNICO');
    const q = (await a.post('/api/quotes').send({ product: 'Notebook', quantity: 2, specs: 'i5, 16GB, SSD 512GB' })).body;
    // cliente tenta forçar totalCents: é ignorado
    const o1 = await a.post(`/api/quotes/${q.id}/offers`).send({ ...offer('Loja A', 400000), totalCents: 1 });
    expect(o1.status).toBe(201);
    expect(o1.body.totalCents).toBe(400000 * 2 + 5000);
    await a.post(`/api/quotes/${q.id}/offers`).send(offer('Loja B', 390000));
    let det = (await a.get(`/api/quotes/${q.id}`)).body;
    expect(det.analysis.complete).toBe(false);
    expect(det.analysis.message).toContain('INCOMPLETA');
    expect((await a.patch(`/api/quotes/${q.id}`).send({ status: 'AGUARDANDO_APROVACAO' })).status).toBe(400);
    await a.post(`/api/quotes/${q.id}/offers`).send(offer('Loja C', 380000, { meetsSpecs: false }));
    expect((await a.get(`/api/quotes/${q.id}`)).body.analysis.complete).toBe(false); // C não atende
    await a.post(`/api/quotes/${q.id}/offers`).send(offer('Loja D', 410000));
    det = (await a.get(`/api/quotes/${q.id}`)).body;
    expect(det.analysis.complete).toBe(true);
    const rec = det.offers.find((o: any) => o.id === det.analysis.recommendedId);
    expect(rec.supplierName).toBe('Loja B');
    expect((await a.patch(`/api/quotes/${q.id}`).send({ status: 'AGUARDANDO_APROVACAO' })).status).toBe(200);

    const pdf = await a.get(`/api/quotes/${q.id}/pdf`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    const buf = pdf.body as Buffer;
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.subarray(-8).toString()).toContain('%%EOF');
    expect(buf.length).toBeGreaterThan(1500);
  });
  it('não aprova oferta que não atende às especificações e registra decisão', async () => {
    const a = await login('TECNICO');
    const q = (await a.post('/api/quotes').send({ product: 'Switch', quantity: 1, specs: '24 portas gigabit' })).body;
    const bad = (await a.post(`/api/quotes/${q.id}/offers`).send(offer('Loja X', 1000, { meetsSpecs: false, quantity: 1 }))).body;
    const good = (await a.post(`/api/quotes/${q.id}/offers`).send(offer('Loja Y', 2000, { quantity: 1 }))).body;
    expect((await a.post(`/api/quotes/${q.id}/approval`).send({ decision: 'APROVADO', offerId: bad.id, approver: 'Diretor' })).status).toBe(400);
    expect((await a.post(`/api/quotes/${q.id}/approval`).send({ decision: 'APROVADO', approver: 'Diretor' })).status).toBe(400);
    const ok = await a.post(`/api/quotes/${q.id}/approval`).send({ decision: 'APROVADO', offerId: good.id, approver: 'Diretor' });
    expect(ok.status).toBe(201);
    expect((await a.get(`/api/quotes/${q.id}`)).body.status).toBe('APROVADO');
  });
  it('valida entradas (preço, link, data)', async () => {
    const a = await login('TECNICO');
    const q = (await a.post('/api/quotes').send({ product: 'Mouse', specs: 'sem fio' })).body;
    expect((await a.post(`/api/quotes/${q.id}/offers`).send(offer('Loja Z', 0))).status).toBe(400);
    expect((await a.post(`/api/quotes/${q.id}/offers`).send(offer('Loja Z', 1000, { url: 'javascript:alert(1)' }))).status).toBe(400);
    expect((await a.post(`/api/quotes/${q.id}/offers`).send(offer('Loja Z', 1000, { consultedAt: 'xx-xx-xxxx' }))).status).toBe(400);
  });
});
