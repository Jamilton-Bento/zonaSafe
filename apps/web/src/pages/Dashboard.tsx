import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { fmtDate, fmtDateTime, isOverdue, PRIORITY, TASK_STATUS } from '../lib/format';
import { Badge, Empty, ErrorBox, PageHeader, priorityTone, Spinner, statusTone } from '../components/ui';

const CONNECTION: Record<string, [string, string]> = {
  open: ['Conectado', 'green'], connecting: ['Conectando…', 'yellow'], close: ['Desconectado', 'red'], unknown: ['Não confirmado', 'gray'],
};

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<any>('/dashboard'), refetchInterval: 30_000 });
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const c = data.counters;
  const cards: [string, number, string, string][] = [
    ['Chamados abertos', c.openTickets, '/chamados', 'text-brand-700'],
    ['Tarefas pendentes', c.pendingTasks, '/tarefas', 'text-slate-800'],
    ['Tarefas atrasadas', c.overdueTasks, '/tarefas', c.overdueTasks ? 'text-red-600' : 'text-slate-800'],
    ['Prazos de hoje', c.dueToday, '/tarefas', c.dueToday ? 'text-amber-600' : 'text-slate-800'],
    ['Solicitações da diretoria', c.directionRequests, '/tarefas', 'text-purple-700'],
    ['Orçamentos em andamento', c.quotesInProgress, '/orcamentos', 'text-slate-800'],
    ['Aguardando aprovação', c.quotesAwaitingApproval, '/orcamentos', 'text-slate-800'],
    ['Respostas da IA para aprovar', c.pendingDrafts, '/assistente', c.pendingDrafts ? 'text-amber-600' : 'text-slate-800'],
  ];
  const [connLabel, connTone] = CONNECTION[data.whatsapp.connection] ?? CONNECTION.unknown;
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Visão geral do que precisa de atenção" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([label, n, to, color]) => (
          <Link key={label} to={to} className="card p-4 hover:border-brand-500">
            <div className={`text-3xl font-semibold ${color}`}>{n}</div>
            <div className="text-sm text-slate-500">{label}</div>
          </Link>
        ))}
        <Link to="/whatsapp" className="card p-4 hover:border-brand-500">
          <div className="mb-1"><Badge tone={connTone}>{connLabel}</Badge>{data.whatsapp.paused && <> <Badge tone="orange">Envio pausado</Badge></>}</div>
          <div className="text-sm text-slate-500">Integração WhatsApp</div>
          {data.whatsapp.lastError && <div className="mt-1 truncate text-xs text-red-600" title={data.whatsapp.lastError}>{data.whatsapp.lastError}</div>}
        </Link>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="border-b px-4 py-3 font-semibold">O que preciso resolver agora?</h2>
          {data.solveNow.length === 0 ? <Empty>Nenhuma tarefa em aberto. 🎉</Empty> : (
            <ul className="divide-y">
              {data.solveNow.map((t: any) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                  <Badge tone={priorityTone(t.priority)}>{PRIORITY[t.priority]}</Badge>
                  <span className="min-w-0 flex-1 truncate font-medium">#{t.number} {t.title}</span>
                  {t.requester?.isDirector && <Badge tone="purple">Diretoria</Badge>}
                  <Badge tone={statusTone(t.status)}>{TASK_STATUS[t.status]}</Badge>
                  <span className={isOverdue(t.dueDate, t.status) ? 'font-semibold text-red-600' : 'text-slate-500'}>{t.dueDate ? fmtDate(t.dueDate) : 'sem prazo'}{isOverdue(t.dueDate, t.status) ? ' (atrasada)' : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="space-y-4">
          <section className="card">
            <h2 className="border-b px-4 py-3 font-semibold">Mensagens recentes</h2>
            {data.recentMessages.length === 0 ? <Empty>Nenhuma mensagem recebida ainda.</Empty> : (
              <ul className="divide-y">{data.recentMessages.map((m: any) => (
                <li key={m.id} className="px-4 py-2 text-sm">
                  <div className="flex justify-between text-xs text-slate-500"><span>{m.conversation?.title ?? m.senderName ?? 'Contato'}</span><span>{fmtDateTime(m.sentAt)}</span></div>
                  <div className="truncate">{m.body ?? `[${m.type}]`}</div>
                </li>))}</ul>
            )}
          </section>
          <section className="card">
            <h2 className="border-b px-4 py-3 font-semibold">Últimos atendimentos</h2>
            {data.lastServed.length === 0 ? <Empty>Nenhum chamado concluído.</Empty> : (
              <ul className="divide-y">{data.lastServed.map((t: any) => (
                <li key={t.id} className="px-4 py-2 text-sm"><Link className="text-brand-700 hover:underline" to={`/chamados/${t.id}`}>#{t.number} {t.title}</Link>
                  <div className="text-xs text-slate-500">{t.requester?.name ?? '—'} · {fmtDate(t.closedAt)}</div></li>))}</ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
