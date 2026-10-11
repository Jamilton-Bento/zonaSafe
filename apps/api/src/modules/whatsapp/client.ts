import { config } from '../../config';

export class EvolutionError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

/** Interface do transporte; permite trocar por um simulado nos testes automatizados. */
export interface EvolutionTransport {
  connectionState(): Promise<string>;
  connect(): Promise<{ base64?: string; code?: string; pairingCode?: string; count?: number }>;
  logout(): Promise<void>;
  restart(): Promise<void>;
  createInstance(): Promise<void>;
  setWebhook(url: string, secret: string): Promise<void>;
  sendText(number: string, text: string): Promise<{ id?: string }>;
  instanceExists(): Promise<boolean>;
}

/**
 * Cliente HTTP da Evolution API v2 (imagem evoapicloud/evolution-api:v2.3.7).
 * Autenticação: cabeçalho `apikey`. A chave só existe no back-end.
 */
export class EvolutionClient implements EvolutionTransport {
  private async call(method: string, path: string, body?: unknown, timeoutMs = 15000): Promise<any> {
    if (!config.EVOLUTION_API_KEY) throw new EvolutionError('EVOLUTION_API_KEY não configurada');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetch(`${config.EVOLUTION_API_URL}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', apikey: config.EVOLUTION_API_KEY },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      const text = await resp.text();
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* resposta não-JSON */ }
      if (!resp.ok) {
        const msg = json?.response?.message ?? json?.message ?? json?.error ?? `HTTP ${resp.status}`;
        throw new EvolutionError(`Evolution API: ${Array.isArray(msg) ? msg.join('; ') : String(msg)}`, resp.status);
      }
      return json;
    } catch (e) {
      if (e instanceof EvolutionError) throw e;
      if ((e as Error).name === 'AbortError') throw new EvolutionError('Evolution API não respondeu a tempo');
      throw new EvolutionError(`Evolution API indisponível (${(e as Error).message})`);
    } finally {
      clearTimeout(timer);
    }
  }

  private get name() { return encodeURIComponent(config.EVOLUTION_INSTANCE); }

  async instanceExists(): Promise<boolean> {
    const list = await this.call('GET', `/instance/fetchInstances?instanceName=${this.name}`);
    const arr = Array.isArray(list) ? list : [];
    return arr.some((i: any) => (i?.name ?? i?.instance?.instanceName) === config.EVOLUTION_INSTANCE);
  }

  async createInstance() {
    await this.call('POST', '/instance/create', {
      instanceName: config.EVOLUTION_INSTANCE,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      rejectCall: false,
      groupsIgnore: false,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
      syncFullHistory: false,
    });
  }

  async setWebhook(url: string, secret: string) {
    await this.call('POST', `/webhook/set/${this.name}`, {
      webhook: {
        enabled: true,
        url,
        headers: { 'x-webhook-secret': secret, 'Content-Type': 'application/json' },
        byEvents: false,
        base64: false,
        events: ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_EDITED', 'SEND_MESSAGE'],
      },
    });
  }

  async connectionState(): Promise<string> {
    const r = await this.call('GET', `/instance/connectionState/${this.name}`);
    return String(r?.instance?.state ?? r?.state ?? 'unknown');
  }

  async connect() {
    const r = await this.call('GET', `/instance/connect/${this.name}`);
    return { base64: r?.base64, code: r?.code, pairingCode: r?.pairingCode, count: r?.count };
  }

  async logout() { await this.call('DELETE', `/instance/logout/${this.name}`); }
  async restart() { await this.call('POST', `/instance/restart/${this.name}`); }

  async sendText(number: string, text: string) {
    const r = await this.call('POST', `/message/sendText/${this.name}`, { number, text }, 30000);
    return { id: r?.key?.id as string | undefined };
  }
}
