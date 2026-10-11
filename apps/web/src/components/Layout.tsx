import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime, ROLE } from '../lib/format';

const NAV = [
  ['/', 'Dashboard', '📊'], ['/mensagens', 'Central de mensagens', '💬'], ['/chamados', 'Chamados', '🎫'], ['/tarefas', 'Tarefas', '✅'],
  ['/assistente', 'Assistente IA', '🤖'], ['/orcamentos', 'Orçamentos', '🧾'], ['/contatos', 'Contatos', '👤'], ['/empresas', 'Empresas e filiais', '🏢'],
  ['/relatorios', 'Relatórios', '📑'], ['/whatsapp', 'Integração WhatsApp', '📱'], ['/configuracoes', 'Configurações', '⚙️'],
] as const;

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useQuery({ queryKey: ['search', q], queryFn: () => api.get<any>(`/search${qs({ q })}`), enabled: q.trim().length >= 2 });
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const go = (path: string) => { setOpen(false); setQ(''); nav(path); };
  const groups: [string, any[], (x: any) => string, (x: any) => string][] = data ? [
    ['Chamados', data.tickets, (x) => `#${x.number} ${x.title}`, (x) => `/chamados/${x.id}`],
    ['Tarefas', data.tasks, (x) => `#${x.number} ${x.title}`, () => '/tarefas'],
    ['Contatos', data.contacts, (x) => x.name, () => '/contatos'],
    ['Mensagens', data.messages, (x) => (x.body ?? '').slice(0, 60), () => '/mensagens'],
    ['Orçamentos', data.quotes, (x) => `#${x.number} ${x.product}`, (x) => `/orcamentos/${x.id}`],
  ] : [];
  return (
    <div ref={ref} className="relative w-full max-w-md">
      <input className="input" placeholder="Pesquisar chamados, tarefas, contatos, mensagens…" value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} aria-label="Pesquisa global" />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-96 overflow-y-auto rounded-md border bg-white p-2 shadow-lg">
          {!data && <div className="p-2 text-sm text-slate-500">Buscando…</div>}
          {data && groups.every(([, l]) => !l.length) && <div className="p-2 text-sm text-slate-500">Nada encontrado.</div>}
          {groups.map(([title, list, label, path]) => list.length > 0 && (
            <div key={title} className="mb-1">
              <div className="px-2 text-xs font-semibold uppercase text-slate-400">{title}</div>
              {list.map((x) => <button key={x.id} className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-slate-100" onClick={() => go(path(x))}>{label(x)}</button>)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Bell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data = [] } = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<any[]>('/notifications'), refetchInterval: 60_000 });
  const read = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const unread = data.filter((n) => !n.read).length;
  return (
    <div className="relative">
      <button className="btn-secondary relative" onClick={() => setOpen(!open)} aria-label="Notificações">🔔{unread > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{unread}</span>}</button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-80 rounded-md border bg-white p-2 shadow-lg">
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-sm font-semibold">Notificações</span>
            {unread > 0 && <button className="text-xs text-brand-600" onClick={() => read.mutate()}>Marcar como lidas</button>}
          </div>
          {data.length === 0 && <div className="p-2 text-sm text-slate-500">Nenhuma notificação.</div>}
          {data.slice(0, 10).map((n) => (
            <button key={n.id} className={`block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100 ${n.read ? '' : 'bg-blue-50'}`} onClick={() => { setOpen(false); if (n.link) nav(n.link); }}>
              <div className="font-medium">{n.title}</div>
              {n.body && <div className="text-xs text-slate-600">{n.body}</div>}
              <div className="text-xs text-slate-400">{fmtDateTime(n.createdAt)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  return (
    <div className="flex min-h-screen">
      <aside className={`${menu ? 'block' : 'hidden'} fixed inset-y-0 left-0 z-20 w-60 shrink-0 bg-slate-900 p-3 text-slate-200 md:static md:block`}>
        <div className="mb-4 px-2 text-lg font-bold text-white">Central de TI</div>
        <nav className="space-y-0.5">
          {NAV.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setMenu(false)}
              className={({ isActive }) => `flex items-center gap-2 rounded-md px-2 py-2 text-sm ${isActive ? 'bg-brand-600 text-white' : 'hover:bg-slate-800'}`}>
              <span aria-hidden>{icon}</span>{label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b bg-white px-4 py-2">
          <button className="btn-secondary md:hidden" onClick={() => setMenu(!menu)} aria-label="Menu">☰</button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-3">
            <Bell />
            <div className="hidden text-right text-xs sm:block">
              <div className="font-medium">{user?.name}</div>
              <div className="text-slate-500">{ROLE[user?.role ?? '']}</div>
            </div>
            <button className="btn-secondary" onClick={logout}>Sair</button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
