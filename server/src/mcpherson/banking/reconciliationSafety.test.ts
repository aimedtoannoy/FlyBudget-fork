import { describe, expect, it } from 'vitest';
import { canAutoAlignPlaidAccount } from './reconciliationSafety.js';

const base = { mode: 'legacy' as const, bankCurrent: 10000, accountType: 'checking', accountCurrency: 'USD', mappingCurrency: 'USD' };
describe('bank reconciliation alignment safeguards', () => {
  it('preserves observe mode and unavailable bank balance', () => {
    expect(canAutoAlignPlaidAccount({ ...base, mode: 'observe' })).toBe(false);
    expect(canAutoAlignPlaidAccount({ ...base, bankCurrent: null })).toBe(false);
  });
  it('never aligns credit, investment or different-currency accounts', () => {
    expect(canAutoAlignPlaidAccount({ ...base, accountType: 'credit' })).toBe(false);
    expect(canAutoAlignPlaidAccount({ ...base, accountType: 'investment' })).toBe(false);
    expect(canAutoAlignPlaidAccount({ ...base, mappingCurrency: 'EUR' })).toBe(false);
  });
  it('allows zero bank current balance for same-currency cash accounts in legacy mode', () => {
    expect(canAutoAlignPlaidAccount({ ...base, bankCurrent: 0 })).toBe(true);
    expect(canAutoAlignPlaidAccount({ ...base, accountType: 'savings' })).toBe(true);
  });
});
