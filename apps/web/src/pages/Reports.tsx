import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime, FREQUENCY, REPORT_TYPE, WEEKDAYS } from '../lib/format';
import { Badge, Empty, ErrorBox, Field, Modal, PageHeader, Spinner } from '../components/ui';

function ScheduleForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ name: '', type: 'TAREFAS_PENDENTES', destinationJid: '', frequency: 'DIARIA', time: '08:00', weekday: '1', monthDay: '1' });
  const save = useMutation({
    mutationFn: () => {
      const [hour, minute] = v.time.split(':').map(Number);
      return api.post('/reports/schedules', { name: v.name, type: v.type, destinationJid: v.destinationJid, frequency: v.frequency, hour, minute,
        weekday: v.frequency === 'SEMANAL' ? Number(v.weekday) : null, monthDay: v.frequency === 'MENSAL' ? Number(v.monthDay) : null });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedules'] }); onClose(); },
  });
  return (
    <Modal title="Novo agendamento de relatório" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nome"><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Tipo de relatório"><select className="input" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>{Object.entries(REPORT_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Destinatário (grupo ou número)"><input className="input" placeholder="120363000000000000@g.us ou 5511999999999" value={v.destinationJid} onChange={(e) => setV({ ...v, destinationJid: e.target.value })} /></Field>
        <p className="-mt-2 text-xs text-slate-500">O identificador do grupo (termina em @g.us) aparece na Central de mensagens após alguém escrever no grupo. O agendamento nasce <b>inativo</b>: envie um teste antes de ativar.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Frequência"><select className="input" value={v.frequency} onChange={(e) => setV({ ...v, frequency: e.target.value })}>{Object.entries(FREQUENCY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Horário"><input type="time" className="input" value={v.time} onChange={(e) => setV({ ...v, time: e.target.value })} /></Field>
          {v.frequency === 'SEMANAL' && <Field label="Dia da semana"><select className="input" value={v.weekday} onChange={(e) => setV({ ...v, weekday: e.target.value })}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field>}
          {v.frequency === 'MENSAL' && <Field label="Dia do mês (1–28)"><input type="number" min={1} max={28} className="input" value={v.monthDay} onChange={(e) => setV({ ...v, monthDay: e.target.value })} /></Field>}
        </div>
        <ErrorBox error={save.error} />
        <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={save.isPending || v.name.trim().length < 2} onClick={() => save.mutate()}>Criar</button></div>
      </div>
    </Modal>
  );
}

const OUTCOME: Record<string, string> = { SUCESSO: 'green', FALHA: 'red', IGNORADO: 'yellow' };

export default function Reports() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState('TAREFAS_PENDENTES');
  const [runsFor, setRunsFor] = useState<string | null>(null);
  const schedules = useQuery({ queryKey: ['schedules'], queryFn: () => api.get<any[]>('/reports/schedules') });
  const prev = useQuery({ queryKey: ['report-preview', preview], queryFn: () => api.get<any>(`/reports/preview?type=${preview}`) });
  const runs = useQuery({ queryKey: ['runs', runsFor], queryFn: () => api.get<any[]>(`/reports/schedules/${runsFor}/runs`), enabled: !!runsFor });
  const patch = useMutation({ mutationFn: ({ id, ...b }: any) => api.patch(`/reports/schedules/${id}`, b), onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }) });
  const test = useMutation({ mutationFn: (id: string) => api.post<any>(`/reports/schedules/${id}/test`), onSettled: () => { qc.invalidateQueries({ queryKey: ['schedules'] }); qc.invalidateQueries({ queryKey: ['runs'] }); } });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/reports/schedules/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }) });
  const when = (s: any) => `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}${s.frequency === 'SEMANAL' ? ` · ${WEEKDAYS[s.weekday]}` : s.frequency === 'MENSAL' ? ` · dia ${s.monthDay}` : ''}`;

  return (
    <>
      <PageHeader title="Relatórios" subtitle="Visualize os relatórios e programe o envio para um grupo do WhatsApp" actions={isAdmin && <button className="btn-primary" onClick={() => setCreating(true)}>+ Novo agendamento</button>} />
      <section className="card mb-6 p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2"><h2 className="font-semibold">Pré-visualização</h2>
          <select className="input !w-auto" value={preview} onChange={(e) => setPreview(e.target.value)}>{Object.entries(REPORT_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        {prev.isLoading ? <Spinner /> : <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm">{prev.data?.text}</pre>}
      </section>
      <section className="card">
        <h2 className="border-b px-4 py-3 font-semibold">Agendamentos</h2>
        <div className="p-3"><ErrorBox error={patch.error ?? del.error} /></div>
        {test.data && <div className="mx-3 mb-2 rounded-md bg-green-50 p-2 text-sm text-green-800">Teste enviado ao destino. Confirme no WhatsApp e então ative o agendamento.</div>}
        {test.error && <div className="mx-3 mb-2"><ErrorBox error={test.error} /></div>}
        {schedules.isLoading ? <Spinner /> : !schedules.data?.length ? <Empty>Nenhum agendamento. Nenhum relatório é enviado automaticamente até que um administrador configure, teste e ative.</Empty> : (
          <div className="overflow-x-auto"><table className="w-full">
            <thead className="border-b bg-slate-50"><tr><th className="th">Nome</th><th className="th">Relatório</th><th className="th">Destino</th><th className="th">Quando</th><th className="th">Estado</th><th className="th">Último envio</th><th className="th"></th></tr></thead>
            <tbody className="divide-y">{schedules.data.map((s) => (
              <tr key={s.id}>
                <td className="td font-medium">{s.name}</td><td className="td">{REPORT_TYPE[s.type]}</td><td className="td break-all text-xs">{s.destinationJid}</td><td className="td">{FREQUENCY[s.frequency]} · {when(s)}</td>
                <td className="td">{s.active ? <Badge tone="green">Ativo</Badge> : <Badge>Inativo</Badge>} {!s.tested && <Badge tone="orange">Sem teste</Badge>}
                  {s.pausedReason && <div className="mt-1 text-xs text-red-600">Pausado: {s.pausedReason}</div>}</td>
                <td className="td text-xs">{s.runs[0] ? <><Badge tone={OUTCOME[s.runs[0].status]}>{s.runs[0].status}</Badge> {fmtDateTime(s.runs[0].startedAt)}</> : '—'}</td>
                <td className="td whitespace-nowrap text-right">
                  <button className="btn-secondary mr-1" onClick={() => setRunsFor(s.id)}>Histórico</button>
                  {isAdmin && <>
                    <button className="btn-secondary mr-1" disabled={test.isPending} onClick={() => test.mutate(s.id)}>Enviar teste</button>
                    <button className="btn-secondary mr-1" onClick={() => patch.mutate({ id: s.id, active: !s.active })}>{s.active ? 'Desativar' : 'Ativar'}</button>
                    <button className="btn-secondary text-red-600" onClick={() => window.confirm('Excluir este agendamento?') && del.mutate(s.id)}>Excluir</button></>}
                </td></tr>))}</tbody></table></div>
        )}
      </section>
      {creating && <ScheduleForm onClose={() => setCreating(false)} />}
      {runsFor && (
        <Modal title="Histórico de execuções" onClose={() => setRunsFor(null)} wide>
          {runs.isLoading ? <Spinner /> : !runs.data?.length ? <Empty>Sem execuções.</Empty> : (
            <table className="w-full"><thead className="border-b bg-slate-50"><tr><th className="th">Início</th><th className="th">Origem</th><th className="th">Resultado</th><th className="th">Detalhe</th></tr></thead>
              <tbody className="divide-y">{runs.data.map((r) => <tr key={r.id}><td className="td">{fmtDateTime(r.startedAt)}</td><td className="td">{r.trigger}</td><td className="td"><Badge tone={OUTCOME[r.status]}>{r.status}</Badge></td><td className="td text-xs">{r.detail}</td></tr>)}</tbody></table>
          )}
        </Modal>
      )}
    </>
  );
}
