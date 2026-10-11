import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { CATEGORY, fmtDate, isDueSoon, isOverdue, opts, PRIORITY, TICKET_STATUS } from '../lib/format';
import { useCompanies } from '../lib/hooks';
import { Badge, Empty, ErrorBox, PageHeader, priorityTone, Spinner, statusTone } from '../components/ui';
import { TicketFormModal } from '../components/forms';

export default function Tickets() {
  const { canWrite } = useAuth();
  const [f, setF] = useState({ q: '', status: '', priority: '', category: '', companyId: '', open: '', sort: 'openedAt', dir: 'desc' });
  const [creating, setCreating] = useState(false);
  const companies = useCompanies().data ?? [];
  const { data, isLoading, error } = useQuery({ queryKey: ['tickets', f], queryFn: () => api.get<any[]>(`/tickets${qs(f)}`) });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const sortBy = (k: string) => setF({ ...f, sort: k, dir: f.sort === k && f.dir === 'desc' ? 'asc' : 'desc' });
  const arrow = (k: string) => (f.sort === k ? (f.dir === 'asc' ? ' ▲' : ' ▼') : '');
  return (
    <>
      <PageHeader title="Chamados" subtitle="Help desk" actions={canWrite && <button className="btn-primary" onClick={() => setCreating(true)}>+ Novo chamado</button>} />
      <div className="mb-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <input className="input lg:col-span-2" placeholder="Pesquisar por título, descrição ou número" value={f.q} onChange={set('q')} />
        <select className="input" value={f.status} onChange={set('status')}><option value="">Todos os status</option>{opts(TICKET_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <select className="input" value={f.category} onChange={set('category')}><option value="">Todas as categorias</option>{opts(CATEGORY).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <select className="input" value={f.priority} onChange={set('priority')}><option value="">Todas as prioridades</option>{opts(PRIORITY).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <select className="input" value={f.companyId} onChange={set('companyId')}><option value="">Todas as empresas</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </div>
      <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.open === '1'} onChange={(e) => setF({ ...f, open: e.target.checked ? '1' : '' })} /> Somente chamados em aberto</label>
      <ErrorBox error={error} />
      <div className="card overflow-x-auto">
        {isLoading ? <Spinner /> : !data?.length ? <Empty>Nenhum chamado encontrado.</Empty> : (
          <table className="w-full">
            <thead className="border-b bg-slate-50"><tr>
              <th className="th cursor-pointer" onClick={() => sortBy('number')}>Nº{arrow('number')}</th><th className="th">Título</th><th className="th">Solicitante</th><th className="th">Categoria</th>
              <th className="th cursor-pointer" onClick={() => sortBy('priority')}>Prioridade{arrow('priority')}</th><th className="th">Status</th>
              <th className="th cursor-pointer" onClick={() => sortBy('dueDate')}>Prazo{arrow('dueDate')}</th><th className="th cursor-pointer" onClick={() => sortBy('openedAt')}>Abertura{arrow('openedAt')}</th>
            </tr></thead>
            <tbody className="divide-y">{data.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="td text-slate-500">{t.number}</td>
                <td className="td"><Link to={`/chamados/${t.id}`} className="font-medium text-brand-700 hover:underline">{t.title}</Link>
                  <div className="text-xs text-slate-500">{[t.company?.name, t.branch?.name].filter(Boolean).join(' · ')}</div></td>
                <td className="td">{t.requester?.name ?? '—'}</td>
                <td className="td">{CATEGORY[t.category]}</td>
                <td className="td"><Badge tone={priorityTone(t.priority)}>{PRIORITY[t.priority]}</Badge></td>
                <td className="td"><Badge tone={statusTone(t.status)}>{TICKET_STATUS[t.status]}</Badge></td>
                <td className={`td ${isOverdue(t.dueDate, t.status) ? 'font-semibold text-red-600' : isDueSoon(t.dueDate, t.status) ? 'text-amber-600' : ''}`}>{fmtDate(t.dueDate)}</td>
                <td className="td">{fmtDate(t.openedAt)}</td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
      {creating && <TicketFormModal onClose={() => setCreating(false)} />}
    </>
  );
}
