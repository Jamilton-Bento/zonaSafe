import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Messages from './pages/Messages';
import Tickets from './pages/Tickets';
import TicketDetail from './pages/TicketDetail';
import Tasks from './pages/Tasks';
import Quotes from './pages/Quotes';
import QuoteDetail from './pages/QuoteDetail';
import Contacts from './pages/Contacts';
import Organizations from './pages/Organizations';
import Reports from './pages/Reports';
import Whatsapp from './pages/Whatsapp';
import Assistant from './pages/Assistant';
import Settings from './pages/Settings';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="mensagens" element={<Messages />} />
        <Route path="chamados" element={<Tickets />} />
        <Route path="chamados/:id" element={<TicketDetail />} />
        <Route path="tarefas" element={<Tasks />} />
        <Route path="assistente" element={<Assistant />} />
        <Route path="orcamentos" element={<Quotes />} />
        <Route path="orcamentos/:id" element={<QuoteDetail />} />
        <Route path="contatos" element={<Contacts />} />
        <Route path="empresas" element={<Organizations />} />
        <Route path="relatorios" element={<Reports />} />
        <Route path="whatsapp" element={<Whatsapp />} />
        <Route path="configuracoes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
