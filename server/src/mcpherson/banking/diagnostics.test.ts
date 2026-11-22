import { describe, expect, it } from 'vitest';
import { buildBankDiagnostics } from './diagnostics.js';

const NOW = Date.parse('2026-11-22T18:00:00Z');

describe('McPherson bank diagnostics', () => {
  it('returns freshness and availability without exposing balances or tokens', () => {
    const result = buildBankDiagnostics(
      [{ id: 'item-1', institutionName: 'Test bank', lastSyncedAt: '2026-11-22T17:00:00Z', syncStatus: 'good', syncError: null }],
      [{ plaidItemId: 'item-1', accountId: 'account-1', plaidAccountName: 'Checking', isEnabled: 1, bankBalanceFetchedAt: '2026-11-21T17:00:00Z', bankCurrentBalance: 0, bankAvailableBalance: null }],
      NOW,
    );
    expect(result[0].transactionSyncFreshness).toBe('fresh');
    expect(result[0].accounts[0].balanceRetrievalFreshness).toBe('stale');
    expect(result[0].accounts[0].hasCurrentBalance).toBe(true);
    expect(result[0].accounts[0].hasAvailableBalance).toBe(false);
    expect(result[0].accounts[0].bankRefreshTimeKnown).toBe(false);
    expect(JSON.stringify(result)).not.toContain('bankCurrentBalance');
  });

  it('omits disabled accounts and does not confuse institutions', () => {
    const result = buildBankDiagnostics(
      [{ id: 'one', institutionName: 'One', lastSyncedAt: null, syncStatus: 'error', syncError: 'failed' }, { id: 'two', institutionName: 'Two', lastSyncedAt: null, syncStatus: 'good', syncError: null }],
      [{ plaidItemId: 'one', accountId: 'a', plaidAccountName: 'Hidden', isEnabled: 0, bankBalanceFetchedAt: null, bankCurrentBalance: null, bankAvailableBalance: null }],
      NOW,
    );
    expect(result[0].accounts).toHaveLength(0);
    expect(result[1].accounts).toHaveLength(0);
    expect(result[0].hasSyncError).toBe(true);
  });
});
