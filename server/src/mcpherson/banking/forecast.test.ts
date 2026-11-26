import { describe, expect, it } from 'vitest';
import { forecastCashFlow } from './forecast.js';

const base = { asOf: '2026-11-22', accountKind: 'cash' as const, available: 100_00, postedLedger: 120_00, pendingAmount: -20_00, reserve: 20_00, days: 7 as const };

describe('deterministic cash flow', () => {
  it('reserves for bills without assuming future income is available now', () => {
    const result = forecastCashFlow({ ...base, events: [
      { id: 'bill', date: '2026-11-24', amount: -50_00, kind: 'bill' },
      { id: 'pay', date: '2026-11-25', amount: 100_00, kind: 'income' },
    ] });
    expect(result.safeToSpendNow).toBe(30_00);
    expect(result.endingBalance).toBe(150_00);
    expect(result.minimumBalance).toBe(50_00);
  });
  it('uses pending-inclusive ledger when bank available is unknown', () => {
    const result = forecastCashFlow({ ...base, available: null, events: [] });
    expect(result.startingBalance).toBe(100_00);
    expect(result.startingSource).toBe('ledger_pending');
  });
  it('refuses to count credit availability as cash', () => {
    expect(() => forecastCashFlow({ ...base, accountKind: 'credit', events: [] })).toThrow('cash account');
  });
  it('excludes events beyond the horizon and keeps zero bank balances', () => {
    const result = forecastCashFlow({ ...base, available: 0, events: [
      { id: 'later', date: '2026-12-30', amount: -99_00, kind: 'bill' },
    ] });
    expect(result.endingBalance).toBe(0);
    expect(result.safeToSpendNow).toBe(0);
  });
});
