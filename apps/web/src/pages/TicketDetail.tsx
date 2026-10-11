import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { CATEGORY, fmtDate, fmtDateTime, opts, PRIORITY, TICKET_STATUS } from '../lib/format';
import { Badge, ErrorBox, PageHeader, priorityTone, Spinner, statusTone } from '../components/ui';
import { TicketFormModal } from '../components/forms';

const FIELD_LABEL: Record<string, string> = { title: 'Título', description: 'Descrição', status: 'Status', priority: 'Prioridade', category: 'Categoria', dueDate: 'Prazo', assigneeId: 'Responsável', requesterId: 'Solicitante', companyId: 'Empresa', branchId: 'Filial', solution: 'Solução' };
const show = (field: string | null, v: string | null) => {
  if (v == null) return '—';
  if (field === 'status') return TICKET_STATUS[v] ?? v;
  if (field === 'priority') return PRIORITY[v] ?? v;
  if (field === 'category') return CATEGORY[v] ?? v;
  if (field === 'dueDate') return fmtDate(v);
  return v.length > 60 ? v.slice(0, 60) + '…' : v;
};

export default function TicketDetail() {
  const { id } = useParams();
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState('');
  const { data: t, isLoading, error } = useQuery({ queryKey: ['ticket', id], queryFn: () => api.get<any>(`/tickets/${id}`) });
  const addComment = useMutation({ mutationFn: () => api.post(`/tickets/${id}/comments`, { body: comment }), onSuccess: () => { setComment(''); qc.invalidateQueries(); } });
  const setStatus = useMutation({ mutationFn: (status: string) => api.patch(`/tickets/${id}`, { status }), onSuccess: () => qc.invalidateQueries() });
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  return (
    <>
      <PageHeader title={`Chamado #${t.number} — ${t.title}`} subtitle={`Aberto em ${fmtDateTime(t.openedAt)}${t.closedAt ? ` · encerrado em ${fmtDateTime(t.closedAt)}` : ''}`}
        actions={<><Link className="btn-secondary" to="/chamados">← Voltar</Link>{canWrite && <button className="btn-primary" onClick={() => setEditing(true)}>Editar</button>}</>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(t.status)}>{TICKET_STATUS[t.status]}</Badge><Badge tone={priorityTone(t.priority)}>{PRIORITY[t.priority]}</Badge><Badge>{CATEGORY[t.category]}</Badge>
              {canWrite && <select aria-label="Alterar status" className="input !w-auto py-0.5" value={t.status} onChange={(e) => setStatus.mutate(e.target.value)}>{opts(TICKET_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
            </div>
            <ErrorBox error={setStatus.error} />
            <p className="whitespace-pre-wrap text-sm">{t.description || <span className="text-slate-400">Sem descrição.</span>}</p>
            {t.solution && <div className="mt-3 rounded-md bg-green-50 p-3 text-sm"><div className="font-semibold text-green-800">Solução aplicada</div><p className="whitespace-pre-wrap">{t.solution}</p></div>}
          </section>
          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Comentários internos</h2>
            {t.comments.length === 0 && <p className="text-sm text-slate-500">Nenhum comentário.</p>}
            <ul className="space-y-2">{t.comments.map((c: any) => <li key={c.id} className="rounded-md bg-slate-50 p-2 text-sm"><div className="text-xs text-slate-500">{c.authorName} · {fmtDateTime(c.createdAt)}</div><p className="whitespace-pre-wrap">{c.body}</p></li>)}</ul>
            {canWrite && (
              <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); if (comment.trim()) addComment.mutate(); }}>
                <textarea className="input" rows={2} placeholder="Escreva um comentário interno…" value={comment} onChange={(e) => setComment(e.target.value)} />
                <ErrorBox error={addComment.error} />
                <button className="btn-primary" disabled={!comment.trim() || addComment.isPending}>Comentar</button>
              </form>
            )}
          </section>
          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Mensagens relacionadas</h2>
            {t.messages.length === 0 ? <p className="text-sm text-slate-500">Nenhuma mensagem vinculada.</p> : (
              <ul className="space-y-2">{t.messages.map((m: any) => <li key={m.id} className="rounded-md bg-slate-50 p-2 text-sm"><div className="text-xs text-slate-500">{m.senderName ?? m.conversation?.title} · {fmtDateTime(m.sentAt)}</div>{m.body ?? `[${m.type}]`}</li>)}</ul>
            )}
          </section>
        </div>
        <aside className="space-y-4">
          <section className="card p-4 text-sm">
            <dl className="space-y-1.5">
              {[['Solicitante', t.requester?.name], ['Contato', t.requester?.phone], ['Empresa', t.company?.name], ['Filial', t.branch?.name], ['Responsável', t.assignee?.name], ['Prazo', fmtDate(t.dueDate)]].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-2"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium">{v || '—'}</dd></div>))}
            </dl>
          </section>
          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Histórico</h2>
            <ul className="space-y-2 text-sm">{t.history.map((h: any) => (
              <li key={h.id}><div className="text-xs text-slate-500">{fmtDateTime(h.createdAt)} · {h.userName ?? 'sistema'}</div>
                {h.field ? <>{FIELD_LABEL[h.field] ?? h.field}: <span className="text-slate-500">{show(h.field, h.oldValue)}</span> → <b>{show(h.field, h.newValue)}</b></> : h.action}</li>))}</ul>
          </section>
        </aside>
      </div>
      {editing && <TicketFormModal initial={t} onClose={() => setEditing(false)} />}
    </>
  );
}
