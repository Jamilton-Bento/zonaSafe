import { config } from '../../config';

export class AiError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

export interface LlmProvider {
  name: string;
  model: string;
  /** Devolve o texto JSON gerado pelo modelo (a validação é feita por quem chama). */
  generateJson(system: string, user: string): Promise<string>;
}

/** Gemini via API REST (Google AI Studio, plano gratuito). A chave nunca vai ao navegador. */
export class GeminiProvider implements LlmProvider {
  name = 'gemini';
  get model() { return config.GEMINI_MODEL; }

  async generateJson(system: string, user: string): Promise<string> {
    if (!config.GEMINI_API_KEY) throw new AiError('GEMINI_API_KEY não configurada');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45_000);
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.GEMINI_MODEL)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 1500 },
        }),
        signal: ctrl.signal,
      });
      const json: any = await resp.json().catch(() => null);
      if (!resp.ok) {
        const msg = json?.error?.message ?? `HTTP ${resp.status}`;
        throw new AiError(resp.status === 429 ? 'Limite do plano gratuito do Gemini atingido (429)' : `Gemini: ${String(msg).slice(0, 200)}`, resp.status);
      }
      const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('');
      if (!text) throw new AiError(`Gemini não devolveu conteúdo (${json?.candidates?.[0]?.finishReason ?? json?.promptFeedback?.blockReason ?? 'sem motivo'})`);
      return text;
    } catch (e) {
      if (e instanceof AiError) throw e;
      if ((e as Error).name === 'AbortError') throw new AiError('Gemini não respondeu a tempo');
      throw new AiError(`Gemini indisponível (${(e as Error).message})`);
    } finally {
      clearTimeout(timer);
    }
  }
}

let provider: LlmProvider = new GeminiProvider();
export const getProvider = () => provider;
/** Somente testes automatizados (respostas SIMULADAS). */
export function setProvider(p: LlmProvider) { provider = p; }

export function parseJsonLoose(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(t);
}
