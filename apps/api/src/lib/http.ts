import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, ZodTypeAny, z } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw r.error;
  return r.data;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Dados inválidos',
      issues: err.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  const e = err as { code?: string; type?: string };
  if (e?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
  if (e?.type === 'entity.too.large') return res.status(413).json({ error: 'Corpo da requisição muito grande' });
  if (e?.code === 'P2025') return res.status(404).json({ error: 'Registro não encontrado' });
  if (e?.code === 'P2002') return res.status(409).json({ error: 'Já existe um registro com esses dados' });
  if (e?.code === 'P2003') return res.status(409).json({ error: 'Registro vinculado a outros dados; remova os vínculos antes' });
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ level: 'error', msg: 'erro não tratado', err: String((err as Error)?.stack ?? err) }));
  return res.status(500).json({ error: 'Erro interno do servidor' });
}
