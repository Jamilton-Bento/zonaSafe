import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { config } from '../config';
import { prisma } from '../db';
import { HttpError } from '../lib/http';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const COOKIE = 'central_session';

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, config.JWT_SECRET, { expiresIn: '12h' });
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) throw new HttpError(401, 'Não autenticado');
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    } catch {
      throw new HttpError(401, 'Sessão inválida ou expirada');
    }
    const user = await prisma.user.findUnique({ where: { id: String(payload.sub) } });
    if (!user || !user.active) throw new HttpError(401, 'Usuário inativo ou inexistente');
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    next();
  } catch (e) {
    next(e);
  }
}

/** Exige um dos papéis informados. */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Não autenticado'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Sem permissão para esta ação'));
    next();
  };

/** LEITOR só pode ler; qualquer método de escrita exige ADMIN ou TECNICO. */
export function readOnlyForLeitor(req: Request, _res: Response, next: NextFunction) {
  if (req.method !== 'GET' && req.user?.role === 'LEITOR') {
    return next(new HttpError(403, 'Perfil somente leitura'));
  }
  next();
}
