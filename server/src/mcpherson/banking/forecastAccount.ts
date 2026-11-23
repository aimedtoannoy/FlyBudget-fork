import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { accounts, plaidAccountMappings, scheduleOccurrences, schedules } from '../../db/schema.js';
import { accountPostedTransactionSum, accountTransactionSum } from '../../services/balances.js';
import { forecastCashFlow, type CashFlowEvent } from './forecast.js';

const CASH_TYPES = new Set(['checking', 'savings', 'cash']);

/** Read-only forecast of materialized scheduled occurrences, scoped to one cash account. */
export function forecastAccount(accountId: string, days: 7 | 14 | 30, reserve: number, asOf: string) {
  const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) return { error: 'Account not found', status: 404 } as const;
  if (!CASH_TYPES.has(account.type.toLowerCase())) return { error: 'Forecast requires a cash account', status: 422 } as const;

  const through = new Date(Date.parse(asOf + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);
  const occurrences = db.select({
    id: scheduleOccurrences.id,
    date: scheduleOccurrences.expectedDate,
    amount: scheduleOccurrences.expectedAmount,
    status: scheduleOccurrences.status,
    scheduleStatus: schedules.status,
    transferAccountId: schedules.transferAccountId,
  }).from(scheduleOccurrences)
    .innerJoin(schedules, eq(scheduleOccurrences.scheduleId, schedules.id))
    .where(and(eq(schedules.accountId, accountId), gte(scheduleOccurrences.expectedDate, asOf), lte(scheduleOccurrences.expectedDate, through)))
    .all();
  const events: CashFlowEvent[] = occurrences
    .filter((o) => o.status === 'pending' && o.scheduleStatus === 'active' && o.transferAccountId === null)
    .map((o) => ({ id: o.id, date: o.date, amount: o.amount, kind: o.amount >= 0 ? 'income' : 'bill' }));

  const mapping = db.select({
    available: plaidAccountMappings.bankAvailableBalance,
    fetchedAt: plaidAccountMappings.bankBalanceFetchedAt,
    currency: plaidAccountMappings.currency,
  }).from(plaidAccountMappings)
    .where(and(eq(plaidAccountMappings.accountId, accountId), eq(plaidAccountMappings.isEnabled, 1)))
    .all().sort((a, b) => (b.fetchedAt ?? '').localeCompare(a.fetchedAt ?? ''))[0];
  // Cached availability must never silently be represented as live bank funds.
  const freshAvailable = mapping?.fetchedAt && Date.now() - Date.parse(mapping.fetchedAt) < 24 * 60 * 60 * 1000 &&
    Date.parse(mapping.fetchedAt) <= Date.now() &&
    (!mapping.currency || !account.currency || mapping.currency === account.currency)
    ? mapping.available : null;
  const posted = account.startingBalance + accountPostedTransactionSum(accountId);
  const pending = accountTransactionSum(accountId) - accountPostedTransactionSum(accountId);
  const result = forecastCashFlow({
    asOf, days, accountKind: 'cash', available: freshAvailable ?? null,
    postedLedger: posted, pendingAmount: pending, reserve, events,
  });
  return {
    accountId, accountName: account.name, currency: account.currency,
    bankBalanceFetchedAt: mapping?.fetchedAt ?? null,
    scheduledOccurrenceCount: events.length,
    ...result,
    caveats: [
      'Only existing pending schedule occurrences are included. Missing future occurrences and unscheduled bills are not estimated.',
      'Bank available funds are used only when fetched within 24 hours; retrieval time does not prove bank freshness.',
      'Transfers are excluded to avoid treating internal transfers as income or spending.',
    ],
  };
}
