// Datas usam o fuso do processo (TZ=America/Sao_Paulo no Docker).
export function startOfDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
export function endOfDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
/** "2026-10-11" => fim do dia local; datas completas ISO são mantidas. */
export function parseDue(input: string | null | undefined): Date | null {
  if (!input) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 0, 0);
  const d = new Date(input);
  if (isNaN(d.getTime())) throw new Error('Data inválida');
  return d;
}
export function slotKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fmtDate = (d: Date | null | undefined) =>
  d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '—';
export const fmtDateTime = (d: Date | null | undefined) =>
  d ? `${fmtDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '—';
export const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
