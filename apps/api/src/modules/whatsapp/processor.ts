import { prisma } from '../../db';
import { clearQr, patchState, loadState, setQr } from './state';

export type Result = 'processed' | 'ignored';

const norm = (e: string) => e.replace(/[.\-]/g, '_').toUpperCase();

/** Extrai tipo e texto do objeto `message` do Baileys. Só mantém o que é necessário. */
export function extractContent(message: any): { type: string; body: string | null } | null {
  if (!message || typeof message !== 'object') return null;
  if (message.protocolMessage || message.reactionMessage || message.senderKeyDistributionMessage) return null;
  if (typeof message.conversation === 'string') return { type: 'text', body: message.conversation };
  if (message.extendedTextMessage) return { type: 'text', body: message.extendedTextMessage.text ?? null };
  if (message.imageMessage) return { type: 'image', body: message.imageMessage.caption ?? null };
  if (message.videoMessage) return { type: 'video', body: message.videoMessage.caption ?? null };
  if (message.audioMessage) return { type: 'audio', body: null };
  if (message.documentMessage) return { type: 'document', body: message.documentMessage.caption ?? message.documentMessage.fileName ?? null };
  if (message.documentWithCaptionMessage) return { type: 'document', body: message.documentWithCaptionMessage.message?.documentMessage?.caption ?? null };
  if (message.stickerMessage) return { type: 'sticker', body: null };
  if (message.contactMessage) return { type: 'contact', body: null };
  if (message.locationMessage) return { type: 'location', body: null };
  return { type: 'other', body: null };
}

const phoneFromJid = (jid: string) => (jid.endsWith('@s.whatsapp.net') ? jid.split('@')[0].split(':')[0] : null);

async function findContactByPhone(phone: string | null) {
  if (!phone) return null;
  const exact = await prisma.contact.findFirst({ where: { phone, active: true } });
  if (exact) return exact;
  // Números do Brasil podem vir com/sem o 9º dígito: compara os 8 últimos dígitos se for único.
  const tail = phone.slice(-8);
  const cands = await prisma.contact.findMany({ where: { phone: { endsWith: tail }, active: true }, take: 2 });
  return cands.length === 1 ? cands[0] : null;
}

export async function processEventPayload(event: string, payload: any): Promise<Result> {
  const data = payload?.data;
  const instance: string = payload?.instance;
  switch (norm(event)) {
    case 'CONNECTION_UPDATE': {
      const state = data?.state;
      const connection = state === 'open' ? 'open' : state === 'connecting' ? 'connecting' : state === 'close' ? 'close' : 'unknown';
      const prev = await loadState();
      await patchState({
        connection, confirmedAt: new Date().toISOString(),
        ...(connection === 'open' && prev.connection !== 'open' ? { lastConnectedAt: new Date().toISOString() } : {}),
        ...(connection === 'close' && data?.statusReason ? { lastError: `Conexão encerrada (código ${data.statusReason})`, lastErrorAt: new Date().toISOString() } : {}),
      });
      if (connection === 'open') clearQr();
      return 'processed';
    }
    case 'QRCODE_UPDATED': {
      const b64 = data?.qrcode?.base64 ?? data?.base64;
      if (typeof b64 === 'string') setQr(b64); // somente memória, expira sozinho
      return 'processed';
    }
    case 'MESSAGES_UPSERT':
    case 'SEND_MESSAGE':
      return upsertMessage(instance, data, false);
    case 'MESSAGES_EDITED':
      return upsertMessage(instance, data, true);
    default:
      return 'ignored'; // eventos sem uso (presença, contatos, chats...) não são persistidos
  }
}

async function upsertMessage(instance: string, data: any, edited: boolean): Promise<Result> {
  const item = Array.isArray(data?.messages) ? data.messages[0] : data;
  const key = item?.key;
  const jid: string | undefined = key?.remoteJid;
  const externalId: string | undefined = key?.id;
  if (!jid || !externalId) return 'ignored';
  if (jid === 'status@broadcast' || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return 'ignored';

  // Mensagem editada chega como editedMessage.message.protocolMessage.editedMessage
  let msgObj = item.message;
  let targetId = externalId;
  if (edited || msgObj?.editedMessage) {
    const proto = msgObj?.editedMessage?.message?.protocolMessage ?? msgObj?.protocolMessage;
    if (proto?.key?.id) targetId = proto.key.id;
    msgObj = proto?.editedMessage ?? msgObj?.editedMessage?.message ?? msgObj;
    edited = true;
  }
  const content = extractContent(msgObj);
  if (!content) return 'ignored';

  const isGroup = jid.endsWith('@g.us');
  const fromMe = !!key.fromMe;
  const senderJid: string = isGroup ? key.participant ?? '' : jid;
  const tsRaw = Number(item.messageTimestamp?.low ?? item.messageTimestamp);
  const sentAt = Number.isFinite(tsRaw) && tsRaw > 0 ? new Date(tsRaw * 1000) : new Date();

  if (edited) {
    const existing = await prisma.message.findUnique({ where: { instance_externalId: { instance, externalId: targetId } } });
    if (existing) {
      await prisma.message.update({ where: { id: existing.id }, data: { body: content.body, edited: true } });
      return 'processed';
    }
    // edição de mensagem que nunca vimos: registra como nova
  }

  const phone = phoneFromJid(senderJid);
  const contact = await findContactByPhone(phone);
  const conv = await prisma.conversation.upsert({
    where: { remoteJid: jid },
    create: {
      remoteJid: jid, isGroup, contactId: isGroup ? null : contact?.id ?? null,
      title: isGroup ? data?.groupSubject ?? null : contact?.name ?? item.pushName ?? phone,
      lastMessageAt: sentAt,
    },
    update: { lastMessageAt: sentAt, ...(!isGroup && contact ? { contactId: contact.id } : {}) },
  });

  try {
    await prisma.message.create({
      data: {
        externalId: edited ? targetId : externalId, instance, conversationId: conv.id,
        direction: fromMe ? 'SAIDA' : 'ENTRADA', type: content.type, body: content.body,
        senderJid: senderJid || null, senderName: item.pushName ?? contact?.name ?? null,
        sentAt, edited, processing: fromMe ? 'IGNORADA' : 'PENDENTE',
      },
    });
  } catch (e: any) {
    if (e?.code === 'P2002') return 'ignored'; // duplicata já registrada
    throw e;
  }
  if (!fromMe) await patchState({ lastMessageAt: sentAt.toISOString() });
  return 'processed';
}
