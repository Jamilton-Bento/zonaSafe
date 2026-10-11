import { prisma } from '../db';

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return (row ? (row.value as T) : fallback);
}
export async function setSetting(key: string, value: unknown) {
  await prisma.setting.upsert({ where: { key }, create: { key, value: value as any }, update: { value: value as any } });
}
