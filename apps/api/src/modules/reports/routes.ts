import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { HttpError, parse, wrap } from '../../lib/http';
import { audit } from '../../lib/audit';
import { requireRole } from '../../middleware/auth';
import { buildReport } from './builder';
import { runSchedule } from './scheduler';

export const reportsRouter = Router();
const TYPES = ['TAREFAS_PENDENTES', 'TAREFAS_ATRASADAS', 'CHAMADOS_ABERTOS', 'ATENDIMENTOS_CONCLUIDOS', 'ORCAMENTOS_AGUARDANDO_APROVACAO'] as const;

reportsRouter.get('/preview', wrap(async (req, res) => {
  const type = z.enum(TYPES).parse(req.query.type);
  res.json(await buildReport(type));
}));

const admin = requireRole('ADMIN');
const base = z.object({
  name: z.string().trim().min(2),
  type: z.enum(TYPES),
  destinationJid: z.string().trim().min(8, 'Informe o grupo (JID terminado em @g.us) ou o número com DDI'),
  frequency: z.enum(['DIARIA', 'SEMANAL', 'MENSAL']),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59).default(0),
  weekday: z.number().int().min(0).max(6).nullable().optional(),
  monthDay: z.number().int().min(1).max(28).nullable().optional(),
});
const refine = (d: z.infer<typeof base>) => (d.frequency === 'SEMANAL' ? d.weekday != null : true) && (d.frequency === 'MENSAL' ? d.monthDay != null : true);

reportsRouter.get('/schedules', wrap(async (_req, res) => {
  res.json(await prisma.reportSchedule.findMany({ orderBy: { createdAt: 'desc' }, include: { runs: { orderBy: { startedAt: 'desc' }, take: 5 } } }));
}));

reportsRouter.get('/schedules/:id/runs', wrap(async (req, res) => {
  res.json(await prisma.reportRun.findMany({ where: { scheduleId: req.params.id }, orderBy: { startedAt: 'desc' }, take: 50 }));
}));

// Novos agendamentos sempre nascem INATIVOS e NÃO TESTADOS.
reportsRouter.post('/schedules', admin, wrap(async (req, res) => {
  const d = parse(base.refine(refine, 'Informe o dia da semana/mês conforme a frequência'), req.body);
  const s = await prisma.reportSchedule.create({ data: { ...d, active: false, tested: false } });
  await audit(req, 'agendamento_criado', { entity: 'schedule', entityId: s.id, detail: s.name });
  res.status(201).json(s);
}));

reportsRouter.patch('/schedules/:id', admin, wrap(async (req, res) => {
  const d = parse(base.partial().extend({ active: z.boolean().optional() }), req.body);
  const cur = await prisma.reportSchedule.findUniqueOrThrow({ where: { id: req.params.id } });
  const destChanged = d.destinationJid !== undefined && d.destinationJid !== cur.destinationJid;
  if (d.active === true && (!cur.tested || destChanged)) {
    throw new HttpError(400, 'Envie um teste manual bem-sucedido ao destino antes de ativar o agendamento');
  }
  const s = await prisma.reportSchedule.update({
    where: { id: cur.id },
    data: { ...d, ...(destChanged ? { tested: false, active: false } : {}), ...(d.active === true ? { failureCount: 0, pausedReason: null } : {}) },
  });
  await audit(req, 'agendamento_alterado', { entity: 'schedule', entityId: s.id });
  res.json(s);
}));

reportsRouter.delete('/schedules/:id', admin, wrap(async (req, res) => {
  await prisma.reportSchedule.delete({ where: { id: req.params.id } });
  await audit(req, 'agendamento_excluido', { entity: 'schedule', entityId: req.params.id });
  res.json({ ok: true });
}));

// Envio de teste: único caminho para marcar o destino como "testado"
reportsRouter.post('/schedules/:id/test', admin, wrap(async (req, res) => {
  const s = await prisma.reportSchedule.findUniqueOrThrow({ where: { id: req.params.id } });
  const r = await runSchedule(s, 'teste');
  await audit(req, 'agendamento_teste', { entity: 'schedule', entityId: s.id, detail: r.outcome });
  res.status(r.outcome === 'enviado' ? 200 : 409).json(r);
}));
