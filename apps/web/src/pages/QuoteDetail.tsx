import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, downloadPdf } from '../lib/api';
import { useAuth } from '../lib/auth';
import { brl, fmtDate, parseBRLToCents, QUOTE_STATUS, todayInput } from '../lib/format';
import { Badge, ErrorBox, Field, Modal, PageHeader, Spinner, statusTone } from '../components/ui';

const SEARCH_SITES = [
  ['Mercado Livre', (q: string) => `https://lista.mercadolivre.com.br/${encodeURIComponent(q).replace(/%20/g, '-')}`],
  ['Magazine Luiza', (q: string) => `https://www.magazineluiza.com.br/busca/${encodeURIComponent(q)}/`],
  ['Google Shopping', (q: string) => `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}`],
] as const;

function OfferForm({ quote, offer, onClose }: { quote: any; offer?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    supplierName: offer?.supplierName ?? '', product: offer?.product ?? quote.product, brandModel: offer?.brandModel ?? '', specs: offer?.specs ?? '',
    unit: offer ? String(offer.unitPriceCents / 100).replace('.', ',') : '', quantity: String(offer?.quantity ?? quote.quantity),
    shipping: offer ? String(offer.shippingCents / 100).replace('.', ',') : '0', deliveryDays: offer?.deliveryDays?.toString() ?? '', warranty: offer?.warranty ?? '',
    availability: offer?.availability ?? '', url: offer?.url ?? '', meetsSpecs: offer?.meetsSpecs ?? true, consultedAt: offer ? offer.consultedAt.slice(0, 10) : todayInput(),
  });
  const [localError, setLocalError] = useState('');
  const [paste, setPaste] = useState('');
  const [aiNotice, setAiNotice] = useState('');
  const extract = useMutation({
    mutationFn: () => api.post<any>('/ai/extract-offer', { text: paste }),
    onSuccess: ({ draft: d, notice }) => {
      const money = (c: number | null) => (c == null ? null : String(c / 100).replace('.', ','));
      setF((p) => ({ ...p, supplierName: d.supplierName ?? p.supplierName, product: d.product ?? p.product, brandModel: d.brandModel ?? p.brandModel, specs: d.specs ?? p.specs,
        unit: money(d.unitPriceCents) ?? p.unit, quantity: d.quantity ? String(d.quantity) : p.quantity, shipping: money(d.shippingCents) ?? p.shipping,
        deliveryDays: d.deliveryDays != null ? String(d.deliveryDays) : p.deliveryDays, warranty: d.warranty ?? p.warranty, availability: d.availability ?? p.availability, url: d.url ?? p.url }));
      setAiNotice(notice);
    },
  });
  const unit = parseBRLToCents(f.unit), ship = parseBRLToCents(f.shipping || '0'), qty = parseInt(f.quantity, 10);
  const total = unit != null && ship != null && qty > 0 ? unit * qty + ship : null;
  const save = useMutation({
    mutationFn: (body: any) => offer ? api.patch(`/quotes/${quote.id}/offers/${offer.id}`, body) : api.post(`/quotes/${quote.id}/offers`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quote', quote.id] }); onClose(); },
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setLocalError('');
    if (unit == null || unit <= 0) return setLocalError('Preço unitário inválido (ex.: 1.499,90)');
    if (ship == null) return setLocalError('Frete inválido');
    if (!(qty > 0)) return setLocalError('Quantidade inválida');
    save.mutate({
      supplierName: f.supplierName, product: f.product, brandModel: f.brandModel || null, specs: f.specs || null, unitPriceCents: unit, quantity: qty, shippingCents: ship,
      deliveryDays: f.deliveryDays ? parseInt(f.deliveryDays, 10) : null, warranty: f.warranty || null, availability: f.availability || null, url: f.url || null,
      meetsSpecs: f.meetsSpecs, consultedAt: f.consultedAt,
    });
  };
  const t = (k: keyof typeof f) => ({ value: f[k] as string, onChange: (e: any) => setF({ ...f, [k]: e.target.value }) });
  return (
    <Modal title={offer ? 'Editar oferta' : 'Cadastrar oferta'} onClose={onClose} wide>
      {!offer && (
        <div className="mb-3 rounded-md border border-dashed p-3">
          <Field label="Opcional: cole aqui a proposta/e-mail do fornecedor e a IA preenche os campos (você confere antes de salvar)"><textarea className="input" rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} /></Field>
          <div className="mt-2 flex items-center gap-2"><button type="button" className="btn-secondary" disabled={paste.trim().length < 10 || extract.isPending} onClick={() => extract.mutate()}>{extract.isPending ? 'Lendo…' : 'Preencher com IA'}</button>{aiNotice && <span className="text-xs text-amber-700">{aiNotice}</span>}</div>
          <ErrorBox error={extract.error} />
        </div>
      )}
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Fornecedor *"><input className="input" required {...t('supplierName')} /></Field>
        <Field label="Produto *"><input className="input" required {...t('product')} /></Field>
        <Field label="Marca e modelo"><input className="input" {...t('brandModel')} /></Field>
        <Field label="Link do produto"><input className="input" type="url" placeholder="https://…" {...t('url')} /></Field>
        <Field label="Especificações da oferta" className="sm:col-span-2"><textarea className="input" rows={2} {...t('specs')} /></Field>
        <Field label="Preço unitário (R$) *"><input className="input" inputMode="decimal" placeholder="1.499,90" {...t('unit')} /></Field>
        <Field label="Quantidade *"><input className="input" type="number" min={1} {...t('quantity')} /></Field>
        <Field label="Frete (R$)"><input className="input" inputMode="decimal" {...t('shipping')} /></Field>
        <Field label="Valor total (calculado)"><div className="input bg-slate-50 font-semibold">{total != null ? brl(total) : '—'}</div></Field>
        <Field label="Prazo de entrega (dias)"><input className="input" type="number" min={0} {...t('deliveryDays')} /></Field>
        <Field label="Garantia"><input className="input" placeholder="12 meses" {...t('warranty')} /></Field>
        <Field label="Disponibilidade"><input className="input" placeholder="Em estoque" {...t('availability')} /></Field>
        <Field label="Data da consulta *"><input className="input" type="date" required {...t('consultedAt')} /></Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.meetsSpecs} onChange={(e) => setF({ ...f, meetsSpecs: e.target.checked })} /> Esta oferta atende às especificações exigidas (desmarque se não atender: ela nunca será recomendada)</label>
        {localError && <div role="alert" className="text-sm text-red-600 sm:col-span-2">{localError}</div>}
        <div className="sm:col-span-2"><ErrorBox error={save.error} /></div>
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={save.isPending}>Salvar oferta</button></div>
      </form>
    </Modal>
  );
}

function Approval({ quote, onClose }: { quote: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [decision, setDecision] = useState<'APROVADO' | 'REPROVADO'>('APROVADO');
  const [offerId, setOfferId] = useState(quote.analysis.recommendedId ?? '');
  const [approver, setApprover] = useState('');
  const [notes, setNotes] = useState('');
  const save = useMutation({ mutationFn: () => api.post(`/quotes/${quote.id}/approval`, { decision, offerId: decision === 'APROVADO' ? offerId : undefined, approver, notes: notes || undefined }), onSuccess: () => { qc.invalidateQueries(); onClose(); } });
  return (
    <Modal title="Registrar decisão da diretoria" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Decisão"><select className="input" value={decision} onChange={(e) => setDecision(e.target.value as any)}><option value="APROVADO">Aprovado</option><option value="REPROVADO">Reprovado</option></select></Field>
        {decision === 'APROVADO' && <Field label="Oferta aprovada"><select className="input" value={offerId} onChange={(e) => setOfferId(e.target.value)}><option value="">Selecione…</option>{quote.offers.filter((o: any) => o.meetsSpecs).map((o: any) => <option key={o.id} value={o.id}>{o.supplierName} — {brl(o.totalCents)}</option>)}</select></Field>}
        <Field label="Quem decidiu *"><input className="input" value={approver} onChange={(e) => setApprover(e.target.value)} /></Field>
        <Field label="Observações"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <ErrorBox error={save.error} />
        <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={approver.trim().length < 2 || save.isPending} onClick={() => save.mutate()}>Registrar</button></div>
      </div>
    </Modal>
  );
}

export default function QuoteDetail() {
  const { id } = useParams();
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const [offerModal, setOfferModal] = useState<any | null | undefined>(undefined);
  const [approving, setApproving] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const { data: q, isLoading, error } = useQuery({ queryKey: ['quote', id], queryFn: () => api.get<any>(`/quotes/${id}`) });
  const setStatus = useMutation({ mutationFn: (status: string) => api.patch(`/quotes/${id}`, { status }), onSuccess: () => qc.invalidateQueries() });
  const delOffer = useMutation({ mutationFn: (oid: string) => api.del(`/quotes/${id}/offers/${oid}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['quote', id] }) });
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const a = q.analysis;
  const query = q.product;
  return (
    <>
      <PageHeader title={`Orçamento #${q.number} — ${q.product}`} subtitle={`${q.quantity} un. · ${[q.company?.name, q.branch?.name].filter(Boolean).join(' · ') || 'sem empresa'} · solicitante: ${q.requester?.name ?? '—'}`}
        actions={<>
          <Link className="btn-secondary" to="/orcamentos">← Voltar</Link>
          <button className="btn-secondary" onClick={() => downloadPdf(`/quotes/${q.id}/pdf`, `cotacao-${q.number}.pdf`).catch((e) => setPdfError(e.message))}>Gerar PDF para a diretoria</button>
          {canWrite && <button className="btn-primary" onClick={() => setOfferModal(null)}>+ Cadastrar oferta</button>}
        </>} />
      {pdfError && <ErrorBox error={new Error(pdfError)} />}
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <section className="card p-4 lg:col-span-2 text-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2"><Badge tone={statusTone(q.status)}>{QUOTE_STATUS[q.status]}</Badge>{a.complete ? <Badge tone="green">Pesquisa completa</Badge> : <Badge tone="orange">Pesquisa incompleta</Badge>}
            {canWrite && ['RASCUNHO', 'EM_PESQUISA', 'AGUARDANDO_APROVACAO'].includes(q.status) && (
              <>{q.status !== 'AGUARDANDO_APROVACAO' && <button className="btn-secondary" onClick={() => setStatus.mutate('AGUARDANDO_APROVACAO')}>Enviar para aprovação</button>}
                <button className="btn-secondary" onClick={() => setStatus.mutate('CANCELADO')}>Cancelar solicitação</button></>)}
            {canWrite && q.status === 'AGUARDANDO_APROVACAO' && <button className="btn-primary" onClick={() => setApproving(true)}>Registrar decisão</button>}
          </div>
          <ErrorBox error={setStatus.error} />
          <p className={`rounded-md p-2 ${a.complete ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>{a.message}</p>
          <h3 className="mt-3 font-semibold">Especificações técnicas</h3><p className="whitespace-pre-wrap">{q.specs}</p>
          {q.justification && <><h3 className="mt-3 font-semibold">Justificativa</h3><p className="whitespace-pre-wrap">{q.justification}</p></>}
          <p className="mt-2 text-slate-500">Prazo desejado: {fmtDate(q.dueDate)}</p>
        </section>
        <section className="card p-4 text-sm">
          <h3 className="mb-2 font-semibold">Pesquisar preços no navegador</h3>
          <p className="mb-2 text-slate-500">Abre a busca em outra aba. Copie os dados e cadastre cada oferta manualmente: o sistema não coleta preços automaticamente nem inventa valores.</p>
          <div className="flex flex-col gap-1">{SEARCH_SITES.map(([name, url]) => <a key={name} className="btn-secondary" href={url(query)} target="_blank" rel="noopener noreferrer">Buscar em {name} ↗</a>)}</div>
          {q.approvals.length > 0 && <div className="mt-3"><h3 className="font-semibold">Decisões</h3>{q.approvals.map((p: any) => <div key={p.id} className="text-xs">{p.decision} por {p.approver} em {fmtDate(p.decidedAt)}{p.notes ? ` — ${p.notes}` : ''}</div>)}</div>}
        </section>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="border-b bg-slate-50"><tr><th className="th">Fornecedor</th><th className="th">Produto</th><th className="th text-right">Unitário</th><th className="th text-right">Qtd.</th><th className="th text-right">Frete</th><th className="th text-right">Total</th><th className="th">Entrega</th><th className="th">Garantia</th><th className="th">Consulta</th><th className="th"></th></tr></thead>
          <tbody className="divide-y">
            {q.offers.length === 0 && <tr><td className="td text-slate-500" colSpan={10}>Nenhuma oferta cadastrada. Cadastre ao menos 3 de fornecedores diferentes.</td></tr>}
            {q.offers.map((o: any) => {
              const rec = o.id === a.recommendedId, low = o.id === a.lowestValidId;
              return (
                <tr key={o.id} className={rec ? 'bg-green-50' : !o.meetsSpecs ? 'bg-slate-50 text-slate-400' : ''}>
                  <td className="td font-medium">{o.supplierName}{rec && <div><Badge tone="green">Menor custo total (recomendada)</Badge></div>}{low && !rec && <div><Badge tone="yellow">Menor custo parcial</Badge></div>}{!o.meetsSpecs && <div><Badge tone="red">Não atende às especificações</Badge></div>}</td>
                  <td className="td">{o.product}<div className="text-xs text-slate-500">{o.brandModel}</div>{o.url && <a className="text-xs text-brand-700 hover:underline" href={o.url} target="_blank" rel="noopener noreferrer">link ↗</a>}</td>
                  <td className="td text-right">{brl(o.unitPriceCents)}</td><td className="td text-right">{o.quantity}</td><td className="td text-right">{brl(o.shippingCents)}</td>
                  <td className="td text-right font-semibold">{brl(o.totalCents)}</td>
                  <td className="td">{o.deliveryDays != null ? `${o.deliveryDays} dia(s)` : '—'}<div className="text-xs text-slate-500">{o.availability}</div></td>
                  <td className="td">{o.warranty ?? '—'}</td><td className="td">{fmtDate(o.consultedAt)}</td>
                  <td className="td whitespace-nowrap">{canWrite && <><button className="btn-secondary mr-1" onClick={() => setOfferModal(o)}>Editar</button><button className="btn-secondary text-red-600" onClick={() => window.confirm('Remover esta oferta?') && delOffer.mutate(o.id)}>Remover</button></>}</td>
                </tr>);
            })}
          </tbody>
        </table>
      </div>
      {offerModal !== undefined && <OfferForm quote={q} offer={offerModal ?? undefined} onClose={() => setOfferModal(undefined)} />}
      {approving && <Approval quote={q} onClose={() => setApproving(false)} />}
    </>
  );
}
