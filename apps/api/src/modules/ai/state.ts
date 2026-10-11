import { config } from '../../config';
import { getSetting, setSetting } from '../../lib/settings';

export interface AiConfig {
  enabled: boolean;
  autoCreateThreshold: number; // confiança mínima para a IA criar chamado/tarefa/orçamento sozinha
  draftReplies: boolean;       // gerar rascunhos de resposta (sempre com aprovação humana)
  includeGroups: boolean;      // analisar mensagens de grupos
}
export interface AiState {
  paused: boolean; pausedReason: string | null; consecutiveFailures: number;
  today: { date: string; count: number }; lastError: string | null; lastErrorAt: string | null; lastRunAt: string | null;
}

const CFG = 'ai.config', ST = 'ai.state';
export const defaultConfig = (): AiConfig => ({ enabled: false, autoCreateThreshold: 0.8, draftReplies: true, includeGroups: false });
const blank = (): AiState => ({ paused: false, pausedReason: null, consecutiveFailures: 0, today: { date: '', count: 0 }, lastError: null, lastErrorAt: null, lastRunAt: null });

export async function loadConfig(): Promise<AiConfig> { return { ...defaultConfig(), ...(await getSetting<Partial<AiConfig>>(CFG, {})) }; }
export async function saveConfig(c: Partial<AiConfig>) { const n = { ...(await loadConfig()), ...c }; await setSetting(CFG, n); return n; }
export async function loadState(): Promise<AiState> { return { ...blank(), ...(await getSetting<Partial<AiState>>(ST, {})) }; }
export async function patchState(p: Partial<AiState>) { const n = { ...(await loadState()), ...p }; await setSetting(ST, n); return n; }

export const todayKey = () => new Date().toISOString().slice(0, 10);
export const keyConfigured = () => !!config.GEMINI_API_KEY;
