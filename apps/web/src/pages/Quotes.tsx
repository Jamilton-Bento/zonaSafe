import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDate, QUOTE_STATUS } from '../lib/format';
import { useBranches, useCompanies, useContacts } from '../lib/hooks';
import { Badge, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, statusTone } from '../components/ui';

const nul = (v: unknown) => (v === '' || v === undefined ? null : v);
const schema = z.object({
  product: z.string().trim().min(2, 'Informe o produto ou serviço'),
  quantity: z.coerce.number().int('Use número inteiro').min(1, 'Mínimo 1'),
  specs: z.string().trim().min(3, 'Informe as especificações técnicas'),
  justification: z.preprocess(nul, z.string().nullable()),
  requesterId: z.preprocess(nul, z.string().nullable()), companyId: z.preprocess(nul, z.string().nullable()), branchId: z.preprocess(nul, z.string().nullable()),
  dueDate: z.preprocess(nul, z.string().nullable()),
});

function NewQuote({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const companies = useCompanies().data ?? [], branches = useBranches().data ?? [], contacts = useContacts().data ?? [];
  const { register, handleSubmit, watch, formState: { errors } } = useForm({ resolver: zodResolver(schema) as any, defaultValues: { quantity: 1 } as any });
  const create = useMutation({ mutationFn: (d: any) => api.post<any>('/quotes', d), onSuccess: (q) => { qc.invalidateQueries({ queryKey: ['quotes'] }); nav(`/orcamentos/${q.id}`); } });
  const cid = watch('companyId');
  return (
    <Modal title="Nova solicitação de orçamento" onClose={onClose} wide>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit((d) => create.mutate(d))}>
        <Field label="Produto ou serviço *" error={errors.product?.message as string} className="sm:col-span-2"><input className="input" autoFocus {...register('product')} /></Field>
        <Field label="Quantidade *" error={errors.quantity?.message as string}><input type="number" min={1} className="input" {...register('quantity')} /></Field>
        <Field label="Prazo desejado"><input type="date" className="input" {...register('dueDate')} /></Field>
        <Field label="Especificações técnicas *" error={errors.specs?.message as string} className="sm:col-span-2"><textarea rows={3} className="input" placeholder="Ex.: processador, memória, armazenamento, garantia mínima…" {...register('specs')} /></Field>
        <Field label="Justificativa" className="sm:col-span-2"><textarea rows={2} className="input" {...register('justification')} /></Field>
        <Field label="Solicitante"><select className="input" {...register('requesterId')}><option value="">—</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Empresa"><select className="input" {...register('companyId')}><option value="">—</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Filial"><select className="input" {...register('branchId')}><option value="">—</option>{branches.filter((b) => !cid || b.companyId === cid).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <div className="sm:col-span-2"><ErrorBox error={create.error} /></div>
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={create.isPending}>Criar e cadastrar ofertas</button></div>
      </form>
    </Modal>
  );
}

export default function Quotes() {
  const { canWrite } = useAuth();
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState('');
  const { data, isLoading, error } = useQuery({ queryKey: ['quotes', status], queryFn: () => api.get<any[]>(`/quotes${status ? `?status=${status}` : ''}`) });
  return (
    <>
      <PageHeader title="Orçamentos" subtitle="Comparação de fornecedores e relatório para a diretoria" actions={canWrite && <button className="btn-primary" onClick={() => setCreating(true)}>+ Nova solicitação</button>} />
      <select className="input mb-3 max-w-xs" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos os status</option>{Object.entries(QUOTE_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <ErrorBox error={error} />
      <div className="card overflow-x-auto">
        {isLoading ? <Spinner /> : !data?.length ? <Empty>Nenhuma solicitação de orçamento.</Empty> : (
          <table className="w-full"><thead className="border-b bg-slate-50"><tr><th className="th">Nº</th><th className="th">Produto</th><th className="th">Solicitante</th><th className="th">Qtd.</th><th className="th">Ofertas</th><th className="th">Pesquisa</th><th className="th">Status</th><th className="th">Prazo</th></tr></thead>
            <tbody className="divide-y">{data.map((q) => (
              <tr key={q.id} className="hover:bg-slate-50">
                <td className="td text-slate-500">{q.number}</td>
                <td className="td"><Link className="font-medium text-brand-700 hover:underline" to={`/orcamentos/${q.id}`}>{q.product}</Link><div className="text-xs text-slate-500">{[q.company?.name, q.branch?.name].filter(Boolean).join(' · ')}</div></td>
                <td className="td">{q.requester?.name ?? '—'}</td><td className="td">{q.quantity}</td><td className="td">{q.offers.length}</td>
                <td className="td">{q.analysis.complete ? <Badge tone="green">Completa</Badge> : <Badge tone="orange">Incompleta</Badge>}</td>
                <td className="td"><Badge tone={statusTone(q.status)}>{QUOTE_STATUS[q.status]}</Badge></td><td className="td">{fmtDate(q.dueDate)}</td>
              </tr>))}</tbody></table>
        )}
      </div>
      {creating && <NewQuote onClose={() => setCreating(false)} />}
    </>
  );
}
