import PDFDocument from 'pdfkit';
import { brl, fmtDate, fmtDateTime } from '../../lib/dates';
import { Analysis } from './calc';

type Q = {
  number: number; product: string; quantity: number; specs: string; justification: string | null; dueDate: Date | null; status: string;
  requester: { name: string } | null; company: { name: string } | null; branch: { name: string } | null;
  offers: { id: string; supplierName: string; product: string; brandModel: string | null; unitPriceCents: number; quantity: number; shippingCents: number; totalCents: number; deliveryDays: number | null; warranty: string | null; availability: string | null; url: string | null; meetsSpecs: boolean; consultedAt: Date }[];
};

/** Gera o PDF para a diretoria 100% local (pdfkit). */
export function buildQuotePdf(q: Q, a: Analysis, generatedBy: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Solicitação de compra #${q.number}`, Author: 'Central de TI' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 80;
    doc.fontSize(18).font('Helvetica-Bold').text('Relatório de Cotação de Equipamentos de TI');
    doc.fontSize(10).font('Helvetica').fillColor('#555').text(`Solicitação nº ${q.number} · emitido em ${fmtDateTime(new Date())} por ${generatedBy}`).fillColor('#000').moveDown();

    const kv = (k: string, v: string) => doc.font('Helvetica-Bold').text(`${k}: `, { continued: true }).font('Helvetica').text(v);
    doc.fontSize(12).font('Helvetica-Bold').text('1. Identificação da solicitação').moveDown(0.3).fontSize(10);
    kv('Solicitante', q.requester?.name ?? '—');
    kv('Empresa / Filial', `${q.company?.name ?? '—'} / ${q.branch?.name ?? '—'}`);
    kv('Produto', q.product);
    kv('Quantidade', String(q.quantity));
    kv('Prazo desejado', fmtDate(q.dueDate));
    if (q.justification) kv('Justificativa', q.justification);
    doc.moveDown(0.5).fontSize(12).font('Helvetica-Bold').text('2. Especificações técnicas exigidas').moveDown(0.3).fontSize(10).font('Helvetica').text(q.specs).moveDown();

    doc.fontSize(12).font('Helvetica-Bold').text('3. Tabela comparativa de ofertas').moveDown(0.3);
    if (!q.offers.length) {
      doc.fontSize(10).font('Helvetica').text('Nenhuma oferta cadastrada.');
    }
    q.offers.forEach((o, i) => {
      if (doc.y > 700) doc.addPage();
      const tag = o.id === a.recommendedId ? ' — RECOMENDADA (menor custo total entre as válidas)' : o.id === a.lowestValidId ? ' — menor custo parcial' : '';
      doc.fontSize(10).font('Helvetica-Bold').text(`Oferta ${i + 1}: ${o.supplierName}${tag}`);
      doc.font('Helvetica').fontSize(9);
      doc.text(`Produto: ${o.product}${o.brandModel ? ` · ${o.brandModel}` : ''}`);
      doc.text(`Preço unitário: ${brl(o.unitPriceCents)} × ${o.quantity} + frete ${brl(o.shippingCents)} = TOTAL ${brl(o.totalCents)}`);
      doc.text(`Entrega: ${o.deliveryDays != null ? `${o.deliveryDays} dia(s)` : 'não informado'} · Garantia: ${o.warranty ?? 'não informada'} · Disponibilidade: ${o.availability ?? 'não informada'}`);
      doc.text(`Atende às especificações: ${o.meetsSpecs ? 'Sim' : 'NÃO (desconsiderada)'} · Consulta em: ${fmtDate(o.consultedAt)}`);
      if (o.url) doc.fillColor('#1d4ed8').text(`Link: ${o.url}`, { width: W, link: o.url }).fillColor('#000');
      doc.moveDown(0.6);
    });

    if (doc.y > 650) doc.addPage();
    doc.fontSize(12).font('Helvetica-Bold').text('4. Recomendação técnica').moveDown(0.3).fontSize(10).font('Helvetica');
    doc.text(a.message);
    const rec = q.offers.find((o) => o.id === a.recommendedId);
    if (rec) doc.text(`Recomenda-se a oferta de ${rec.supplierName}, com custo total de ${brl(rec.totalCents)}, por ser a de menor custo entre as ofertas que atendem integralmente às especificações. Valores e disponibilidade sujeitos a confirmação na data da compra.`);
    doc.moveDown(2);

    if (doc.y > 650) doc.addPage();
    doc.fontSize(12).font('Helvetica-Bold').text('5. Aprovação').moveDown(0.5).fontSize(10).font('Helvetica');
    doc.text('[   ] Aprovado     [   ] Reprovado     Oferta escolhida: ________________________________').moveDown(1.5);
    doc.text('Nome: ______________________________   Assinatura: ______________________________   Data: ___/___/______');
    doc.end();
  });
}
