import { describe, expect, it } from 'vitest';
import { inspectReconciliation } from './reconciliation.js';

const input = {
  accountId: 'account-1', currency: 'USD', startingBalance: 10000,
  postedTransactionSum: -1500, pendingTransactionSum: -250,
  bankCurrentBalance: 8500, bankAvailableBalance: 8250,
  bankBalanceFetchedAt: '2026-11-22T18:00:00Z',
};

describe('read-only reconciliation', () => {
  it('calculates posted and pending-inclusive balances without changing input', () => {
    const snapshot = { ...input };
    const result = inspectReconciliation(input);
    expect(result.postedLedgerBalance).toBe(8500);
    expect(result.pendingInclusiveLedgerBalance).toBe(8250);
    expect(result.state).toBe('matched');
    expect(input).toEqual(snapshot);
  });

  it('preserves discrepancies without automatically rewriting starting balances', () => {
    const result = inspectReconciliation({ ...input, bankCurrentBalance: 9000 });
    expect(result.currentDifference).toBe(500);
    expect(result.state).toBe('difference');
  });

  it('distinguishes an unavailable bank balance from zero', () => {
    const unavailable = inspectReconciliation({ ...input, bankCurrentBalance: null });
    expect(unavailable.state).toBe('unavailable');
    expect(unavailable.currentDifference).toBeNull();
    const zero = inspectReconciliation({ ...input, bankCurrentBalance: 0 });
    expect(zero.state).toBe('difference');
    expect(zero.currentDifference).toBe(-8500);
  });

  it('does not compare bank balances in a different currency', () => {
    const result = inspectReconciliation({ ...input, bankCurrency: 'EUR' });
    expect(result.state).toBe('currency_mismatch');
    expect(result.currentDifference).toBeNull();
  });

  it('never assumes available balance equals current minus pending', () => {
    const result = inspectReconciliation({ ...input, bankAvailableBalance: 2000 });
    expect(result.bankAvailableBalance).toBe(2000);
    expect(result.pendingInclusiveLedgerBalance).toBe(8250);
  });
});
