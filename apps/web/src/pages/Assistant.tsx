import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime } from '../lib/format';
import { Badge, Empty, ErrorBox, PageHeader, Spinner } from '../components/ui';

const INTENT: Record<string, string> = { chamado: 'Chamado', tarefa: 'Tarefa', orcamento: 'Orçamento', informativo: 'Informativo', conversa: 'Conversa' };
const ACTION: Record<string, [string, string]> = {
  chamado_criado: ['Chamado aberto', 'green'], tarefa_criada: ['Tarefa criada', 'green'], orcamento_criado: ['Orçamento montado', 'green'],
  chamado_vinculado: ['Vinculada a chamado', 'blue'], nenhuma: ['Sem ação necessária', 'gray'], sugestao: ['Aguardando sua decisão', 'yellow'],
};

function Draft({ d }: { d: any }) {
  const qc = useQueryClient();
  const [text, setText] = useState(d.text);
  const done = () => { qc.invalidateQueries({ queryKey: ['ai-drafts'] }); qc.invalidateQueries({ queryKey: ['ai-status'] }); };
  const approve = useMutation({ mutationFn: () => api.post(`/ai/drafts/${d.id}/approve`, { text }), onSuccess: done, onError: done });
  const discard = useMutation({ mutationFn: () => api.post(`/ai/drafts/${d.id}/discard`), onSuccess: done });
  return (
    <li className="rounded-md border p-3 text-sm">
      <div className="mb-1 text-xs text-slate-500">Para: <b>{d.message.conversation.title ?? d.message.senderName ?? d.message.conversation.remoteJid}</b> · em resposta a “{(d.message.body ?? '').slice(0, 100)}” · {fmtDateTime(d.createdAt)}</div>
      {d.status === 'FALHA' && <div className="mb-1 text-xs text-red-700">Falha no envio: {d.error}</div>}
      <textarea className="input" rows={3} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} aria-label="Texto da resposta" />
      <ErrorBox error={approve.error ?? discard.error} />
      <div className="mt-2 flex gap-2"><button className="btn-primary" disabled={approve.isPending || !text.trim()} onClick={() => approve.mutate()}>Aprovar e enviar</button><button className="btn-secondary" disabled={discard.isPending} onClick={() => discard.mutate()}>Descartar</button></div>
    </li>
  );
}

export default function Assistant() {
  const { canWrite, isAdmin } = useAuth();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['ai-status'], queryFn: () => api.get<any>('/ai/status'), refetchInterval: 15_000 });
  const drafts = useQuery({ queryKey: ['ai-drafts'], queryFn: async () => [...await api.get<any[]>('/ai/drafts?status=PENDENTE'), ...await api.get<any[]>('/ai/drafts?status=FALHA')], refetchInterval: 15_000 });
  const analyses = useQuery({ queryKey: ['ai-analyses'], queryFn: () => api.get<any[]>('/ai/analyses'), refetchInterval: 15_000 });
  const [threshold, setThreshold] = useState(80);
  const s = status.data;
  useEffect(() => { if (s) setThreshold(Math.round(s.config.autoCreateThreshold * 100)); }, [s?.config.autoCreateThreshold]);
  const cfg = useMutation({ mutationFn: (b: any) => api.put('/ai/config', b), onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-status'] }) });
  const resume = useMutation({ mutationFn: () => api.post('/ai/resume'), onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-status'] }) });
  const accept = useMutation({ mutationFn: ({ id, as }: any) => api.post(`/ai/analyses/${id}/accept`, as ? { as } : {}), onSuccess: () => qc.invalidateQueries() });
  const retry = useMutation({ mutationFn: (messageId: string) => api.post(`/ai/messages/${messageId}/analyze`), onSuccess: () => qc.invalidateQueries() });

  if (status.isLoading) return <Spinner />;
  return (
    <>
      <PageHeader title="Assistente IA" subtitle="A IA classifica as mensagens, abre chamados/tarefas, monta solicitações de orçamento e redige respostas. Respostas só saem após a sua aprovação." />
      <ErrorBox error={status.error} />
      {s && (
        <section className="card mb-4 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {s.config.enabled ? <Badge tone="green">IA ativada</Badge> : <Badge>IA desativada</Badge>}
            {s.paused && <Badge tone="orange">Pausada</Badge>}
            {!s.keyConfigured && <Badge tone="red">GEMINI_API_KEY ausente</Badge>}
            <span className="text-slate-500">Modelo: {s.provider}/{s.model} · hoje: {s.usedToday}/{s.dailyLimit} análises</span>
          </div>
          {s.paused && <p className="mt-2 text-orange-700">{s.pausedReason} {isAdmin && <button className="ml-2 btn-secondary" onClick={() => resume.mutate()}>Retomar</button>}</p>}
          {s.lastError && <p className="mt-1 text-xs text-red-700">Último erro: {s.lastError} ({fmtDateTime(s.lastErrorAt)})</p>}
          {isAdmin && (
            <div className="mt-3 space-y-2 border-t pt-3">
              <label className="flex items-center gap-2"><input type="checkbox" checked={s.config.enabled} onChange={(e) => cfg.mutate({ enabled: e.target.checked })} /> <b>Ativar a IA</b> (processa as mensagens recebidas)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={s.config.draftReplies} onChange={(e) => cfg.mutate({ draftReplies: e.target.checked })} /> Gerar rascunhos de resposta (nunca enviados sem aprovação)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={s.config.includeGroups} onChange={(e) => cfg.mutate({ includeGroups: e.target.checked })} /> Analisar também mensagens de grupos (sem rascunho de resposta)</label>
              <div className="flex items-center gap-2"><span>Confiança mínima para a IA agir sozinha:</span><input type="number" className="input !w-20" min={50} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />%
                <button className="btn-secondary" onClick={() => cfg.mutate({ autoCreateThreshold: threshold / 100 })}>Salvar</button></div>
              <ErrorBox error={cfg.error} />
              <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900"><b>Privacidade:</b> com a IA ativada, o texto das mensagens (com e-mails, CPF/CNPJ e telefones mascarados) é enviado ao Google (Gemini, plano gratuito), que pode usá-lo para melhorar seus produtos. Avise os usuários e evite ativar se houver conteúdo sigiloso. A IA pode errar: confira o que ela cria. Ela <b>nunca inventa preços</b>: ofertas de orçamento continuam sendo cadastradas por você.</p>
            </div>
          )}
        </section>
      )}

      <section className="card mb-4 p-4">
        <h2 className="mb-2 font-semibold">Respostas aguardando aprovação ({drafts.data?.length ?? 0})</h2>
        {drafts.isLoading ? <Spinner /> : !drafts.data?.length ? <Empty>Nenhuma resposta pendente.</Empty> : canWrite ? <ul className="space-y-3">{drafts.data.map((d) => <Draft key={d.id} d={d} />)}</ul> : <Empty>Somente leitura.</Empty>}
      </section>

      <section className="card">
        <h2 className="border-b px-4 py-3 font-semibold">Análises recentes</h2>
        <ErrorBox error={accept.error ?? retry.error} />
        {!analyses.data?.length ? <Empty>A IA ainda não analisou nenhuma mensagem.</Empty> : (
          <div className="overflow-x-auto"><table className="w-full"><thead className="border-b bg-slate-50"><tr><th className="th">Quando</th><th className="th">Mensagem</th><th className="th">Classificação</th><th className="th">Resultado</th><th className="th"></th></tr></thead>
            <tbody className="divide-y">{analyses.data.map((a) => {
              const [al, at] = ACTION[a.action ?? ''] ?? ['—', 'gray'];
              return (
                <tr key={a.id}>
                  <td className="td whitespace-nowrap">{fmtDateTime(a.createdAt)}</td>
                  <td className="td max-w-xs"><div className="truncate">{a.message.body}</div><div className="text-xs text-slate-500">{a.message.senderName ?? a.message.conversation.title}</div></td>
                  <td className="td">{a.status === 'FALHA' ? <Badge tone="red">Falhou</Badge> : <><Badge tone="blue">{INTENT[a.intent] ?? a.intent}</Badge> <span className="text-xs text-slate-500">{Math.round((a.confidence ?? 0) * 100)}%</span><div className="text-xs text-slate-500">{a.summary}</div></>}
                    {a.error && <div className="text-xs text-red-700">{a.error}</div>}</td>
                  <td className="td">{a.status === 'CONCLUIDA' && <Badge tone={at}>{al}</Badge>}</td>
                  <td className="td whitespace-nowrap text-right">
                    {canWrite && a.status === 'FALHA' && <button className="btn-secondary" disabled={retry.isPending} onClick={() => retry.mutate(a.messageId)}>Tentar de novo</button>}
                    {canWrite && a.action === 'sugestao' && <>
                      <button className="btn-secondary mr-1" onClick={() => accept.mutate({ id: a.id, as: 'chamado' })}>Virar chamado</button>
                      <button className="btn-secondary mr-1" onClick={() => accept.mutate({ id: a.id, as: 'tarefa' })}>Virar tarefa</button>
                      <button className="btn-secondary" onClick={() => accept.mutate({ id: a.id, as: 'orcamento' })}>Virar orçamento</button></>}
                  </td>
                </tr>);
            })}</tbody></table></div>
        )}
      </section>
    </>
  );
}
