import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime, ROLE } from '../lib/format';
import { Badge, ErrorBox, Field, Modal, PageHeader, Spinner } from '../components/ui';

function NewUser({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ name: '', email: '', password: '', role: 'TECNICO' });
  const save = useMutation({ mutationFn: () => api.post('/users', v), onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); onClose(); } });
  return (
    <Modal title="Novo usuário" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nome"><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="E-mail"><input className="input" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
        <Field label="Senha (mín. 10 caracteres)"><input className="input" type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} /></Field>
        <Field label="Perfil"><select className="input" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })}>{Object.entries(ROLE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <ErrorBox error={save.error} />
        <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Criar</button></div>
      </div>
    </Modal>
  );
}

export default function Settings() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [newUser, setNewUser] = useState(false);
  const [days, setDays] = useState('');
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<any[]>('/users'), enabled: isAdmin });
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<{ retentionDays: number }>('/settings'), enabled: isAdmin });
  const audit = useQuery({ queryKey: ['audit'], queryFn: () => api.get<any[]>('/audit'), enabled: isAdmin });
  useEffect(() => { if (settings.data) setDays(String(settings.data.retentionDays)); }, [settings.data]);
  const patchUser = useMutation({ mutationFn: ({ id, ...b }: any) => api.patch(`/users/${id}`, b), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) });
  const saveDays = useMutation({ mutationFn: () => api.put('/settings', { retentionDays: Number(days) }), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }) });
  const purge = useMutation({ mutationFn: () => api.post<any>('/messages/purge', { days: Number(days) }) });

  if (!isAdmin) return (<><PageHeader title="Configurações" /><div className="card p-4 text-sm">Você está conectado como <b>{user?.name}</b> ({ROLE[user!.role]}). As configurações do sistema são restritas a administradores.</div></>);
  return (
    <>
      <PageHeader title="Configurações" />
      <section className="card mb-6">
        <div className="flex items-center justify-between border-b px-4 py-3"><h2 className="font-semibold">Usuários</h2><button className="btn-primary" onClick={() => setNewUser(true)}>+ Novo usuário</button></div>
        {users.isLoading ? <Spinner /> : (
          <table className="w-full"><thead className="border-b bg-slate-50"><tr><th className="th">Nome</th><th className="th">E-mail</th><th className="th">Perfil</th><th className="th">Situação</th><th className="th"></th></tr></thead>
            <tbody className="divide-y">{users.data?.map((u) => (
              <tr key={u.id}><td className="td font-medium">{u.name}</td><td className="td">{u.email}</td>
                <td className="td"><select className="input !w-auto py-0.5" value={u.role} disabled={u.id === user!.id} onChange={(e) => patchUser.mutate({ id: u.id, role: e.target.value })}>{Object.entries(ROLE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                <td className="td">{u.active ? <Badge tone="green">Ativo</Badge> : <Badge>Inativo</Badge>}</td>
                <td className="td text-right">{u.id !== user!.id && <button className="btn-secondary" onClick={() => patchUser.mutate({ id: u.id, active: !u.active })}>{u.active ? 'Desativar' : 'Ativar'}</button>}</td></tr>))}</tbody></table>
        )}
        <div className="p-3"><ErrorBox error={patchUser.error} /></div>
      </section>
      <section className="card mb-6 p-4">
        <h2 className="mb-2 font-semibold">Redefinir senha de usuário</h2>
        <ResetPassword users={users.data ?? []} />
      </section>
      <section className="card mb-6 p-4">
        <h2 className="mb-1 font-semibold">Retenção de mensagens</h2>
        <p className="mb-3 text-sm text-slate-500">Mensagens do WhatsApp com mais de N dias são removidas automaticamente toda madrugada (03:10), exceto as vinculadas a tarefas ou chamados. Eventos técnicos de webhook são mantidos por 30 dias.</p>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Dias de retenção"><input className="input w-32" type="number" min={7} max={3650} value={days} onChange={(e) => setDays(e.target.value)} /></Field>
          <button className="btn-primary" disabled={saveDays.isPending} onClick={() => saveDays.mutate()}>Salvar</button>
          <button className="btn-secondary text-red-600" disabled={purge.isPending} onClick={() => window.confirm(`Apagar agora as mensagens com mais de ${days} dias (não vinculadas)?`) && purge.mutate()}>Aplicar agora</button>
        </div>
        <ErrorBox error={saveDays.error ?? purge.error} />
        {purge.data && <p className="mt-2 text-sm text-green-700">Removidas {purge.data.messages} mensagens e {purge.data.webhookEvents} eventos técnicos.</p>}
      </section>
      <section className="card">
        <h2 className="border-b px-4 py-3 font-semibold">Auditoria (últimos 200 registros)</h2>
        <div className="max-h-96 overflow-auto">
          <table className="w-full"><thead className="sticky top-0 border-b bg-slate-50"><tr><th className="th">Quando</th><th className="th">Usuário</th><th className="th">Ação</th><th className="th">Detalhe</th></tr></thead>
            <tbody className="divide-y">{audit.data?.map((a) => <tr key={a.id}><td className="td whitespace-nowrap">{fmtDateTime(a.createdAt)}</td><td className="td">{a.userEmail ?? '—'}</td><td className="td">{a.action}</td><td className="td text-slate-500">{a.detail}</td></tr>)}</tbody></table>
        </div>
      </section>
      {newUser && <NewUser onClose={() => setNewUser(false)} />}
    </>
  );
}

function ResetPassword({ users }: { users: any[] }) {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const m = useMutation({ mutationFn: () => api.patch(`/users/${id}`, { password }), onSuccess: () => setPassword('') });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Usuário"><select className="input" value={id} onChange={(e) => setId(e.target.value)}><option value="">Selecione…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
      <Field label="Nova senha (mín. 10)"><input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <button className="btn-primary" disabled={!id || password.length < 10 || m.isPending} onClick={() => m.mutate()}>Redefinir</button>
      <ErrorBox error={m.error} />{m.isSuccess && <span className="text-sm text-green-700">Senha alterada.</span>}
    </div>
  );
}
