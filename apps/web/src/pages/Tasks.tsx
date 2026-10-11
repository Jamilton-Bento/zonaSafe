import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDate, isDueSoon, isOverdue, opts, PRIORITY, TASK_STATUS, toDateInput } from '../lib/format';
import { Badge, Confirm, Empty, ErrorBox, PageHeader, priorityTone, Spinner } from '../components/ui';
import { TaskFormModal } from '../components/forms';

const VIEWS: [string, string][] = [['minhas', 'Minhas tarefas'], ['hoje', 'Hoje'], ['proximos', 'Próximos dias'], ['atrasadas', 'Atrasadas'], ['sem_prazo', 'Sem prazo'], ['aguardando', 'Aguardando retorno'], ['concluidas', 'Concluídas'], ['todas', 'Todas']];

export default function Tasks() {
  const { canWrite, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [view, setView] = useState('todas');
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('');
  const [editing, setEditing] = useState<any | null | undefined>(undefined);
  const [removing, setRemoving] = useState<any>(null);
  const [quick, setQuick] = useState('');
  const { data, isLoading, error } = useQuery({ queryKey: ['tasks', view, search, priority], queryFn: () => api.get<any[]>(`/tasks${qs({ view, q: search, priority })}`) });
  const patch = useMutation({ mutationFn: ({ id, ...b }: any) => api.patch(`/tasks/${id}`, b), onSuccess: () => qc.invalidateQueries() });
  const create = useMutation({ mutationFn: (title: string) => api.post('/tasks', { title }), onSuccess: () => { setQuick(''); qc.invalidateQueries(); } });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/tasks/${id}`), onSuccess: () => { setRemoving(null); qc.invalidateQueries(); } });

  return (
    <>
      <PageHeader title="Tarefas" actions={canWrite && <button className="btn-primary" onClick={() => setEditing(null)}>+ Nova tarefa</button>} />
      {canWrite && (
        <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (quick.trim().length >= 2) create.mutate(quick.trim()); }}>
          <input className="input" placeholder="Registro rápido: digite o título e pressione Enter" value={quick} onChange={(e) => setQuick(e.target.value)} aria-label="Registro rápido de tarefa" />
          <button className="btn-secondary" disabled={create.isPending || quick.trim().length < 2}>Adicionar</button>
        </form>
      )}
      <div className="mb-3 flex flex-wrap gap-1">
        {VIEWS.map(([k, l]) => <button key={k} onClick={() => setView(k)} className={`rounded-full px-3 py-1 text-sm ${view === k ? 'bg-brand-600 text-white' : 'bg-white border hover:bg-slate-50'}`}>{l}</button>)}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Pesquisar tarefas…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[10rem]" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">Todas prioridades</option>{opts(PRIORITY).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      </div>
      <ErrorBox error={error ?? patch.error ?? create.error} />
      <div className="card overflow-x-auto">
        {isLoading ? <Spinner /> : !data?.length ? <Empty>Nenhuma tarefa nesta visualização.</Empty> : (
          <table className="w-full">
            <thead className="border-b bg-slate-50"><tr><th className="th">#</th><th className="th">Título</th><th className="th">Solicitante</th><th className="th">Prioridade</th><th className="th">Status</th><th className="th">Prazo</th><th className="th"></th></tr></thead>
            <tbody className="divide-y">
              {data.map((t) => {
                const late = isOverdue(t.dueDate, t.status), soon = isDueSoon(t.dueDate, t.status);
                return (
                  <tr key={t.id} className={late ? 'bg-red-50' : soon ? 'bg-amber-50' : ''}>
                    <td className="td text-slate-500">{t.number}</td>
                    <td className="td"><div className="font-medium">{t.title}</div>
                      <div className="text-xs text-slate-500">{[t.company?.name, t.branch?.name].filter(Boolean).join(' · ')}</div></td>
                    <td className="td">{t.requester?.name ?? '—'} {t.requester?.isDirector && <Badge tone="purple">Diretoria</Badge>}</td>
                    <td className="td">
                      {canWrite ? <select aria-label="Prioridade" className="input !w-auto py-0.5" value={t.priority} onChange={(e) => patch.mutate({ id: t.id, priority: e.target.value })}>{opts(PRIORITY).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : <Badge tone={priorityTone(t.priority)}>{PRIORITY[t.priority]}</Badge>}
                    </td>
                    <td className="td">
                      {canWrite ? <select aria-label="Status" className="input !w-auto py-0.5" value={t.status} onChange={(e) => patch.mutate({ id: t.id, status: e.target.value })}>{opts(TASK_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : TASK_STATUS[t.status]}
                    </td>
                    <td className="td whitespace-nowrap">
                      {canWrite ? <input aria-label="Prazo" type="date" className="input !w-auto py-0.5" value={toDateInput(t.dueDate)} onChange={(e) => patch.mutate({ id: t.id, dueDate: e.target.value || null })} /> : fmtDate(t.dueDate)}
                      {late && <div className="text-xs font-semibold text-red-600">Atrasada</div>}
                      {soon && <div className="text-xs font-semibold text-amber-600">Vence em breve</div>}
                    </td>
                    <td className="td whitespace-nowrap text-right">
                      {canWrite && <button className="btn-secondary mr-1" onClick={() => setEditing(t)}>Editar</button>}
                      {canWrite && t.status !== 'CONCLUIDA' && <button className="btn-secondary mr-1" onClick={() => patch.mutate({ id: t.id, status: 'CONCLUIDA' })}>Concluir</button>}
                      {isAdmin && <button className="btn-secondary text-red-600" onClick={() => setRemoving(t)}>Excluir</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {editing !== undefined && <TaskFormModal initial={editing ?? undefined} onClose={() => setEditing(undefined)} />}
      {removing && <Confirm message={`Excluir a tarefa "${removing.title}"? Esta ação não pode ser desfeita.`} onCancel={() => setRemoving(null)} onConfirm={() => remove.mutate(removing.id)} />}
    </>
  );
}
