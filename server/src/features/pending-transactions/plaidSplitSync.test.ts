import { beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { accounts, transactions } from '../../db/schema.js';
import { accountPostedTransactionSum, accountTransactionSum } from '../../services/balances.js';
import { synchronizePlaidSplitChildren } from './plaidSplitSync.js';

beforeAll(() => {
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  db.insert(accounts).values({ id: 'split-sync-bank', name: 'Checking', type: 'checking' }).run();
  db.insert(transactions).values([
    { id: 'modified-parent', accountId: 'split-sync-bank', date: '2026-11-01', amount: -1000, pending: 1, isParent: 1 },
    { id: 'modified-a', accountId: 'split-sync-bank', date: '2026-11-01', amount: -600, pending: 1, parentTransactionId: 'modified-parent', notes: 'Keep me' },
    { id: 'modified-b', accountId: 'split-sync-bank', date: '2026-11-01', amount: -400, pending: 1, parentTransactionId: 'modified-parent' },
  ]).run();
});

describe('Plaid modified split consistency', () => {
  it('reallocates amounts and pending status while preserving local child IDs and notes', () => {
    db.update(transactions).set({ amount: -1250, pending: 0, date: '2026-11-03' }).where(eq(transactions.id, 'modified-parent')).run();
    synchronizePlaidSplitChildren('modified-parent', -1250, '2026-11-03', false);
    const children = db.select().from(transactions).all().filter((row) => row.parentTransactionId === 'modified-parent');
    expect(children.reduce((total, child) => total + child.amount, 0)).toBe(-1250);
    expect(children.every((child) => child.pending === 0 && child.date === '2026-11-03')).toBe(true);
    expect(children.find((child) => child.id === 'modified-a')?.notes).toBe('Keep me');
    expect(accountTransactionSum('split-sync-bank')).toBe(-1250);
    expect(accountPostedTransactionSum('split-sync-bank')).toBe(-1250);
  });
  it('is idempotent across repeated modifications with the same amount', () => {
    synchronizePlaidSplitChildren('modified-parent', -1250, '2026-11-03', false);
    const children = db.select().from(transactions).all().filter((row) => row.parentTransactionId === 'modified-parent');
    expect(children.reduce((total, child) => total + child.amount, 0)).toBe(-1250);
    expect(children).toHaveLength(2);
  });
});
