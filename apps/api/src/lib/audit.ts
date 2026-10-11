import { Request } from 'express';
import { prisma } from '../db';
import { logger } from './logger';

export async function audit(
  req: Request | null,
  action: string,
  extra: { entity?: string; entityId?: string; detail?: string; userId?: string; userEmail?: string } = {},
) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entity: extra.entity,
        entityId: extra.entityId,
        detail: extra.detail?.slice(0, 500),
        userId: extra.userId ?? req?.user?.id,
        userEmail: extra.userEmail ?? req?.user?.email,
        ip: req?.ip,
      },
    });
  } catch (e) {
    logger.error('falha ao gravar auditoria', { err: String(e) });
  }
}

export async function recordChanges(
  entityType: string,
  entityId: string,
  user: { id: string; name: string } | undefined,
  before: Record<string, any>,
  after: Record<string, any>,
  fields: string[],
) {
  const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
  const rows = fields
    .filter((f) => norm(before[f]) !== norm(after[f]))
    .map((f) => ({
      entityType,
      entityId,
      userId: user?.id,
      userName: user?.name,
      action: 'alterado',
      field: f,
      oldValue: norm(before[f]),
      newValue: norm(after[f]),
    }));
  if (rows.length) await prisma.historyEntry.createMany({ data: rows });
}

export async function recordEvent(
  entityType: string,
  entityId: string,
  user: { id: string; name: string } | undefined,
  action: string,
) {
  await prisma.historyEntry.create({
    data: { entityType, entityId, userId: user?.id, userName: user?.name ?? 'sistema', action },
  });
}
