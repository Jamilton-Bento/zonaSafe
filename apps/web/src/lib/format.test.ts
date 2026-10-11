import { describe, expect, it } from 'vitest';
import { brl, fmtDate, isOverdue, parseBRLToCents } from './format';

describe('formatação pt-BR', () => {
  it('converte valores em reais para centavos', () => {
    expect(parseBRLToCents('1.499,90')).toBe(149990);
    expect(parseBRLToCents('R$ 12')).toBe(1200);
    expect(parseBRLToCents('0,5')).toBe(50);
    expect(parseBRLToCents('abc')).toBeNull();
    expect(parseBRLToCents('')).toBeNull();
    expect(parseBRLToCents('1,234')).toBeNull();
  });
  it('formata moeda e data', () => {
    expect(brl(149990).replace(/\s/g, ' ')).toBe('R$ 1.499,90');
    expect(fmtDate('2026-10-05T12:00:00')).toBe('05/10/2026');
    expect(fmtDate(null)).toBe('—');
  });
  it('detecta atraso', () => {
    expect(isOverdue(new Date(Date.now() - 1000).toISOString(), 'PENDENTE')).toBe(true);
    expect(isOverdue(new Date(Date.now() - 1000).toISOString(), 'CONCLUIDA')).toBe(false);
    expect(isOverdue(null, 'PENDENTE')).toBe(false);
  });
});
