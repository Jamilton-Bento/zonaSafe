import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { fmtDate, TASK_STATUS, TICKET_STATUS } from '../lib/format';
import { useBranches, useCompanies } from '../lib/hooks';
import { Badge, ErrorBox, Modal, PageHeader } from '../components/ui';
import SimpleCrud from '../components/SimpleCrud';
import { Link } from 'react-router-dom';

function ContactHistory({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error } = useQuery({ queryKey: ['contact', id], queryFn: () => api.get<any>(`/contacts/${id}`) });
  return (
    <Modal title={data ? `Atendimentos de ${data.name}` : 'Atendimentos'} onClose={onClose} wide>
      <ErrorBox error={error} />
      {data && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div><h3 className="mb-1 font-semibold">Chamados ({data.tickets.length})</h3>{data.tickets.length === 0 && <p className="text-sm text-slate-500">Nenhum.</p>}
            <ul className="space-y-1 text-sm">{data.tickets.map((t: any) => <li key={t.id}><Link className="text-brand-700 hover:underline" to={`/chamados/${t.id}`}>#{t.number} {t.title}</Link> <Badge>{TICKET_STATUS[t.status]}</Badge></li>)}</ul></div>
          <div><h3 className="mb-1 font-semibold">Tarefas ({data.tasks.length})</h3>{data.tasks.length === 0 && <p className="text-sm text-slate-500">Nenhuma.</p>}
            <ul className="space-y-1 text-sm">{data.tasks.map((t: any) => <li key={t.id}>#{t.number} {t.title} <Badge>{TASK_STATUS[t.status]}</Badge> <span className="text-xs text-slate-500">{fmtDate(t.dueDate)}</span></li>)}</ul></div>
        </div>
      )}
    </Modal>
  );
}

export default function Contacts() {
  const companies = useCompanies().data ?? [];
  const branches = useBranches().data ?? [];
  const [history, setHistory] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Contatos" subtitle="Funcionários, diretoria e demais contatos. O telefone (com DDI, ex.: 5511999999999) é usado para reconhecer quem enviou cada mensagem." />
      <SimpleCrud title="Contatos e funcionários" endpoint="/contacts" queryKey="contacts" newLabel="+ Novo contato"
        fields={[
          { name: 'name', label: 'Nome', required: true }, { name: 'phone', label: 'Telefone WhatsApp (com DDI)' }, { name: 'email', label: 'E-mail' }, { name: 'jobTitle', label: 'Cargo' },
          { name: 'companyId', label: 'Empresa', type: 'select', options: companies.map((c) => ({ value: c.id, label: c.name })) },
          { name: 'branchId', label: 'Filial', type: 'select', options: branches.map((b) => ({ value: b.id, label: `${b.company?.name ?? ''} — ${b.name}` })) },
          { name: 'isDirector', label: 'Diretoria', type: 'checkbox' }, { name: 'notes', label: 'Observações', type: 'textarea' }, { name: 'active', label: 'Ativo', type: 'checkbox' },
        ]}
        columns={[
          { header: 'Nome', render: (r) => <><b>{r.name}</b> {r.isDirector && <Badge tone="purple">Diretoria</Badge>}</> },
          { header: 'Telefone', render: (r) => r.phone ?? '—' }, { header: 'Empresa / filial', render: (r) => [r.company?.name, r.branch?.name].filter(Boolean).join(' · ') || '—' },
          { header: 'Atendimentos', render: (r) => <button className="text-brand-700 hover:underline" onClick={() => setHistory(r.id)}>ver chamados e tarefas</button> },
        ]} />
      {history && <ContactHistory id={history} onClose={() => setHistory(null)} />}
    </>
  );
}
