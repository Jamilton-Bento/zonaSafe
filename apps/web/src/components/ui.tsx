import { ReactNode, useEffect } from 'react';
import { ApiError } from '../lib/api';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return <div role="status" className="p-6 text-sm text-slate-500">{label}</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof ApiError || error instanceof Error ? error.message : 'Erro inesperado';
  return <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="p-8 text-center text-sm text-slate-500">{children}</div>;
}

const TONES: Record<string, string> = {
  gray: 'bg-slate-100 text-slate-700', blue: 'bg-blue-100 text-blue-800', green: 'bg-green-100 text-green-800',
  yellow: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-800', purple: 'bg-purple-100 text-purple-800', orange: 'bg-orange-100 text-orange-800',
};
export function Badge({ tone = 'gray', children }: { tone?: keyof typeof TONES | string; children: ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone] ?? TONES.gray}`}>{children}</span>;
}
export const priorityTone = (p: string) => ({ BAIXA: 'gray', NORMAL: 'blue', ALTA: 'orange', CRITICA: 'red' } as Record<string, string>)[p] ?? 'gray';
export const statusTone = (s: string) =>
  ({ CONCLUIDA: 'green', CONCLUIDO: 'green', APROVADO: 'green', CANCELADA: 'gray', CANCELADO: 'gray', REPROVADO: 'red', AGUARDANDO_RETORNO: 'purple', AGUARDANDO_SOLICITANTE: 'purple', AGUARDANDO_FORNECEDOR: 'purple', AGUARDANDO_APROVACAO: 'purple', EM_ANDAMENTO: 'blue', PENDENTE: 'yellow', NOVA: 'blue', NOVO: 'blue', TRIAGEM: 'yellow' } as Record<string, string>)[s] ?? 'gray';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`card mt-8 w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, error, children, className = '' }: { label: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {error && <span className="mt-0.5 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Select({ value, onChange, options, placeholder, className = '' }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; className?: string }) {
  return (
    <select className={`input ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Confirm({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal title="Confirmar" onClose={onCancel}>
      <p className="mb-4 text-sm">{message}</p>
      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
        <button className="btn-danger" onClick={onConfirm}>Confirmar</button>
      </div>
    </Modal>
  );
}
