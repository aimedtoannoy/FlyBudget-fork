import { describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import * as s from '../../db/schema.js';
import { accountPostedTransactionSum, accountTransactionSum } from '../../services/balances.js';
import { promotePendingPlaidTransaction } from '../../features/pending-transactions/plaidPending.js';
import { forecastAccount } from './forecastAccount.js';
import { inspectReconciliation } from './reconciliation.js';
import { forecastAlertCandidates, reconciliationAlertCandidates, prioritizeAlerts } from './alerts.js';
import { refreshAlertInbox } from './inboxStore.js';

describe('cross-module financial consistency', () => {
  it('preserves ledger isolation and reconciles pending, scheduled and alert states', () => {
    migrate(db, { migrationsFolder: 'src/db/migrations' });
    const id = 'phase7-cash';
    const now = Date.now();
    db.insert(s.accounts).values({ id, name: 'Fixture cash', type: 'checking', startingBalance: 100000, currency: 'USD' }).run();
    db.insert(s.transactions).values([
      { id: 'p7-posted', accountId: id, date: '2026-11-20', amount: -20000 },
      { id: 'p7-pending', accountId: id, date: '2026-11-23', amount: -10000, pending: 1, importedId: 'plaid:p7-auth', notes: 'Keep note' },
      { id: 'p7-split', accountId: id, date: '2026-11-20', amount: -5000, isParent: 1 },
      { id: 'p7-child', accountId: id, date: '2026-11-20', amount: -5000, parentTransactionId: 'p7-split' },
    ]).run();
    db.insert(s.schedules).values([
      { id: 'p7-bill', name: 'Bill', accountId: id, amount: -80000, recurrenceType: 'once', recurrenceRule: '{"type":"once"}', startDate: '2026-11-25' },
      { id: 'p7-pay', name: 'Paycheck', accountId: id, amount: 100000, recurrenceType: 'once', recurrenceRule: '{"type":"once"}', startDate: '2026-11-27' },
      { id: 'p7-matched', name: 'Already paid', accountId: id, amount: -20000, recurrenceType: 'once', recurrenceRule: '{"type":"once"}', startDate: '2026-11-26' },
    ]).run();
    db.insert(s.scheduleOccurrences).values({ id: 'p7-occ', scheduleId: 'p7-matched', scheduledDate: '2026-11-26', expectedDate: '2026-11-26', expectedAmount: -20000, status: 'matched', matchedTransactionId: 'p7-posted' }).run();
    const ledger = () => ({ posted: accountPostedTransactionSum(id), total: accountTransactionSum(id) });
    expect(ledger()).toEqual({ posted: -25000, total: -35000 });
    const before = db.select().from(s.transactions).all();
    db.insert(s.personalLoans).values({ id: 'p7-loan', borrower: 'Fixture borrower', principal: 30000, lentOn: '2026-11-20', disbursementTransactionId: 'p7-posted' }).run();
    db.insert(s.personalLoanAdvances).values({ id: 'p7-advance', loanId: 'p7-loan', amount: 5000, advancedOn: '2026-11-21' }).run();
    db.insert(s.personalLoanRepayments).values({ id: 'p7-repayment', loanId: 'p7-loan', amount: 2000, paidOn: '2026-11-22' }).run();
    db.insert(s.personalLoanCredits).values({ id: 'p7-credit', loanId: 'p7-loan', amount: 1000, appliedOn: '2026-11-23' }).run();
    expect(ledger()).toEqual({ posted: -25000, total: -35000 });
    const forecast = forecastAccount(id, 7, 0, '2026-11-24');
    if ('error' in forecast) throw new Error(forecast.error);
    expect(forecast.startingBalance).toBe(65000);
    expect(forecast.timeline.map(event => event.amount)).toEqual([-80000, 100000]);
    expect(forecast.minimumBalance).toBe(-15000);
    expect(forecast.endingBalance).toBe(85000);
    expect(forecast.safeToSpendNow).toBe(0);
    const reconcile = (current: number) => inspectReconciliation({ accountId: id, currency: 'USD', bankCurrency: 'USD', startingBalance: 100000, postedTransactionSum: ledger().posted, pendingTransactionSum: ledger().total - ledger().posted, bankCurrentBalance: current, bankAvailableBalance: 65000, bankBalanceFetchedAt: new Date(now).toISOString() });
    expect(reconcile(75000)).toMatchObject({ state: 'matched', pendingInclusiveLedgerBalance: 65000 });
    const alerts = prioritizeAlerts([...forecastAlertCandidates({ accountId: id, accountName: 'Fixture cash', available: forecast.startingBalance, ...forecast }), ...reconciliationAlertCandidates([reconcile(75000)])]);
    expect(alerts.map(alert => alert.code)).toEqual(['PROJECTED_OVERDRAFT', 'LOW_SAFE_TO_SPEND', 'UPCOMING_BILLS']);
    db.insert(s.mcAlertPreferences).values({ id: 'default', enabled: 1 }).run();
    expect(refreshAlertInbox(db, alerts, now).alerts.map(alert => alert.code)).toEqual(['PROJECTED_OVERDRAFT', 'LOW_SAFE_TO_SPEND']);
    expect(db.select().from(s.transactions).all()).toEqual(before);
    expect(db.select().from(s.scheduleOccurrences).all()).toHaveLength(1);
    expect(promotePendingPlaidTransaction({ accountId: id, priorPlaidId: 'p7-auth', postedPlaidId: 'p7-final', date: '2026-11-24', amount: -10000, importedPayee: 'Fixture' })).toBe(true);
    expect(ledger()).toEqual({ posted: -35000, total: -35000 });
    expect(reconcile(65000).state).toBe('matched');
    expect(db.select().from(s.transactions).where(eq(s.transactions.id, 'p7-pending')).get()).toMatchObject({ pending: 0, notes: 'Keep note' });
    expect(reconciliationAlertCandidates([reconcile(64000)])[0]?.code).toBe('RECONCILIATION_DIFFERENCE');
  });
});
