// Cria o primeiro administrador a partir de variáveis de ambiente. Idempotente.
import bcrypt from 'bcryptjs';
import { prisma } from '../db';

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Administrador';
  if (!email || !password) { console.log('ADMIN_EMAIL/ADMIN_PASSWORD não definidos; nada a fazer.'); return; }
  if (password.length < 10) throw new Error('ADMIN_PASSWORD deve ter ao menos 10 caracteres');
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) { console.log('Administrador já existe; mantido sem alterações.'); return; }
  await prisma.user.create({ data: { email, name, role: 'ADMIN', passwordHash: await bcrypt.hash(password, 12) } });
  console.log(`Administrador ${email} criado.`);
}
main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
