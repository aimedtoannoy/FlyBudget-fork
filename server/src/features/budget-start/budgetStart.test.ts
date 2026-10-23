import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from '../../db/index.js';
import { accounts, categories, categoryGroups, transactions } from '../../db/schema.js';
import { budgetRouter } from '../../routes/budget.js';

let server: Server;
let base: string;

beforeAll(async () => {
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  db.insert(accounts).values({ id: 'budget-bank', name: 'Checking', type: 'checking' }).run();
  db.insert(categoryGroups)
    .values([
      { id: 'budget-income-group', name: 'Income', isIncome: 1 },
      { id: 'budget-expense-group', name: 'Expenses', isIncome: 0 },
    ])
    .run();
  db.insert(categories)
    .values([
      { id: 'budget-income', name: 'Paycheck', groupId: 'budget-income-group' },
      { id: 'budget-groceries', name: 'Groceries', groupId: 'budget-expense-group' },
    ])
    .run();
  db.insert(transactions)
    .values([
      {
        id: 'old-pay',
        accountId: 'budget-bank',
        date: '2026-09-15',
        amount: 1_880_000,
        categoryId: 'budget-income',
      },
      {
        id: 'old-expense',
        accountId: 'budget-bank',
        date: '2026-09-17',
        amount: -1_700_000,
        categoryId: 'budget-groceries',
      },
      {
        id: 'oct-pay',
        accountId: 'budget-bank',
        date: '2026-10-07',
        amount: 200_000,
        categoryId: 'budget-income',
      },
      {
        id: 'oct-expense',
        accountId: 'budget-bank',
        date: '2026-10-10',
        amount: -20_000,
        categoryId: 'budget-groceries',
      },
      {
        id: 'nov-pay',
        accountId: 'budget-bank',
        date: '2026-11-07',
        amount: 180_000,
        categoryId: 'budget-income',
      },
    ])
    .run();

  const app = express();
  app.use(express.json());
  app.use('/budget', budgetRouter);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/budget`;
});

afterAll(() => server.close());

const call = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

describe('opt-in budget starting point', () => {
  it('keeps legacy history until configured', async () => {
    const settings = await call('GET', '/settings');
    expect(settings.body).toEqual({ startMonth: null, openingFunds: 0 });
    const october = await call('GET', '/2026-10/summary');
    expect(october.body).toMatchObject({
      income: 200_000,
      carryOver: 1_880_000,
      toBeBudgeted: 2_080_000,
    });
  });

  it('rejects invalid months and opening funds without writing anything', async () => {
    const invalid = await call('PUT', '/settings', {
      startMonth: '2026-13',
      openingFunds: 45_000,
    });
    expect(invalid.status).toBe(400);
    const unbounded = await call('PUT', '/settings', {
      startMonth: '2026-10',
      openingFunds: 1e14,
    });
    expect(unbounded.status).toBe(400);
    expect((await call('GET', '/settings')).body.startMonth).toBeNull();
  });

  it('starts October with only explicitly unallocated funds and October paychecks', async () => {
    const countBefore = db.select().from(transactions).all().length;
    const accountBefore = db.select().from(accounts).get();
    const saved = await call('PUT', '/settings', {
      startMonth: '2026-10',
      openingFunds: 45_000,
    });
    expect(saved.status).toBe(200);

    const october = (await call('GET', '/2026-10/summary')).body;
    expect(october).toMatchObject({
      income: 200_000,
      carryOver: 45_000,
      totalBudgeted: 0,
      toBeBudgeted: 245_000,
    });
    const groups = (await call('GET', '/2026-10')).body as Array<{
      categories: Array<{ id: string; carryOver: number; spent: number }>;
    }>;
    const groceries = groups.flatMap((g) => g.categories).find((c) => c.id === 'budget-groceries');
    expect(groceries).toMatchObject({ carryOver: 0, spent: 20_000 });
    expect(db.select().from(transactions).all()).toHaveLength(countBefore);
    expect(db.select().from(accounts).get()).toEqual(accountBefore);
  });

  it('rolls forward only income and allocations after October begins', async () => {
    expect(
      (await call('PUT', '/2026-10/budget-groceries', { budgeted: 100_000 })).status,
    ).toBe(200);
    const november = (await call('GET', '/2026-11/summary')).body;
    expect(november).toMatchObject({
      income: 180_000,
      carryOver: 145_000,
      toBeBudgeted: 325_000,
    });
    const groups = (await call('GET', '/2026-11')).body as Array<{
      categories: Array<{ id: string; carryOver: number }>;
    }>;
    const groceries = groups.flatMap((g) => g.categories).find((c) => c.id === 'budget-groceries');
    expect(groceries?.carryOver).toBe(80_000);
    // Old pre-October history is still browsable and can no longer inflate later months.
    const september = (await call('GET', '/2026-09/summary')).body;
    expect(september.income).toBe(1_880_000);
  });

  it('can disable the baseline without touching bank transactions', async () => {
    const response = await call('PUT', '/settings', { startMonth: null, openingFunds: 0 });
    expect(response.status).toBe(200);
    expect((await call('GET', '/2026-10/summary')).body.carryOver).toBe(1_880_000);
    expect(db.select().from(transactions).all()).toHaveLength(5);
  });
});
