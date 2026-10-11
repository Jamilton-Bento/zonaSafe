import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime, opts, PROCESSING } from '../lib/format';
import { useContacts } from '../lib/hooks';
import { Badge, Confirm, Empty, ErrorBox, Modal, PageHeader, Spinner } from '../components/ui';
import { TaskFormModal, TicketFormModal } from '../components/forms';

const TYPE_LABEL: Record<string, string> = { text: 'Texto', image: 'Imagem', audio: 'Áudio', video: 'Vídeo', document: 'Documento', sticker: 'Figurinha', contact: 'Contato', location: 'Local', other: 'Outro' };
const tone = (p: string) => ({ PENDENTE: 'yellow', ANALISADA: 'blue', IGNORADA: 'gray', CONVERTIDA: 'green' } as Record<string, string>)[p] ?? 'gray';

function LinkTask({ message, onClose }: { message: any; onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['tasks', 'todas', '', ''], queryFn: () => api.get<any[]>('/tasks?view=todas') });
  const [taskId, setTaskId] = useState('');
  const link = useMutation({ mutationFn: () => api.patch(`/messages/${message.id}`, { taskId }), onSuccess: () => { qc.invalidateQueries(); onClose(); } });
  return (
    <Modal title="Vincular a uma tarefa existente" onClose={onClose}>
      <select className="input mb-3" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
        <option value="">Selecione a tarefa…</option>
        {(data ?? []).map((t) => <option key={t.id} value={t.id}>#{t.number} {t.title}</option>)}
      </select>
      <ErrorBox error={link.error} />
      <div className="mt-3 flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={!taskId || link.isPending} onClick={() => link.mutate()}>Vincular</button></div>
    </Modal>
  );
}

export default function Messages() {
  const { canWrite, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState({ q: '', contactId: '', group: '', from: '', to: '', processing: '', page: 1 });
  const [sel, setSel] = useState<any>(null);
  const [mode, setMode] = useState<'task' | 'ticket' | 'link' | 'delete' | null>(null);
  const contacts = useContacts().data ?? [];
  const { data, isLoading, error } = useQuery({ queryKey: ['messages', f], queryFn: () => api.get<any>(`/messages${qs(f)}`), refetchInterval: 20_000 });
  const mark = useMutation({ mutationFn: ({ id, processing }: any) => api.patch<any>(`/messages/${id}`, { processing }), onSuccess: (m) => { setSel(m); qc.invalidateQueries({ queryKey: ['messages'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); } });
  const analyze = useMutation({ mutationFn: (id: string) => api.post(`/ai/messages/${id}/analyze`), onSuccess: () => { qc.invalidateQueries(); setSel(null); } });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/messages/${id}`), onSuccess: () => { setMode(null); setSel(null); qc.invalidateQueries(); } });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value, page: 1 });
  const afterConvert = (r: any) => { setSel(null); qc.invalidateQueries(); return r; };

  return (
    <>
      <PageHeader title="Central de mensagens" subtitle="Mensagens recebidas pelo WhatsApp. Nem toda mensagem é uma solicitação: decida o que vira tarefa ou chamado." />
      <div className="mb-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <input className="input lg:col-span-2" placeholder="Pesquisar no conteúdo ou remetente" value={f.q} onChange={set('q')} />
        <select className="input" value={f.contactId} onChange={set('contactId')}><option value="">Todos os contatos</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="input" value={f.group} onChange={set('group')}><option value="">Contatos e grupos</option><option value="0">Somente contatos</option><option value="1">Somente grupos</option></select>
        <select className="input" value={f.processing} onChange={set('processing')}><option value="">Qualquer status</option>{opts(PROCESSING).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <div className="flex items-center gap-1 sm:col-span-3 lg:col-span-2"><input type="date" className="input" value={f.from} onChange={set('from')} aria-label="De" /><span className="text-sm">até</span><input type="date" className="input" value={f.to} onChange={set('to')} aria-label="Até" /></div>
      </div>
      <ErrorBox error={error} />
      <div className="card overflow-x-auto">
        {isLoading ? <Spinner /> : !data?.items.length ? <Empty>Nenhuma mensagem encontrada. Se a integração do WhatsApp ainda não foi conectada, veja a página “Integração WhatsApp”.</Empty> : (
          <table className="w-full">
            <thead className="border-b bg-slate-50"><tr><th className="th">Data</th><th className="th">Contato / grupo</th><th className="th">Conteúdo</th><th className="th">Tipo</th><th className="th">Status</th><th className="th">IA</th><th className="th">Vínculos</th></tr></thead>
            <tbody className="divide-y">{data.items.map((m: any) => (
              <tr key={m.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSel(m)}>
                <td className="td whitespace-nowrap">{fmtDateTime(m.sentAt)}</td>
                <td className="td"><div className="font-medium">{m.conversation.title ?? m.conversation.remoteJid.split('@')[0]}</div>
                  <div className="text-xs text-slate-500">{m.conversation.isGroup ? `Grupo · ${m.senderName ?? ''}` : m.conversation.contact?.company?.name ?? ''}</div></td>
                <td className="td max-w-md truncate">{m.body ?? <i className="text-slate-400">[{TYPE_LABEL[m.type] ?? m.type}]</i>}{m.edited && <span className="ml-1 text-xs text-slate-400">(editada)</span>}</td>
                <td className="td">{TYPE_LABEL[m.type] ?? m.type}</td>
                <td className="td"><Badge tone={tone(m.processing)}>{PROCESSING[m.processing]}</Badge></td>
                <td className="td text-xs">{m.aiAnalysis?.status === 'CONCLUIDA' ? <Badge tone="blue">{m.aiAnalysis.intent} {Math.round((m.aiAnalysis.confidence ?? 0) * 100)}%</Badge> : m.aiAnalysis ? <Badge tone="red">falhou</Badge> : '—'}</td>
                <td className="td text-xs">{m.ticket && <div>Chamado #{m.ticket.number}</div>}{m.task && <div>Tarefa #{m.task.number}</div>}</td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
      {data && data.total > data.pageSize && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span>{data.total} mensagens</span>
          <div className="flex gap-2"><button className="btn-secondary" disabled={f.page === 1} onClick={() => setF({ ...f, page: f.page - 1 })}>Anterior</button><button className="btn-secondary" disabled={f.page * data.pageSize >= data.total} onClick={() => setF({ ...f, page: f.page + 1 })}>Próxima</button></div>
        </div>
      )}

      {sel && !mode && (
        <Modal title="Registro da mensagem" onClose={() => setSel(null)} wide>
          <dl className="mb-3 grid grid-cols-2 gap-2 text-sm">
            <div><dt className="text-slate-500">Conversa</dt><dd className="font-medium">{sel.conversation.title ?? sel.conversation.remoteJid}</dd></div>
            <div><dt className="text-slate-500">Remetente</dt><dd className="font-medium">{sel.senderName ?? '—'}</dd></div>
            <div><dt className="text-slate-500">Data e hora</dt><dd>{fmtDateTime(sel.sentAt)}</dd></div>
            <div><dt className="text-slate-500">Tipo / direção</dt><dd>{TYPE_LABEL[sel.type] ?? sel.type} · {sel.direction === 'ENTRADA' ? 'recebida' : 'enviada'}</dd></div>
            <div><dt className="text-slate-500">Status</dt><dd><Badge tone={tone(sel.processing)}>{PROCESSING[sel.processing]}</Badge>{sel.analyzedAt && <span className="ml-2 text-xs text-slate-500">{fmtDateTime(sel.analyzedAt)}</span>}</dd></div>
            <div><dt className="text-slate-500">ID original</dt><dd className="break-all text-xs">{sel.externalId}</dd></div>
          </dl>
          <div className="mb-3 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm">{sel.body ?? <i className="text-slate-400">Mensagem sem texto ({TYPE_LABEL[sel.type] ?? sel.type}). Mídias não são baixadas por este sistema.</i>}</div>
          <div className="mb-3 text-sm">
            {sel.ticket && <div>Chamado: <Link className="text-brand-700 hover:underline" to={`/chamados/${sel.ticket.id}`}>#{sel.ticket.number} {sel.ticket.title}</Link></div>}
            {sel.task && <div>Tarefa: <Link className="text-brand-700 hover:underline" to="/tarefas">#{sel.task.number} {sel.task.title}</Link></div>}
          </div>
          {sel.aiAnalysis?.status === 'CONCLUIDA' && <div className="mb-3 rounded-md bg-blue-50 p-2 text-sm"><b>IA:</b> {sel.aiAnalysis.intent} ({Math.round((sel.aiAnalysis.confidence ?? 0) * 100)}%) — {sel.aiAnalysis.summary}</div>}
          <ErrorBox error={mark.error ?? analyze.error} />
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => setMode('task')}>Criar tarefa</button>
              <button className="btn-primary" onClick={() => setMode('ticket')}>Criar chamado</button>
              <button className="btn-secondary" onClick={() => setMode('link')}>Vincular a tarefa existente</button>
              {sel.direction === 'ENTRADA' && (!sel.aiAnalysis || sel.aiAnalysis.status === 'FALHA') && <button className="btn-secondary" disabled={analyze.isPending} onClick={() => analyze.mutate(sel.id)}>{analyze.isPending ? 'Analisando…' : 'Analisar com IA'}</button>}
              <button className="btn-secondary" onClick={() => mark.mutate({ id: sel.id, processing: 'ANALISADA' })}>Marcar como analisada</button>
              <button className="btn-secondary" onClick={() => mark.mutate({ id: sel.id, processing: 'IGNORADA' })}>Sem necessidade de ação</button>
              {isAdmin && <button className="btn-secondary text-red-600" onClick={() => setMode('delete')}>Excluir</button>}
            </div>
          )}
        </Modal>
      )}
      {sel && mode === 'task' && <TaskFormModal sourceMessage={{ id: sel.id, body: sel.body, contactId: sel.conversation.contact?.id }} onClose={() => setMode(null)} onSaved={afterConvert} />}
      {sel && mode === 'ticket' && <TicketFormModal sourceMessage={{ id: sel.id, body: sel.body, contactId: sel.conversation.contact?.id }} onClose={() => setMode(null)} onSaved={afterConvert} />}
      {sel && mode === 'link' && <LinkTask message={sel} onClose={() => { setMode(null); setSel(null); }} />}
      {sel && mode === 'delete' && <Confirm message="Excluir definitivamente esta mensagem do sistema? (Não afeta o WhatsApp.)" onCancel={() => setMode(null)} onConfirm={() => del.mutate(sel.id)} />}
    </>
  );
}
