import { beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { accounts, categories, categoryGroups, transactions } from '../../db/schema.js';
import { accountPostedTransactionSum, accountTransactionSum } from '../../services/balances.js';
import { priorPendingImportId, promotePendingPlaidTransaction } from './plaidPending.js';

beforeAll(() => {
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  db.insert(accounts).values({ id: 'test-bank', name: 'Checking', type: 'checking' }).run();
  db.insert(categoryGroups).values({ id: 'test-group', name: 'Shopping' }).run();
  db.insert(categories).values({ id: 'test-cat', name: 'Groceries', groupId: 'test-group' }).run();
});

describe('Plaid pending-to-posted matching', () => {
  it('uses the explicit ID Plaid provides for the prior pending authorization', () => {
    expect(priorPendingImportId(false, 'pending-123')).toBe('plaid:pending-123');
  });

  it('does not guess a match based on amount or merchant', () => {
    expect(priorPendingImportId(false, null)).toBeNull();
  });

  it('never attempts to promote another pending authorization', () => {
    expect(priorPendingImportId(true, 'pending-123')).toBeNull();
  });

  it('promotes in place and retains categories and notes', () => {
    db.insert(transactions)
      .values({
        id: 'local-1',
        accountId: 'test-bank',
        date: '2026-10-21',
        amount: -1000,
        payeeName: 'Coffee',
        notes: 'Personal note',
        categoryId: 'test-cat',
        importedId: 'plaid:pending-1',
        pending: 1,
      })
      .run();
    expect(accountPostedTransactionSum('test-bank')).toBe(0);
    expect(accountTransactionSum('test-bank')).toBe(-1000);

    expect(
      promotePendingPlaidTransaction({
        accountId: 'test-bank',
        priorPlaidId: 'pending-1',
        postedPlaidId: 'posted-1',
        date: '2026-10-22',
        amount: -1100,
        importedPayee: 'Coffee',
      }),
    ).toBe(true);

    expect(
      db.select().from(transactions).where(eq(transactions.id, 'local-1')).get(),
    ).toMatchObject({
      pending: 0,
      importedId: 'plaid:posted-1',
      amount: -1100,
      categoryId: 'test-cat',
      notes: 'Personal note',
      date: '2026-10-22',
    });
    expect(accountTransactionSum('test-bank')).toBe(-1100);
    expect(accountPostedTransactionSum('test-bank')).toBe(-1100);
    expect(db.select().from(transactions).all()).toHaveLength(1);
  });

  it('does not promote another transaction without an explicit Plaid ID link', () => {
    expect(
      promotePendingPlaidTransaction({
        accountId: 'test-bank',
        priorPlaidId: null,
        postedPlaidId: 'unrelated-posted',
        date: '2026-10-22',
        amount: -1100,
        importedPayee: 'Coffee',
      }),
    ).toBe(false);
  });

  it('keeps split children balanced when a pending amount changes on posting', () => {
    db.insert(transactions)
      .values([
        {
          id: 'split-parent',
          accountId: 'test-bank',
          date: '2026-10-21',
          amount: -1000,
          importedId: 'plaid:pending-split',
          pending: 1,
          isParent: 1,
        },
        {
          id: 'split-a',
          accountId: 'test-bank',
          date: '2026-10-21',
          amount: -700,
          pending: 1,
          parentTransactionId: 'split-parent',
          categoryId: 'test-cat',
        },
        {
          id: 'split-b',
          accountId: 'test-bank',
          date: '2026-10-21',
          amount: -300,
          pending: 1,
          parentTransactionId: 'split-parent',
          notes: 'Second category',
        },
      ])
      .run();

    expect(
      promotePendingPlaidTransaction({
        accountId: 'test-bank',
        priorPlaidId: 'pending-split',
        postedPlaidId: 'posted-split',
        date: '2026-10-22',
        amount: -1200,
        importedPayee: 'Store',
      }),
    ).toBe(true);
    const parts = db
      .select()
      .from(transactions)
      .where(eq(transactions.parentTransactionId, 'split-parent'))
      .all();
    expect(parts.map((part) => part.amount).sort((a, b) => a - b)).toEqual([-840, -360]);
    expect(parts.reduce((n, part) => n + part.amount, 0)).toBe(-1200);
    expect(parts.every((part) => part.pending === 0)).toBe(true);
    expect(parts.every((part) => part.date === '2026-10-22')).toBe(true);
    expect(parts.find((p) => p.id === 'split-a')?.categoryId).toBe('test-cat');
    expect(parts.find((p) => p.id === 'split-b')?.notes).toBe('Second category');
  });
});
