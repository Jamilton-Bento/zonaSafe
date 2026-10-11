import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../../db';
import { config } from '../../config';
import { HttpError, parse, wrap } from '../../lib/http';
import { audit } from '../../lib/audit';
import { COOKIE, authenticate, requireRole, signToken } from '../../middleware/auth';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Aguarde alguns minutos.' },
});

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

authRouter.post(
  '/login',
  loginLimiter,
  wrap(async (req, res) => {
    const { email, password } = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const generic = new HttpError(401, 'E-mail ou senha incorretos');
    if (!user || !user.active) {
      // custo constante para não revelar se o usuário existe
      await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi');
      await audit(null, 'login_falhou', { userEmail: email, detail: 'usuário inexistente/inativo' });
      throw generic;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpError(429, 'Conta bloqueada temporariamente por tentativas inválidas. Tente mais tarde.');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const fails = user.failedLogins + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: fails >= MAX_FAILS ? 0 : fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MS) : null },
      });
      await audit(req, 'login_falhou', { userId: user.id, userEmail: user.email });
      throw generic;
    }
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    res.cookie(COOKIE, signToken(user.id), {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.COOKIE_SECURE,
      maxAge: 12 * 60 * 60 * 1000,
      path: '/',
    });
    await audit(req, 'login', { userId: user.id, userEmail: user.email });
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  }),
);

authRouter.post(
  '/logout',
  wrap(async (req, res) => {
    res.clearCookie(COOKIE, { path: '/' });
    await audit(req, 'logout');
    res.json({ ok: true });
  }),
);

authRouter.get('/me', authenticate, (req, res) => res.json(req.user));

// ---- Gestão de usuários (somente ADMIN) ----
export const usersRouter = Router();
usersRouter.use(authenticate, requireRole('ADMIN'));

const pwd = z.string().min(10, 'A senha deve ter ao menos 10 caracteres').max(128);
const publicUser = { id: true, name: true, email: true, role: true, active: true, createdAt: true } as const;

usersRouter.get('/', wrap(async (_req, res) => res.json(await prisma.user.findMany({ select: publicUser, orderBy: { name: 'asc' } }))));

usersRouter.post(
  '/',
  wrap(async (req, res) => {
    const d = parse(
      z.object({ name: z.string().min(2), email: z.string().email(), password: pwd, role: z.enum(['ADMIN', 'TECNICO', 'LEITOR']) }),
      req.body,
    );
    const user = await prisma.user.create({
      data: { name: d.name, email: d.email.toLowerCase(), role: d.role, passwordHash: await bcrypt.hash(d.password, 12) },
      select: publicUser,
    });
    await audit(req, 'usuario_criado', { entity: 'user', entityId: user.id, detail: `${user.email} (${user.role})` });
    res.status(201).json(user);
  }),
);

usersRouter.patch(
  '/:id',
  wrap(async (req, res) => {
    const d = parse(
      z.object({
        name: z.string().min(2).optional(),
        role: z.enum(['ADMIN', 'TECNICO', 'LEITOR']).optional(),
        active: z.boolean().optional(),
        password: pwd.optional(),
      }),
      req.body,
    );
    if (req.params.id === req.user!.id && (d.active === false || (d.role && d.role !== 'ADMIN'))) {
      throw new HttpError(400, 'Você não pode desativar ou rebaixar o próprio usuário');
    }
    const { password, ...rest } = d;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) },
      select: publicUser,
    });
    await audit(req, 'usuario_alterado', { entity: 'user', entityId: user.id, detail: Object.keys(d).join(',') });
    res.json(user);
  }),
);
