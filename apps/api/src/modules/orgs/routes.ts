import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { parse, wrap } from '../../lib/http';
import { audit } from '../../lib/audit';
import { requireRole } from '../../middleware/auth';

export const orgsRouter = Router();
const admin = requireRole('ADMIN');
const opt = (s: z.ZodType<string>) =>
  s.or(z.literal('')).nullable().optional().transform((v): string | null | undefined => (v === '' ? null : v));
const digits = (v?: string | null) => (v ? v.replace(/\D/g, '') : null);

// ---------- Empresas ----------
const companySchema = z.object({ name: z.string().min(2), cnpj: opt(z.string()), notes: opt(z.string()), active: z.boolean().optional() });
orgsRouter.get('/companies', wrap(async (_req, res) => res.json(await prisma.company.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { branches: true, contacts: true } } } }))));
orgsRouter.post('/companies', wrap(async (req, res) => {
  const c = await prisma.company.create({ data: parse(companySchema, req.body) });
  await audit(req, 'empresa_criada', { entity: 'company', entityId: c.id, detail: c.name });
  res.status(201).json(c);
}));
orgsRouter.patch('/companies/:id', wrap(async (req, res) => res.json(await prisma.company.update({ where: { id: req.params.id }, data: parse(companySchema.partial(), req.body) }))));
orgsRouter.delete('/companies/:id', admin, wrap(async (req, res) => {
  await prisma.company.delete({ where: { id: req.params.id } });
  await audit(req, 'empresa_excluida', { entity: 'company', entityId: req.params.id });
  res.json({ ok: true });
}));

// ---------- Filiais ----------
const branchSchema = z.object({ companyId: z.string().min(1), name: z.string().min(2), city: opt(z.string()), address: opt(z.string()), active: z.boolean().optional() });
orgsRouter.get('/branches', wrap(async (req, res) => {
  const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
  res.json(await prisma.branch.findMany({ where: { companyId }, orderBy: [{ company: { name: 'asc' } }, { name: 'asc' }], include: { company: { select: { name: true } } } }));
}));
orgsRouter.post('/branches', wrap(async (req, res) => res.status(201).json(await prisma.branch.create({ data: parse(branchSchema, req.body) }))));
orgsRouter.patch('/branches/:id', wrap(async (req, res) => res.json(await prisma.branch.update({ where: { id: req.params.id }, data: parse(branchSchema.partial(), req.body) }))));
orgsRouter.delete('/branches/:id', admin, wrap(async (req, res) => {
  await prisma.branch.delete({ where: { id: req.params.id } });
  await audit(req, 'filial_excluida', { entity: 'branch', entityId: req.params.id });
  res.json({ ok: true });
}));

// ---------- Contatos / funcionários ----------
const contactSchema = z.object({
  name: z.string().min(2),
  phone: opt(z.string()),
  email: opt(z.string().email()),
  jobTitle: opt(z.string()),
  isDirector: z.boolean().optional(),
  companyId: opt(z.string()),
  branchId: opt(z.string()),
  notes: opt(z.string()),
  active: z.boolean().optional(),
});
orgsRouter.get('/contacts', wrap(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  res.json(await prisma.contact.findMany({
    where: {
      companyId, branchId,
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q.replace(/\D/g, '') || '__nada__' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: { name: 'asc' },
    include: { company: { select: { name: true } }, branch: { select: { name: true } } },
  }));
}));
orgsRouter.get('/contacts/:id', wrap(async (req, res) => {
  const c = await prisma.contact.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      company: true, branch: true,
      tasks: { orderBy: { createdAt: 'desc' }, take: 50 },
      tickets: { orderBy: { openedAt: 'desc' }, take: 50 },
    },
  });
  res.json(c);
}));
orgsRouter.post('/contacts', wrap(async (req, res) => {
  const d = parse(contactSchema, req.body);
  res.status(201).json(await prisma.contact.create({ data: { ...d, phone: digits(d.phone) } }));
}));
orgsRouter.patch('/contacts/:id', wrap(async (req, res) => {
  const d = parse(contactSchema.partial(), req.body);
  res.json(await prisma.contact.update({ where: { id: req.params.id }, data: { ...d, ...(d.phone !== undefined ? { phone: digits(d.phone) } : {}) } }));
}));
orgsRouter.delete('/contacts/:id', admin, wrap(async (req, res) => {
  await prisma.contact.delete({ where: { id: req.params.id } });
  await audit(req, 'contato_excluido', { entity: 'contact', entityId: req.params.id });
  res.json({ ok: true });
}));

// ---------- Fornecedores ----------
const supplierSchema = z.object({
  name: z.string().min(2), contact: opt(z.string()), phone: opt(z.string()), email: opt(z.string()),
  website: opt(z.string()), notes: opt(z.string()), active: z.boolean().optional(),
});
orgsRouter.get('/suppliers', wrap(async (_req, res) => res.json(await prisma.supplier.findMany({ orderBy: { name: 'asc' } }))));
orgsRouter.post('/suppliers', wrap(async (req, res) => res.status(201).json(await prisma.supplier.create({ data: parse(supplierSchema, req.body) }))));
orgsRouter.patch('/suppliers/:id', wrap(async (req, res) => res.json(await prisma.supplier.update({ where: { id: req.params.id }, data: parse(supplierSchema.partial(), req.body) }))));
orgsRouter.delete('/suppliers/:id', admin, wrap(async (req, res) => {
  await prisma.supplier.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));
