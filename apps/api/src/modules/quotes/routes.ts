import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db';
import { HttpError, parse, wrap } from '../../lib/http';
import { parseDue } from '../../lib/dates';
import { audit, recordEvent } from '../../lib/audit';
import { analyzeOffers, offerTotal } from './calc';
import { buildQuotePdf } from './pdf';

export const quotesRouter = Router();

const STATUS = ['RASCUNHO', 'EM_PESQUISA', 'AGUARDANDO_APROVACAO', 'APROVADO', 'REPROVADO', 'CANCELADO'] as const;
const id = z.string().min(1).nullable().optional();
const quoteSchema = z.object({
  requesterId: id, companyId: id, branchId: id,
  product: z.string().trim().min(2, 'Informe o produto ou serviço').max(200),
  quantity: z.number().int().min(1).max(100000).default(1),
  specs: z.string().trim().min(3, 'Informe as especificações técnicas').max(5000),
  justification: z.string().max(5000).nullable().optional(),
  dueDate: z.string().nullable().optional(),
  status: z.enum(STATUS).optional(),
});

const include = {
  requester: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  offers: { orderBy: { totalCents: 'asc' as const } },
  approvals: { orderBy: { decidedAt: 'desc' as const } },
} satisfies Prisma.QuoteRequestInclude;

const withAnalysis = <T extends { offers: any[] }>(q: T) => ({ ...q, analysis: analyzeOffers(q.offers) });

quotesRouter.get('/', wrap(async (req, res) => {
  const status = typeof req.query.status === 'string' ? (req.query.status as any) : undefined;
  const list = await prisma.quoteRequest.findMany({ where: { status }, include, orderBy: { createdAt: 'desc' }, take: 300 });
  res.json(list.map(withAnalysis));
}));

quotesRouter.get('/:id', wrap(async (req, res) => {
  res.json(withAnalysis(await prisma.quoteRequest.findUniqueOrThrow({ where: { id: req.params.id }, include })));
}));

quotesRouter.post('/', wrap(async (req, res) => {
  const { dueDate, ...d } = parse(quoteSchema, req.body);
  let due: Date | null = null;
  try { due = parseDue(dueDate); } catch { throw new HttpError(400, 'Prazo inválido'); }
  const q = await prisma.quoteRequest.create({ data: { ...d, dueDate: due, status: d.status ?? 'EM_PESQUISA' }, include });
  await recordEvent('quote', q.id, req.user, 'solicitação criada');
  res.status(201).json(withAnalysis(q));
}));

quotesRouter.patch('/:id', wrap(async (req, res) => {
  const { dueDate, ...d } = parse(quoteSchema.partial(), req.body);
  const before = await prisma.quoteRequest.findUniqueOrThrow({ where: { id: req.params.id }, include });
  if (d.status === 'AGUARDANDO_APROVACAO' && !analyzeOffers(before.offers).complete) {
    throw new HttpError(400, 'Pesquisa incompleta: cadastre ao menos 3 ofertas válidas de fornecedores distintos antes de enviar para aprovação');
  }
  const data: Prisma.QuoteRequestUncheckedUpdateInput = { ...d };
  if (dueDate !== undefined) {
    try { data.dueDate = parseDue(dueDate); } catch { throw new HttpError(400, 'Prazo inválido'); }
  }
  const q = await prisma.quoteRequest.update({ where: { id: before.id }, data, include });
  if (d.status && d.status !== before.status) await recordEvent('quote', q.id, req.user, `status: ${before.status} → ${d.status}`);
  res.json(withAnalysis(q));
}));

// ---- Ofertas ----
const offerSchema = z.object({
  supplierId: id,
  supplierName: z.string().trim().min(2, 'Informe o fornecedor'),
  product: z.string().trim().min(2),
  brandModel: z.string().nullable().optional(),
  specs: z.string().nullable().optional(),
  unitPriceCents: z.number().int().min(1, 'Informe o preço unitário'),
  quantity: z.number().int().min(1),
  shippingCents: z.number().int().min(0).default(0),
  deliveryDays: z.number().int().min(0).max(1000).nullable().optional(),
  warranty: z.string().nullable().optional(),
  availability: z.string().nullable().optional(),
  url: z.string().url('Link inválido').refine((u) => /^https?:\/\//i.test(u), 'Use http(s)').nullable().optional().or(z.literal('').transform(() => null)),
  meetsSpecs: z.boolean().default(true),
  consultedAt: z.string().min(8, 'Informe a data da consulta'),
});

quotesRouter.post('/:id/offers', wrap(async (req, res) => {
  const d = parse(offerSchema, req.body);
  await prisma.quoteRequest.findUniqueOrThrow({ where: { id: req.params.id } });
  const consultedAt = new Date(d.consultedAt);
  if (isNaN(consultedAt.getTime())) throw new HttpError(400, 'Data da consulta inválida');
  const o = await prisma.quoteOffer.create({
    data: { ...d, consultedAt, quoteId: req.params.id, totalCents: offerTotal(d.unitPriceCents, d.quantity, d.shippingCents) }, // total sempre calculado no servidor
  });
  res.status(201).json(o);
}));

quotesRouter.patch('/:id/offers/:offerId', wrap(async (req, res) => {
  const d = parse(offerSchema.partial(), req.body);
  const cur = await prisma.quoteOffer.findFirstOrThrow({ where: { id: req.params.offerId, quoteId: req.params.id } });
  const unit = d.unitPriceCents ?? cur.unitPriceCents, qty = d.quantity ?? cur.quantity, ship = d.shippingCents ?? cur.shippingCents;
  const { consultedAt, ...rest } = d;
  const o = await prisma.quoteOffer.update({
    where: { id: cur.id },
    data: { ...rest, ...(consultedAt ? { consultedAt: new Date(consultedAt) } : {}), totalCents: offerTotal(unit, qty, ship) },
  });
  res.json(o);
}));

quotesRouter.delete('/:id/offers/:offerId', wrap(async (req, res) => {
  await prisma.quoteOffer.deleteMany({ where: { id: req.params.offerId, quoteId: req.params.id } });
  res.json({ ok: true });
}));

// ---- Aprovação ----
quotesRouter.post('/:id/approval', wrap(async (req, res) => {
  const d = parse(z.object({ decision: z.enum(['APROVADO', 'REPROVADO']), offerId: z.string().optional(), approver: z.string().trim().min(2, 'Informe quem decidiu'), notes: z.string().max(2000).optional() }), req.body);
  const q = await prisma.quoteRequest.findUniqueOrThrow({ where: { id: req.params.id }, include: { offers: true } });
  if (d.decision === 'APROVADO') {
    const offer = q.offers.find((o) => o.id === d.offerId);
    if (!offer) throw new HttpError(400, 'Selecione a oferta aprovada');
    if (!offer.meetsSpecs) throw new HttpError(400, 'A oferta selecionada não atende às especificações');
  }
  const [ap] = await prisma.$transaction([
    prisma.quoteApproval.create({ data: { quoteId: q.id, ...d } }),
    prisma.quoteRequest.update({ where: { id: q.id }, data: { status: d.decision } }),
  ]);
  await recordEvent('quote', q.id, req.user, `decisão: ${d.decision} por ${d.approver}`);
  await audit(req, 'orcamento_decisao', { entity: 'quote', entityId: q.id, detail: d.decision });
  res.status(201).json(ap);
}));

// ---- PDF ----
quotesRouter.get('/:id/pdf', wrap(async (req, res) => {
  const q = await prisma.quoteRequest.findUniqueOrThrow({ where: { id: req.params.id }, include });
  const buf = await buildQuotePdf(q, analyzeOffers(q.offers), req.user!.name);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="cotacao-${q.number}.pdf"`);
  res.send(buf);
}));
