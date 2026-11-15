import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from '../../db/index.js';
import { accounts, goalTransactionLinks, goals, transactions } from '../../db/schema.js';
import { goalsRouter } from '../../routes/goals.js';

let server: Server;
let base: string;
beforeAll(async () => {
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  const app = express();
  app.use(express.json());
  app.use('/goals', goalsRouter);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/goals`;
});
afterAll(() => server.close());

beforeEach(() => {
  db.delete(goalTransactionLinks).run();
  db.delete(goals).run();
  db.delete(transactions).run();
  db.delete(accounts).run();
  db.insert(accounts).values([
    { id: 'checking', name: 'Checking', type: 'checking' },
    { id: 'savings', name: 'Savings', type: 'savings' },
  ]).run();
  db.insert(transactions).values([
    { id: 'paycheck', accountId: 'checking', date: '2026-10-05', amount: 50000 },
    { id: 'small', accountId: 'checking', date: '2026-10-08', amount: 20000 },
    { id: 'expense', accountId: 'checking', date: '2026-10-09', amount: -4000 },
    { id: 'pending', accountId: 'checking', date: '2026-10-10', amount: 5000, pending: 1 },
    { id: 'transfer-out', accountId: 'checking', date: '2026-10-11',
      amount: -10000, transferTransactionId: 'transfer-in' },
    { id: 'transfer-in', accountId: 'savings', date: '2026-10-11',
      amount: 10000, transferTransactionId: 'transfer-out' },
  ]).run();
});

const call = async (method: string, path: string, body?: unknown) => {
  const r = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
};

const goalFields = {
  name: 'Emergency Fund', targetAmount: 200000, currentAmount: 20000,
};

describe('goal transaction allocations', () => {
  it('adds only explicitly linked posted amounts; unlink restores original progress', async () => {
    const goal = (await call('POST', '/', goalFields)).body;
    expect(goal).toMatchObject({ currentAmount: 20000, linkedAmount: 0, trackedAmount: 20000 });
    expect((await call('POST', `/${goal.id}/transactions`, {
      transactionId: 'pending', appliedAmount: 5000,
    })).status).toBe(400);
    const linked = await call('POST', `/${goal.id}/transactions`, {
      transactionId: 'paycheck', appliedAmount: 15000,
    });
    expect(linked.status).toBe(201);
    expect(linked.body).toMatchObject({
      currentAmount: 20000, linkedAmount: 15000, trackedAmount: 35000,
    });
    expect((await call('POST', `/${goal.id}/transactions`, {
      transactionId: 'paycheck', appliedAmount: 10000,
    })).status).toBe(409);
    const changed = await call('POST', `/${goal.id}/transactions`, {
      transactionId: 'expense', appliedAmount: -4000,
    });
    expect(changed.body).toMatchObject({ linkedAmount: 11000, trackedAmount: 31000 });
    const rows = (await call('GET', `/${goal.id}/transactions`)).body;
    expect(rows).toHaveLength(2);
    const outLink = rows.find((row: { transactionId: string }) =>
      row.transactionId === 'expense');
    const removed = await call('DELETE', `/${goal.id}/transactions/${outLink.id}`);
    expect(removed.body).toMatchObject({ trackedAmount: 35000 });
    expect(db.select().from(transactions).all()).toHaveLength(6);
  });

  it('enforces cumulative allocations across goals without oversubscribing a deposit', async () => {
    const first = (await call('POST', '/', { ...goalFields, name: 'Goal A' })).body;
    const second = (await call('POST', '/', { ...goalFields, name: 'Goal B' })).body;
    expect((await call('POST', `/${first.id}/transactions`, {
      transactionId: 'small', appliedAmount: 15000,
    })).status).toBe(201);
    expect((await call('POST', `/${second.id}/transactions`, {
      transactionId: 'small', appliedAmount: 10000,
    })).status).toBe(409);
    expect((await call('POST', `/${second.id}/transactions`, {
      transactionId: 'small', appliedAmount: 5000,
    })).status).toBe(201);
    const available = (await call('GET', `/${first.id}/transactions/candidates`)).body;
    expect(available.find((t: { id: string }) => t.id === 'small')).toBeUndefined();
    expect(db.select().from(transactions).all()).toHaveLength(6);
  });

  it('prevents both sides of one transfer counting toward the same goal', async () => {
    const goal = (await call('POST', '/', goalFields)).body;
    expect((await call('POST', `/${goal.id}/transactions`, {
      transactionId: 'transfer-in', appliedAmount: 10000,
    })).status).toBe(201);
    expect((await call('POST', `/${goal.id}/transactions`, {
      transactionId: 'transfer-out', appliedAmount: -10000,
    })).status).toBe(409);
  });

  it('respects an account-bound goal and removes links when source transactions are deleted', async () => {
    const goal = (await call('POST', '/', { ...goalFields, accountId: 'savings' })).body;
    expect((await call('POST', `/${goal.id}/transactions`, {
      transactionId: 'paycheck', appliedAmount: 1000,
    })).status).toBe(400);
    expect((await call('POST', `/${goal.id}/transactions`, {
      transactionId: 'transfer-in', appliedAmount: 10000,
    })).status).toBe(201);
    db.delete(transactions).run();
    expect((await call('GET', '/')).body[0]).toMatchObject({
      currentAmount: 20000, linkedAmount: 0, trackedAmount: 20000,
    });
  });
});
