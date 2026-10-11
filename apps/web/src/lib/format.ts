const p = (n: number) => String(n).padStart(2, '0');

export function fmtDate(v?: string | Date | null) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
export function fmtDateTime(v?: string | Date | null) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : `${fmtDate(d)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "1.234,56" / "1234.56" / "12" => centavos (inteiro) ou null se inválido */
export function parseBRLToCents(input: string): number | null {
  const s = input.trim().replace(/[R$\s]/g, '');
  if (!s) return null;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(parseFloat(normalized) * 100);
}
/** Valor de <input type="date"> (YYYY-MM-DD) a partir de ISO. */
export function toDateInput(v?: string | null) {
  if (!v) return '';
  const d = new Date(v);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const todayInput = () => toDateInput(new Date().toISOString());

export function isOverdue(due?: string | null, status?: string) {
  if (!due || ['CONCLUIDA', 'CANCELADA', 'CONCLUIDO', 'CANCELADO'].includes(status ?? '')) return false;
  return new Date(due).getTime() < Date.now();
}
export function isDueSoon(due?: string | null, status?: string) {
  if (!due || isOverdue(due, status) || ['CONCLUIDA', 'CANCELADA', 'CONCLUIDO', 'CANCELADO'].includes(status ?? '')) return false;
  return new Date(due).getTime() - Date.now() < 48 * 3600_000;
}

export const TASK_STATUS: Record<string, string> = { NOVA: 'Nova', PENDENTE: 'Pendente', EM_ANDAMENTO: 'Em andamento', AGUARDANDO_RETORNO: 'Aguardando retorno', CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada' };
export const TICKET_STATUS: Record<string, string> = { NOVO: 'Novo', TRIAGEM: 'Triagem', PENDENTE: 'Pendente', EM_ANDAMENTO: 'Em andamento', AGUARDANDO_SOLICITANTE: 'Aguardando solicitante', AGUARDANDO_FORNECEDOR: 'Aguardando fornecedor', CONCLUIDO: 'Concluído', CANCELADO: 'Cancelado' };
export const PRIORITY: Record<string, string> = { BAIXA: 'Baixa', NORMAL: 'Normal', ALTA: 'Alta', CRITICA: 'Crítica' };
export const CATEGORY: Record<string, string> = { HARDWARE: 'Hardware', SOFTWARE: 'Software', REDE: 'Rede', INTERNET: 'Internet', SERVIDORES: 'Servidores', SISTEMAS_EMPRESARIAIS: 'Sistemas empresariais', IMPRESSORAS: 'Impressoras', ACESSOS: 'Acessos', EMAIL: 'E-mail', TELEFONIA: 'Telefonia', COMPRAS: 'Compras', OUTROS: 'Outros' };
export const QUOTE_STATUS: Record<string, string> = { RASCUNHO: 'Rascunho', EM_PESQUISA: 'Em pesquisa', AGUARDANDO_APROVACAO: 'Aguardando aprovação', APROVADO: 'Aprovado', REPROVADO: 'Reprovado', CANCELADO: 'Cancelado' };
export const PROCESSING: Record<string, string> = { PENDENTE: 'Pendente', ANALISADA: 'Analisada', IGNORADA: 'Ignorada', CONVERTIDA: 'Convertida' };
export const ROLE: Record<string, string> = { ADMIN: 'Administrador', TECNICO: 'Técnico', LEITOR: 'Somente leitura' };
export const REPORT_TYPE: Record<string, string> = { TAREFAS_PENDENTES: 'Tarefas pendentes', TAREFAS_ATRASADAS: 'Tarefas atrasadas', CHAMADOS_ABERTOS: 'Chamados abertos', ATENDIMENTOS_CONCLUIDOS: 'Atendimentos concluídos', ORCAMENTOS_AGUARDANDO_APROVACAO: 'Orçamentos aguardando aprovação' };
export const FREQUENCY: Record<string, string> = { DIARIA: 'Diária', SEMANAL: 'Semanal', MENSAL: 'Mensal' };
export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));
