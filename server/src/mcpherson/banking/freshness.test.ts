import { describe, expect, it } from 'vitest';
import { classifyRetrievalFreshness, describeBankSync } from './freshness.js';

const NOW = Date.parse('2026-11-22T18:00:00.000Z');

describe('Plaid balance retrieval freshness', () => {
  it('does not mistake absent, invalid or future timestamps for fresh data', () => {
    expect(classifyRetrievalFreshness(null, NOW)).toBe('unknown');
    expect(classifyRetrievalFreshness('not-a-date', NOW)).toBe('unknown');
    expect(classifyRetrievalFreshness('2026-11-23T18:00:00Z', NOW)).toBe('unknown');
  });

  it('distinguishes fresh, aging and stale retrieved snapshots', () => {
    expect(classifyRetrievalFreshness('2026-11-22T17:00:00Z', NOW)).toBe('fresh');
    expect(classifyRetrievalFreshness('2026-11-22T11:00:00Z', NOW)).toBe('aging');
    expect(classifyRetrievalFreshness('2026-11-21T17:00:00Z', NOW)).toBe('stale');
  });

  it('does not claim that retrieval time proves the bank refreshed', () => {
    const summary = describeBankSync({
      itemId: 'item',
      accountId: 'account',
      transactionSyncAt: '2026-11-22T17:00:00Z',
      balanceFetchedAt: '2026-11-22T17:00:00Z',
      bankReportedAt: null,
      status: 'good',
      error: null,
    }, NOW);
    expect(summary.retrievalFreshness).toBe('fresh');
    expect(summary.bankFreshnessKnown).toBe(false);
    expect(summary.needsAttention).toBe(false);
  });
});
