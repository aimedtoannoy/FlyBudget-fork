import type { CashFlowEvent } from './forecast.js';

export interface MaterializedOccurrence {
  id: string;
  date: string;
  amount: number;
  status: string;
  scheduleStatus: string;
  transferAccountId: string | null;
}

/** Never count matched, skipped, cancelled, or internal-transfer occurrences as future bills. */
export function selectForecastEvents(occurrences: MaterializedOccurrence[]): CashFlowEvent[] {
  return occurrences
    .filter((o) => o.status === 'pending' && o.scheduleStatus === 'active' && o.transferAccountId === null)
    .map((o) => ({ id: o.id, date: o.date, amount: o.amount, kind: o.amount >= 0 ? 'income' : 'bill' }));
}

/** A retrieval timestamp is not a bank's own refresh timestamp. */
export function recentlyRetrievedBankAvailable(input: {
  fetchedAt: string | null;
  available: number | null;
  bankCurrency: string | null;
  accountCurrency: string | null;
}, nowMs: number): number | null {
  if (input.available === null || !input.fetchedAt) return null;
  if (input.bankCurrency && input.accountCurrency && input.bankCurrency !== input.accountCurrency) return null;
  const fetched = Date.parse(input.fetchedAt);
  if (!Number.isFinite(fetched) || fetched > nowMs || nowMs - fetched >= 86_400_000) return null;
  return input.available;
}
