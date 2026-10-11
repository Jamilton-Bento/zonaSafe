import { PageHeader, Badge } from '../components/ui';
import SimpleCrud from '../components/SimpleCrud';
import { useCompanies } from '../lib/hooks';

export default function Organizations() {
  const companies = useCompanies().data ?? [];
  const companyOpts = companies.map((c) => ({ value: c.id, label: c.name }));
  const active = (r: any) => (r.active === false ? <Badge>Inativa</Badge> : <Badge tone="green">Ativa</Badge>);
  return (
    <>
      <PageHeader title="Empresas e filiais" subtitle="Cadastros usados em chamados, tarefas e orçamentos. Nenhum nome é fixo no sistema." />
      <SimpleCrud title="Empresas" endpoint="/companies" queryKey="companies" newLabel="+ Nova empresa"
        fields={[{ name: 'name', label: 'Nome', required: true }, { name: 'cnpj', label: 'CNPJ' }, { name: 'notes', label: 'Observações', type: 'textarea' }, { name: 'active', label: 'Ativa', type: 'checkbox' }]}
        columns={[{ header: 'Nome', render: (r) => <b>{r.name}</b> }, { header: 'CNPJ', render: (r) => r.cnpj ?? '—' }, { header: 'Filiais', render: (r) => r._count?.branches ?? 0 }, { header: 'Contatos', render: (r) => r._count?.contacts ?? 0 }, { header: 'Situação', render: active }]} />
      <SimpleCrud title="Filiais" endpoint="/branches" queryKey="branches" newLabel="+ Nova filial"
        fields={[{ name: 'companyId', label: 'Empresa', required: true, type: 'select', options: companyOpts }, { name: 'name', label: 'Nome da filial', required: true }, { name: 'city', label: 'Cidade' }, { name: 'address', label: 'Endereço' }, { name: 'active', label: 'Ativa', type: 'checkbox' }]}
        columns={[{ header: 'Filial', render: (r) => <b>{r.name}</b> }, { header: 'Empresa', render: (r) => r.company?.name }, { header: 'Cidade', render: (r) => r.city ?? '—' }, { header: 'Situação', render: active }]} />
      <SimpleCrud title="Fornecedores" endpoint="/suppliers" queryKey="suppliers" newLabel="+ Novo fornecedor"
        fields={[{ name: 'name', label: 'Nome', required: true }, { name: 'contact', label: 'Contato' }, { name: 'phone', label: 'Telefone' }, { name: 'email', label: 'E-mail' }, { name: 'website', label: 'Site' }, { name: 'notes', label: 'Observações', type: 'textarea' }, { name: 'active', label: 'Ativo', type: 'checkbox' }]}
        columns={[{ header: 'Fornecedor', render: (r) => <b>{r.name}</b> }, { header: 'Contato', render: (r) => r.contact ?? '—' }, { header: 'Telefone', render: (r) => r.phone ?? '—' }, { header: 'Site', render: (r) => r.website ? <a className="text-brand-700 hover:underline" href={r.website} target="_blank" rel="noopener noreferrer">{r.website}</a> : '—' }]} />
    </>
  );
}
