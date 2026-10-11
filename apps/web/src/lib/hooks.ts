import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface Company { id: string; name: string }
export interface Branch { id: string; name: string; companyId: string; company?: { name: string } }
export interface ContactLite { id: string; name: string; phone?: string | null; isDirector?: boolean; companyId?: string | null; branchId?: string | null }
export interface UserLite { id: string; name: string }

export const useCompanies = () => useQuery({ queryKey: ['companies'], queryFn: () => api.get<Company[]>('/companies') });
export const useBranches = () => useQuery({ queryKey: ['branches'], queryFn: () => api.get<Branch[]>('/branches') });
export const useContacts = () => useQuery({ queryKey: ['contacts', ''], queryFn: () => api.get<ContactLite[]>('/contacts') });
export const useTechnicians = () => useQuery({ queryKey: ['team'], queryFn: () => api.get<UserLite[]>('/team') });
