import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Confirm, Empty, ErrorBox, Field, Modal, Spinner } from './ui';

export interface FieldDef { name: string; label: string; required?: boolean; type?: 'text' | 'select' | 'textarea' | 'checkbox'; options?: { value: string; label: string }[]; minLength?: number }
interface Props {
  title: string; endpoint: string; queryKey: string; fields: FieldDef[];
  columns: { header: string; render: (row: any) => React.ReactNode }[];
  canDelete?: boolean; newLabel: string;
}

export default function SimpleCrud({ title, endpoint, queryKey, fields, columns, newLabel }: Props) {
  const { canWrite, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | null | undefined>(undefined);
  const [removing, setRemoving] = useState<any>(null);
  const { data, isLoading, error } = useQuery({ queryKey: [queryKey], queryFn: () => api.get<any[]>(endpoint) });
  const del = useMutation({ mutationFn: (id: string) => api.del(`${endpoint}/${id}`), onSuccess: () => { setRemoving(null); qc.invalidateQueries(); } });

  return (
    <section className="card mb-6">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
        {canWrite && <button className="btn-primary" onClick={() => setEditing(null)}>{newLabel}</button>}
      </div>
      <div className="p-3"><ErrorBox error={error} /></div>
      <div className="overflow-x-auto">
        {isLoading ? <Spinner /> : !data?.length ? <Empty>Nenhum registro cadastrado.</Empty> : (
          <table className="w-full"><thead className="border-b bg-slate-50"><tr>{columns.map((c) => <th key={c.header} className="th">{c.header}</th>)}<th className="th"></th></tr></thead>
            <tbody className="divide-y">{data.map((row) => (
              <tr key={row.id} className={row.active === false ? 'text-slate-400' : ''}>
                {columns.map((c) => <td key={c.header} className="td">{c.render(row)}</td>)}
                <td className="td whitespace-nowrap text-right">
                  {canWrite && <button className="btn-secondary mr-1" onClick={() => setEditing(row)}>Editar</button>}
                  {isAdmin && <button className="btn-secondary text-red-600" onClick={() => setRemoving(row)}>Excluir</button>}
                </td></tr>))}</tbody></table>
        )}
      </div>
      {editing !== undefined && <CrudForm title={editing ? `Editar — ${title}` : newLabel} endpoint={endpoint} fields={fields} initial={editing} onClose={() => setEditing(undefined)} />}
      {removing && (
        <Confirm message={`Excluir "${removing.name}"? Registros vinculados podem impedir a exclusão (neste caso, apenas desative).`} onCancel={() => setRemoving(null)} onConfirm={() => del.mutate(removing.id)} />
      )}
      {del.error && removing === null && <div className="p-3"><ErrorBox error={del.error} /></div>}
    </section>
  );
}

function CrudForm({ title, endpoint, fields, initial, onClose }: { title: string; endpoint: string; fields: FieldDef[]; initial: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState<Record<string, any>>(() => Object.fromEntries(fields.map((f) => [f.name, initial?.[f.name] ?? (f.type === 'checkbox' ? (f.name === 'active' ? true : false) : '')])));
  const [err, setErr] = useState('');
  const save = useMutation({
    mutationFn: (body: any) => initial?.id ? api.patch(`${endpoint}/${initial.id}`, body) : api.post(endpoint, body),
    onSuccess: () => { qc.invalidateQueries(); onClose(); },
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    for (const f of fields) if (f.required && !String(v[f.name]).trim()) return setErr(`Preencha: ${f.label}`);
    save.mutate(Object.fromEntries(fields.map((f) => [f.name, f.type === 'checkbox' ? !!v[f.name] : v[f.name] === '' ? null : v[f.name]])));
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {fields.map((f) => (
          <Field key={f.name} label={`${f.label}${f.required ? ' *' : ''}`}>
            {f.type === 'select' ? <select className="input" value={v[f.name] ?? ''} onChange={(e) => setV({ ...v, [f.name]: e.target.value })}><option value="">—</option>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              : f.type === 'textarea' ? <textarea className="input" rows={3} value={v[f.name] ?? ''} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
              : f.type === 'checkbox' ? <input type="checkbox" checked={!!v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.checked })} />
              : <input className="input" value={v[f.name] ?? ''} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />}
          </Field>
        ))}
        {err && <div role="alert" className="text-sm text-red-600">{err}</div>}
        <ErrorBox error={save.error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={save.isPending}>Salvar</button></div>
      </form>
    </Modal>
  );
}
