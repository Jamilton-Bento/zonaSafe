import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface User { id: string; name: string; email: string; role: 'ADMIN' | 'TECNICO' | 'LEITOR' }
interface Ctx { user: User | null; loading: boolean; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void>; canWrite: boolean; isAdmin: boolean }
const AuthCtx = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    api.get<User>('/auth/me').then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
    const expired = () => { setUser(null); qc.clear(); };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, [qc]);

  const value: Ctx = {
    user, loading,
    login: async (email, password) => { setUser(await api.post<User>('/auth/login', { email, password })); },
    logout: async () => { await api.post('/auth/logout'); setUser(null); qc.clear(); },
    canWrite: !!user && user.role !== 'LEITOR',
    isAdmin: user?.role === 'ADMIN',
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
