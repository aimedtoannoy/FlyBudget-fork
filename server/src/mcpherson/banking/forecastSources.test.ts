import { describe, expect, it } from 'vitest';
import { recentlyRetrievedBankAvailable, selectForecastEvents } from './forecastSources.js';

describe('forecast source selection', () => {
  it('filters already paid, skipped, inactive and transfer occurrences', () => {
    const base = { date: '2026-11-25', amount: -2000, status: 'pending', scheduleStatus: 'active', transferAccountId: null };
    const events = selectForecastEvents([
      { ...base, id: 'bill' },
      { ...base, id: 'paid', status: 'matched' },
      { ...base, id: 'skipped', status: 'skipped' },
      { ...base, id: 'inactive', scheduleStatus: 'paused' },
      { ...base, id: 'transfer', transferAccountId: 'other' },
    ]);
    expect(events.map((event) => event.id)).toEqual(['bill']);
  });
  it('accepts zero but rejects stale, future or mismatched balances', () => {
    const now = Date.parse('2026-11-23T12:00:00Z');
    const input = { fetchedAt: '2026-11-23T11:00:00Z', available: 0, bankCurrency: 'USD', accountCurrency: 'USD' };
    expect(recentlyRetrievedBankAvailable(input, now)).toBe(0);
    expect(recentlyRetrievedBankAvailable({ ...input, fetchedAt: '2026-11-21T11:00:00Z' }, now)).toBeNull();
    expect(recentlyRetrievedBankAvailable({ ...input, fetchedAt: '2026-11-24T11:00:00Z' }, now)).toBeNull();
    expect(recentlyRetrievedBankAvailable({ ...input, bankCurrency: 'EUR' }, now)).toBeNull();
  });
});
