import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { accounts, plaidAccountMappings, plaidItems, transactions } from '../db/schema.js';
import { accountPostedTransactionSum, accountTransactionSum } from './balances.js';
import type { PlaidSyncResult } from './plaidService.js';

const mocks = vi.hoisted(() => ({ sync: vi.fn(), backfill: vi.fn() }));
vi.mock('./plaidService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./plaidService.js')>();
  return { ...actual, syncTransactions: mocks.sync, getCurrentPendingTransactions: mocks.backfill };
});
import { syncPlaidItem } from './plaidSyncService.js';

const transaction = (id: string, pending: boolean, prior: string | null = null) => ({
  transactionId: id, accountId: 'plaid-sync-account', date: '2026-11-12', amount: 12.5,
  name: 'Shop', merchantName: null, category: [], pending, pendingTransactionId: prior, currency: 'USD',
});
const batch = (overrides: Partial<PlaidSyncResult> = {}): PlaidSyncResult => ({
  added: [], modified: [], removed: [], nextCursor: 'next-cursor', accountBalances: [], ...overrides,
});
beforeAll(() => {
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  db.insert(accounts).values({ id: 'sync-test-checking', name: 'Checking', type: 'checking', currency: 'USD' }).run();
  db.insert(plaidItems).values({ id: 'sync-test-item', plaidItemId: 'external-item', institutionId: 'bank', institutionName: 'Bank', accessToken: 'fake-test-token', pendingBackfilled: 0 }).run();
  db.insert(plaidAccountMappings).values({ id: 'sync-test-map', plaidItemId: 'sync-test-item', plaidAccountId: 'plaid-sync-account', accountId: 'sync-test-checking', plaidAccountName: 'Checking', plaidAccountType: 'depository', currency: 'USD' }).run();
});
beforeEach(() => {
  db.delete(transactions).where(eq(transactions.accountId, 'sync-test-checking')).run();
  db.update(plaidItems).set({ cursor: null, pendingBackfilled: 0 }).where(eq(plaidItems.id, 'sync-test-item')).run();
  mocks.sync.mockReset();
  mocks.backfill.mockReset();
  mocks.backfill.mockResolvedValue([]);
});
describe('Plaid item sync integration', () => {
  it('does not resurrect a pending hold already replaced by a posted event', async () => {
    mocks.backfill.mockResolvedValue([transaction('old-auth', true)]);
    mocks.sync.mockResolvedValue(batch({ added: [transaction('posted', false, 'old-auth')], removed: [{ transactionId: 'old-auth' }] }));
    const result = await syncPlaidItem('sync-test-item');
    expect(result.errors).toEqual([]);
    expect(result.added).toBe(1);
    expect(db.select().from(transactions).where(eq(transactions.accountId, 'sync-test-checking')).all()).toHaveLength(1);
    expect(db.select().from(transactions).where(eq(transactions.importedId, 'plaid:old-auth')).get()).toBeUndefined();
    expect(accountPostedTransactionSum('sync-test-checking')).toBe(-1250);
    expect(db.select().from(plaidItems).where(eq(plaidItems.id, 'sync-test-item')).get()?.cursor).toBe('next-cursor');
  });
  it('promotes a backfilled authorization in place and ignores removal of its old ID', async () => {
    mocks.backfill.mockResolvedValue([transaction('old-auth-2', true)]);
    mocks.sync.mockResolvedValue(batch());
    expect((await syncPlaidItem('sync-test-item')).errors).toEqual([]);
    const original = db.select().from(transactions).where(eq(transactions.importedId, 'plaid:old-auth-2')).get()!;
    mocks.sync.mockResolvedValue(batch({ added: [transaction('posted-2', false, 'old-auth-2')], removed: [{ transactionId: 'old-auth-2' }], nextCursor: 'second-cursor' }));
    const result = await syncPlaidItem('sync-test-item');
    expect(result.errors).toEqual([]);
    expect(result.modified).toBe(1);
    expect(result.removed).toBe(0);
    expect(db.select().from(transactions).where(eq(transactions.id, original.id)).get()).toMatchObject({ importedId: 'plaid:posted-2', pending: 0 });
    expect(accountTransactionSum('sync-test-checking')).toBe(-1250);
    expect(accountPostedTransactionSum('sync-test-checking')).toBe(-1250);
    mocks.sync.mockResolvedValue(batch({ added: [transaction('posted-2', false, 'old-auth-2')], nextCursor: 'third-cursor' }));
    const replay = await syncPlaidItem('sync-test-item');
    expect(replay.added).toBe(0);
    expect(replay.modified).toBe(0);
    expect(db.select().from(transactions).where(eq(transactions.accountId, 'sync-test-checking')).all()).toHaveLength(1);
  });
  it('does not import a backfilled hold that the same sync removed', async () => {
    mocks.backfill.mockResolvedValue([transaction('stale-auth', true)]);
    mocks.sync.mockResolvedValue(batch({ removed: [{ transactionId: 'stale-auth' }] }));
    expect((await syncPlaidItem('sync-test-item')).errors).toEqual([]);
    expect(db.select().from(transactions).where(eq(transactions.accountId, 'sync-test-checking')).all()).toHaveLength(0);
  });
});
