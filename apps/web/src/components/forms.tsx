import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { CATEGORY, opts, PRIORITY, TASK_STATUS, TICKET_STATUS, toDateInput } from '../lib/format';
import { useBranches, useCompanies, useContacts, useTechnicians } from '../lib/hooks';
import { ErrorBox, Field, Modal } from './ui';

const emptyToNull = (v: unknown) => (v === '' || v === undefined ? null : v);
const optId = z.preprocess(emptyToNull, z.string().nullable());

const baseShape = {
  title: z.string().trim().min(2, 'Informe um título (mín. 2 caracteres)').max(200),
  description: z.preprocess(emptyToNull, z.string().max(5000).nullable()),
  requesterId: optId, companyId: optId, branchId: optId, assigneeId: optId,
  category: z.string(), priority: z.string(),
  dueDate: z.preprocess(emptyToNull, z.string().nullable()),
};
const taskSchema = z.object({ ...baseShape, status: z.string(), notes: z.preprocess(emptyToNull, z.string().max(5000).nullable()) });
const ticketSchema = z.object({ ...baseShape, status: z.string(), solution: z.preprocess(emptyToNull, z.string().max(10000).nullable()) });

function OrgFields({ register, watch }: { register: any; watch: (n: string) => string }) {
  const companies = useCompanies().data ?? [];
  const branches = (useBranches().data ?? []).filter((b) => !watch('companyId') || b.companyId === watch('companyId'));
  const contacts = useContacts().data ?? [];
  const team = useTechnicians().data ?? [];
  return (
    <>
      <Field label="Solicitante"><select className="input" {...register('requesterId')}><option value="">—</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isDirector ? ' (diretoria)' : ''}</option>)}</select></Field>
      <Field label="Responsável"><select className="input" {...register('assigneeId')}><option value="">—</option>{team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
      <Field label="Empresa"><select className="input" {...register('companyId')}><option value="">—</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Filial"><select className="input" {...register('branchId')}><option value="">—</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
    </>
  );
}

interface Props { initial?: any; sourceMessage?: { id: string; body?: string | null; contactId?: string | null }; onClose: () => void; onSaved?: (x: any) => void }

export function TaskFormModal({ initial, sourceMessage, onClose, onSaved }: Props) {
  const qc = useQueryClient();
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(taskSchema) as any,
    defaultValues: {
      title: initial?.title ?? (sourceMessage?.body ?? '').slice(0, 120), description: initial?.description ?? sourceMessage?.body ?? '',
      requesterId: initial?.requesterId ?? sourceMessage?.contactId ?? '', companyId: initial?.companyId ?? '', branchId: initial?.branchId ?? '', assigneeId: initial?.assigneeId ?? '',
      category: initial?.category ?? 'OUTROS', priority: initial?.priority ?? 'NORMAL', status: initial?.status ?? 'NOVA',
      dueDate: toDateInput(initial?.dueDate), notes: initial?.notes ?? '',
    },
  });
  const save = useMutation({
    mutationFn: (d: any) => initial?.id ? api.patch(`/tasks/${initial.id}`, d) : api.post('/tasks', { ...d, sourceMessageId: sourceMessage?.id }),
    onSuccess: (r) => { qc.invalidateQueries(); onSaved?.(r); onClose(); },
  });
  return (
    <Modal title={initial?.id ? `Editar tarefa #${initial.number}` : 'Nova tarefa'} onClose={onClose} wide>
      <form onSubmit={handleSubmit((d) => save.mutate(d))} className="grid gap-3 sm:grid-cols-2">
        <Field label="Título *" error={errors.title?.message as string} className="sm:col-span-2"><input className="input" autoFocus {...register('title')} /></Field>
        <Field label="Descrição" className="sm:col-span-2"><textarea className="input" rows={3} {...register('description')} /></Field>
        <OrgFields register={register} watch={watch as any} />
        <Field label="Categoria"><select className="input" {...register('category')}>{opts(CATEGORY).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
        <Field label="Prioridade"><select className="input" {...register('priority')}>{opts(PRIORITY).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
        <Field label="Prazo"><input type="date" className="input" {...register('dueDate')} /></Field>
        <Field label="Status"><select className="input" {...register('status')}>{opts(TASK_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
        <Field label="Observações" className="sm:col-span-2"><textarea className="input" rows={2} {...register('notes')} /></Field>
        <div className="sm:col-span-2"><ErrorBox error={save.error} /></div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function TicketFormModal({ initial, sourceMessage, onClose, onSaved }: Props) {
  const qc = useQueryClient();
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(ticketSchema) as any,
    defaultValues: {
      title: initial?.title ?? (sourceMessage?.body ?? '').slice(0, 120), description: initial?.description ?? sourceMessage?.body ?? '',
      requesterId: initial?.requesterId ?? sourceMessage?.contactId ?? '', companyId: initial?.companyId ?? '', branchId: initial?.branchId ?? '', assigneeId: initial?.assigneeId ?? '',
      category: initial?.category ?? 'OUTROS', priority: initial?.priority ?? 'NORMAL', status: initial?.status ?? 'NOVO',
      dueDate: toDateInput(initial?.dueDate), solution: initial?.solution ?? '',
    },
  });
  const save = useMutation({
    mutationFn: (d: any) => initial?.id ? api.patch(`/tickets/${initial.id}`, d) : api.post('/tickets', { ...d, sourceMessageId: sourceMessage?.id }),
    onSuccess: (r) => { qc.invalidateQueries(); onSaved?.(r); onClose(); },
  });
  return (
    <Modal title={initial?.id ? `Editar chamado #${initial.number}` : 'Novo chamado'} onClose={onClose} wide>
      <form onSubmit={handleSubmit((d) => save.mutate(d))} className="grid gap-3 sm:grid-cols-2">
        <Field label="Título *" error={errors.title?.message as string} className="sm:col-span-2"><input className="input" autoFocus {...register('title')} /></Field>
        <Field label="Descrição" className="sm:col-span-2"><textarea className="input" rows={3} {...register('description')} /></Field>
        <OrgFields register={register} watch={watch as any} />
        <Field label="Categoria"><select className="input" {...register('category')}>{opts(CATEGORY).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
        <Field label="Prioridade"><select className="input" {...register('priority')}>{opts(PRIORITY).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
        <Field label="Prazo"><input type="date" className="input" {...register('dueDate')} /></Field>
        <Field label="Status"><select className="input" {...register('status')}>{opts(TICKET_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
        <Field label="Solução aplicada (obrigatória para concluir)" className="sm:col-span-2"><textarea className="input" rows={2} {...register('solution')} /></Field>
        <div className="sm:col-span-2"><ErrorBox error={save.error} /></div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}
