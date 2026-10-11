import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { prisma } from '../src/db';
import { resetDb } from './helpers';

const ROOT = path.resolve(__dirname, '../../..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
const env = {
  ...process.env, PG_LOCAL: '1', PGHOST: 'localhost', PGUSER: 'central', PGPASSWORD: 'central_test',
  CENTRAL_DB: 'central_test', BACKUP_DIR: dir, PG_SUPERUSER: 'central',
};
beforeAll(resetDb);
afterAll(async () => {
  execFileSync('dropdb', ['--if-exists', 'central_restore_test'], { env });
  fs.rmSync(dir, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe('Backup e restauração do PostgreSQL', () => {
  it('gera backup íntegro, restaura em outro banco e preserva os dados', async () => {
    await prisma.company.create({ data: { name: 'Empresa Backup Teste' } });
    await prisma.task.create({ data: { title: 'Tarefa que precisa sobreviver', priority: 'ALTA' } });

    try { execFileSync(path.join(ROOT, 'scripts/backup.sh'), [], { env, stdio: 'pipe' }); } catch (e: any) { throw new Error(String(e.stderr) + String(e.stdout)); }
    const files = fs.readdirSync(dir).filter((f) => f.startsWith('central-') && f.endsWith('.sql.gz'));
    expect(files).toHaveLength(1);

    // Simula perda de dados no banco original
    await prisma.task.deleteMany();
    await prisma.company.deleteMany();
    expect(await prisma.task.count()).toBe(0);

    // Restaura em um banco novo e confere o conteúdo
    execFileSync(path.join(ROOT, 'scripts/restore.sh'), [path.join(dir, files[0]), 'central_restore_test', '--yes'], { env });
    const out = execFileSync('psql', ['-d', 'central_restore_test', '-tAc', `SELECT title || '|' || priority FROM "Task"`], { env }).toString().trim();
    expect(out).toBe('Tarefa que precisa sobreviver|ALTA');
    const comp = execFileSync('psql', ['-d', 'central_restore_test', '-tAc', `SELECT name FROM "Company"`], { env }).toString().trim();
    expect(comp).toBe('Empresa Backup Teste');
  });
  it('restore recusa arquivo inexistente ou corrompido e exige confirmação', () => {
    expect(() => execFileSync(path.join(ROOT, 'scripts/restore.sh'), ['/nao/existe.sql.gz', 'x', '--yes'], { env, stdio: 'pipe' })).toThrow();
    const bad = path.join(dir, 'ruim.sql.gz');
    fs.writeFileSync(bad, 'isto não é gzip');
    expect(() => execFileSync(path.join(ROOT, 'scripts/restore.sh'), [bad, 'x', '--yes'], { env, stdio: 'pipe' })).toThrow();
    expect(() => execFileSync(path.join(ROOT, 'scripts/restore.sh'), [path.join(dir, fs.readdirSync(dir)[0]), 'central_restore_test'], { env, stdio: 'pipe', input: 'nao\n' })).toThrow();
  });
});
