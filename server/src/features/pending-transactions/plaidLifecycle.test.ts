import { beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { accounts, transactions } from '../../db/schema.js';
import { accountPostedTransactionSum, accountTransactionSum } from '../../services/balances.js';
import { deleteTransactionRow } from '../../services/transactionHelpers.js';
import { promotePendingPlaidTransaction } from './plaidPending.js';

beforeAll(() => {
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  db.insert(accounts).values({ id: 'lifecycle-bank', name: 'Lifecycle', type: 'checking' }).run();
});

describe('Plaid sync lifecycle and replay safety', () => {
  it('preserves a promoted row when Plaid subsequently removes its old pending ID', () => {
    db.insert(transactions).values({
      id: 'lifecycle-local', accountId: 'lifecycle-bank', date: '2026-11-01',
      amount: -2500, pending: 1, importedId: 'plaid:auth-old', notes: 'Keep local changes',
    }).run();
    const change = { accountId: 'lifecycle-bank', priorPlaidId: 'auth-old', postedPlaidId: 'posted-new', date: '2026-11-03', amount: -2800, importedPayee: 'Fuel' };
    expect(promotePendingPlaidTransaction(change)).toBe(true);
    // The removed[] lookup for the old pending ID must not match the promoted row.
    expect(db.select().from(transactions).where(eq(transactions.importedId, 'plaid:auth-old')).get()).toBeUndefined();
    expect(promotePendingPlaidTransaction(change)).toBe(false);
    const row = db.select().from(transactions).where(eq(transactions.id, 'lifecycle-local')).get();
    expect(row).toMatchObject({ importedId: 'plaid:posted-new', amount: -2800, pending: 0, notes: 'Keep local changes' });
    expect(accountTransactionSum('lifecycle-bank')).toBe(-2800);
    expect(accountPostedTransactionSum('lifecycle-bank')).toBe(-2800);
  });

  it('deletes a genuinely removed split authorization and all its children without leaving balance artifacts', () => {
    db.insert(transactions).values([
      { id: 'removed-parent', accountId: 'lifecycle-bank', date: '2026-11-05', amount: -1200, pending: 1, importedId: 'plaid:removed-auth', isParent: 1 },
      { id: 'removed-child-1', accountId: 'lifecycle-bank', date: '2026-11-05', amount: -700, pending: 1, parentTransactionId: 'removed-parent' },
      { id: 'removed-child-2', accountId: 'lifecycle-bank', date: '2026-11-05', amount: -500, pending: 1, parentTransactionId: 'removed-parent' },
    ]).run();
    expect(accountTransactionSum('lifecycle-bank')).toBe(-4000);
    const parent = db.select().from(transactions).where(eq(transactions.id, 'removed-parent')).get()!;
    deleteTransactionRow(parent);
    expect(db.select().from(transactions).all().filter((row) => row.id.startsWith('removed-'))).toHaveLength(0);
    expect(accountTransactionSum('lifecycle-bank')).toBe(-2800);
    expect(accountPostedTransactionSum('lifecycle-bank')).toBe(-2800);
  });

  it('does not guess matches for two similar purchases without explicit Plaid linkage', () => {
    db.insert(transactions).values({ id: 'other-pending', accountId: 'lifecycle-bank', date: '2026-11-06', amount: -2800, pending: 1, importedId: 'plaid:other-auth' }).run();
    expect(promotePendingPlaidTransaction({ accountId: 'lifecycle-bank', priorPlaidId: null, postedPlaidId: 'other-posted', date: '2026-11-07', amount: -2800, importedPayee: 'Fuel' })).toBe(false);
    expect(db.select().from(transactions).where(eq(transactions.id, 'other-pending')).get()?.pending).toBe(1);
  });
});
