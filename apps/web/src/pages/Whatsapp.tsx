import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime } from '../lib/format';
import { Badge, ErrorBox, PageHeader, Spinner, Confirm } from '../components/ui';

const CONN: Record<string, [string, string]> = {
  open: ['Conectado (confirmado pela API)', 'green'], connecting: ['Conectando…', 'yellow'], close: ['Desconectado', 'red'], unknown: ['Estado não confirmado', 'gray'],
};

export default function Whatsapp() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [confirmDisc, setConfirmDisc] = useState(false);
  const [testTo, setTestTo] = useState('');
  const status = useQuery({
    queryKey: ['wa-status'], queryFn: () => api.get<any>('/whatsapp/status'),
    refetchInterval: (q) => (q.state.data?.connection === 'open' ? 30_000 : 5_000),
  });
  const events = useQuery({ queryKey: ['wa-events'], queryFn: () => api.get<any[]>('/whatsapp/events?status=FALHA'), enabled: isAdmin });
  const refresh = () => qc.invalidateQueries({ queryKey: ['wa-status'] });
  const ensure = useMutation({ mutationFn: () => api.post('/whatsapp/instance/ensure'), onSuccess: refresh });
  const qr = useMutation({ mutationFn: () => api.post<any>('/whatsapp/qr'), onSuccess: refresh });
  const disc = useMutation({ mutationFn: () => api.post('/whatsapp/disconnect'), onSuccess: () => { setConfirmDisc(false); refresh(); } });
  const pause = useMutation({ mutationFn: (paused: boolean) => api.post('/whatsapp/pause', { paused }), onSuccess: refresh });
  const test = useMutation({ mutationFn: () => api.post('/whatsapp/send-test', { to: testTo }) });
  const reprocess = useMutation({ mutationFn: (id: string) => api.post(`/whatsapp/events/${id}/reprocess`), onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-events'] }) });

  if (status.isLoading) return <Spinner />;
  const s = status.data;
  const [label, tone] = s ? CONN[s.connection] ?? CONN.unknown : CONN.unknown;
  const qrData = s?.qr ?? qr.data?.qr;
  return (
    <>
      <PageHeader title="Integração WhatsApp" subtitle="Evolution API (conexão não oficial via WhatsApp Web)" actions={<button className="btn-secondary" onClick={() => status.refetch()} disabled={status.isFetching}>{status.isFetching ? 'Atualizando…' : 'Atualizar estado'}</button>} />
      {(status.error || (s && !s.apiReachable)) && (
        <div role="alert" className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <b>Integração indisponível.</b> O servidor da Evolution API não respondeu. O restante do sistema continua funcionando normalmente; mensagens não serão recebidas nem enviadas até a integração voltar.
          {s?.lastError && <div className="mt-1 text-xs">Último erro: {s.lastError}</div>}
        </div>
      )}
      {s && !s.apiKeyConfigured && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">EVOLUTION_API_KEY não está configurada no .env.</div>}
      <ErrorBox error={status.error} />
      {s && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-4 text-sm">
            <h2 className="mb-3 font-semibold">Estado</h2>
            <dl className="space-y-2">
              <div className="flex justify-between"><dt className="text-slate-500">Conexão</dt><dd><Badge tone={tone}>{label}</Badge></dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Instância configurada</dt><dd className="font-medium">{s.instance}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Última confirmação da API</dt><dd>{fmtDateTime(s.confirmedAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Última conexão</dt><dd>{fmtDateTime(s.lastConnectedAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Última mensagem recebida</dt><dd>{fmtDateTime(s.lastMessageAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Envio automático</dt><dd>{s.paused ? <Badge tone="orange">Pausado</Badge> : <Badge tone="green">Ativo</Badge>}</dd></div>
              {s.paused && s.pausedReason && <div className="text-xs text-orange-700">{s.pausedReason}</div>}
              <div className="flex justify-between"><dt className="text-slate-500">Envios hoje</dt><dd>{s.sendsToday?.count ?? 0}</dd></div>
              <div><dt className="text-slate-500">Último erro conhecido</dt><dd className={s.lastError ? 'text-red-700' : ''}>{s.lastError ? `${s.lastError} (${fmtDateTime(s.lastErrorAt)})` : 'Nenhum'}</dd></div>
            </dl>
            {isAdmin && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-secondary" onClick={() => pause.mutate(!s.paused)}>{s.paused ? 'Retomar envio automático' : 'Pausar envio automático'}</button>
                {s.connection === 'open' && <button className="btn-secondary text-red-600" onClick={() => setConfirmDisc(true)}>Desconectar sessão</button>}
              </div>
            )}
            <ErrorBox error={pause.error ?? disc.error} />
          </section>

          <section className="card p-4 text-sm">
            <h2 className="mb-3 font-semibold">Conectar por QR Code</h2>
            {!isAdmin ? <p className="text-slate-500">Somente administradores podem conectar ou reconectar o WhatsApp.</p> : s.connection === 'open' ? (
              <p className="text-green-700">A sessão está conectada. Nada a fazer.</p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  <button className="btn-secondary" disabled={ensure.isPending} onClick={() => ensure.mutate()}>1. Preparar instância e webhook</button>
                  <button className="btn-primary" disabled={qr.isPending} onClick={() => qr.mutate()}>2. Gerar QR Code</button>
                </div>
                {ensure.isSuccess && <p className="mb-2 text-green-700">Instância pronta e webhook configurado.</p>}
                <ErrorBox error={ensure.error ?? qr.error} />
                {qrData ? (
                  <div className="mt-2 text-center">
                    <img src={qrData.base64.startsWith('data:') ? qrData.base64 : `data:image/png;base64,${qrData.base64}`} alt="QR Code para conectar o WhatsApp" className="mx-auto h-64 w-64 rounded border" />
                    <p className="mt-1 text-xs text-slate-500">O QR Code expira em cerca de {qrData.expiresInSeconds ?? 45}s e não é armazenado. Se expirar, gere outro.</p>
                  </div>
                ) : qr.isSuccess ? <p className="text-slate-500">A API não devolveu um QR Code agora. Aguarde alguns segundos e tente novamente.</p> : null}
              </>
            )}
          </section>

          <section className="card p-4 text-sm lg:col-span-2">
            <h2 className="mb-2 font-semibold">Instruções e cuidados</h2>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Use <b>um número secundário autorizado</b> nos testes iniciais; não use a conta principal da empresa.</li>
              <li>Clique em “Preparar instância e webhook”, depois em “Gerar QR Code”. No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho.</li>
              <li>O estado só aparece como “Conectado” depois que a Evolution API confirma.</li>
              <li>Se cair a conexão: gere um novo QR Code (limite de 5 tentativas por hora, com intervalo mínimo entre elas). Evite insistir: reconexões excessivas aumentam o risco de restrição.</li>
              <li>Para remover a sessão com segurança: “Desconectar sessão” e depois remova o aparelho em WhatsApp → Aparelhos conectados.</li>
            </ol>
            <p className="mt-2 text-amber-800">A Evolution API usa o protocolo do WhatsApp Web, que não é oficial: <b>não há garantia contra bloqueio ou instabilidade</b>. Não envie mensagens em massa. O sistema pausa os envios após falhas seguidas.</p>
          </section>

          {isAdmin && (
            <section className="card p-4 text-sm">
              <h2 className="mb-2 font-semibold">Envio de teste</h2>
              <p className="mb-2 text-slate-500">Envia uma mensagem curta a um número ou grupo que você autorizou.</p>
              <div className="flex gap-2"><input className="input" placeholder="5511999999999 ou ...@g.us" value={testTo} onChange={(e) => setTestTo(e.target.value)} /><button className="btn-secondary" disabled={test.isPending || testTo.length < 8} onClick={() => test.mutate()}>Enviar</button></div>
              <ErrorBox error={test.error} />{test.isSuccess && <p className="mt-1 text-green-700">Mensagem enviada.</p>}
            </section>
          )}
          {isAdmin && (
            <section className="card p-4 text-sm">
              <h2 className="mb-2 font-semibold">Eventos com falha</h2>
              {!events.data?.length ? <p className="text-slate-500">Nenhum evento com falha.</p> : (
                <ul className="space-y-2">{events.data.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-2 rounded bg-red-50 p-2"><div><b>{e.event}</b> · {fmtDateTime(e.receivedAt)} · {e.attempts} tentativa(s)<div className="text-xs text-red-700">{e.error}</div></div>
                    <button className="btn-secondary shrink-0" disabled={e.attempts >= 5 || reprocess.isPending} onClick={() => reprocess.mutate(e.id)}>Reprocessar</button></li>))}</ul>
              )}
              <ErrorBox error={reprocess.error} />
            </section>
          )}
        </div>
      )}
      {confirmDisc && <Confirm message="Desconectar a sessão do WhatsApp? Será necessário ler um novo QR Code para reconectar." onCancel={() => setConfirmDisc(false)} onConfirm={() => disc.mutate()} />}
    </>
  );
}
