import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from '../../db/index.js';
import { accounts, personalLoans, personalLoanRepayments, transactions } from '../../db/schema.js';
import { personalLoansRouter } from './routes.js';

let server: Server;
let base: string;

beforeAll(async () => {
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  const app = express();
  app.use(express.json());
  app.use('/loans', personalLoansRouter);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/loans`;
});
afterAll(() => server.close());

beforeEach(() => {
  db.delete(personalLoanRepayments).run();
  db.delete(personalLoans).run();
  db.delete(transactions).run();
  db.delete(accounts).run();
  db.insert(accounts).values({ id: 'checking', name: 'Checking', type: 'checking' }).run();
});

const call = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
};

const loanInput = {
  borrower: 'John',
  principal: 50000,
  lentOn: '2026-10-01',
  repaymentMode: 'open',
  firstDueOn: null,
  cadence: null,
  installmentAmount: null,
  remindersEnabled: 0,
  notes: 'No fixed deadline',
};

describe('personal loans REST API', () => {
  it('stores an open-ended loan without creating a bank transaction', async () => {
    const created = await call('POST', '/', loanInput);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      borrower: 'John', outstanding: 50000, repaid: 0, status: 'active',
    });
    expect(db.select().from(transactions).all()).toHaveLength(0);
    expect(db.select().from(accounts).all()).toHaveLength(1);

    const edit = await call('PUT', `/${created.body.id}`, {
      repaymentMode: 'installments',
      firstDueOn: '2026-11-01',
      cadence: 'monthly',
      installmentAmount: 10000,
      remindersEnabled: 1,
    });
    expect(edit.status).toBe(200);
    expect(edit.body.nextDueOn).toBe('2026-11-01');
    expect(edit.body.repaymentMode).toBe('installments');
    expect((await call('GET', '/')).body).toHaveLength(1);
  });

  it('rejects malformed schedules, overpayment, and invalid modification', async () => {
    expect((await call('POST', '/', { ...loanInput, principal: -1 })).status).toBe(400);
    expect((await call('POST', '/', {
      ...loanInput, repaymentMode: 'installments', firstDueOn: '2026-11-01',
    })).status).toBe(400);
    const created = await call('POST', '/', loanInput);
    expect((await call('POST', `/${created.body.id}/repayments`, {
      paidOn: '2026-10-03', amount: 60000,
    })).status).toBe(409);
    expect((await call('POST', `/${created.body.id}/repayments`, {
      paidOn: '2026-09-29', amount: 10000,
    })).status).toBe(400);
    await call('POST', `/${created.body.id}/repayments`, {
      paidOn: '2026-10-03', amount: 20000,
    });
    expect((await call('PUT', `/${created.body.id}`, { principal: 15000 })).status).toBe(409);
  });

  it('records partial and full repayments, supports deletion, and retains bank records', async () => {
    const created = await call('POST', '/', loanInput);
    const first = await call('POST', `/${created.body.id}/repayments`, {
      paidOn: '2026-10-05', amount: 20000, notes: 'Cash', transactionId: null,
    });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ repaid: 20000, outstanding: 30000 });
    const second = await call('POST', `/${created.body.id}/repayments`, {
      paidOn: '2026-10-15', amount: 30000,
    });
    expect(second.body).toMatchObject({ repaid: 50000, outstanding: 0, status: 'repaid' });
    expect((await call('POST', `/${created.body.id}/repayments`, {
      paidOn: '2026-10-20', amount: 1000,
    })).status).toBe(409);
    const id = first.body.repayments.find((p: { amount: number }) => p.amount === 20000).id;
    const removed = await call('DELETE', `/${created.body.id}/repayments/${id}`);
    expect(removed.body.outstanding).toBe(20000);
    expect((await call('DELETE', `/${created.body.id}`)).status).toBe(204);
    expect(db.select().from(personalLoanRepayments).all()).toHaveLength(0);
  });

  it('links only user-approved posted inflows, never twice, and does not mutate deposits', async () => {
    db.insert(transactions).values([
      { id: 'posted', accountId: 'checking', date: '2026-10-15',
        amount: 15000, payeeName: 'John deposit' },
      { id: 'pending', accountId: 'checking', date: '2026-10-16',
        amount: 10000, pending: 1 },
      { id: 'outgoing', accountId: 'checking', date: '2026-10-16', amount: -5000 },
    ]).run();
    const created = await call('POST', '/', loanInput);
    const id = created.body.id;
    const pending = await call('POST', `/${id}/repayments`, {
      paidOn: '2026-10-16', amount: 10000, transactionId: 'pending',
    });
    expect(pending.status).toBe(400);
    expect((await call('POST', `/${id}/repayments`, {
      paidOn: '2026-10-16', amount: 5000, transactionId: 'outgoing',
    })).status).toBe(400);
    expect((await call('POST', `/${id}/repayments`, {
      paidOn: '2026-10-15', amount: 14000, transactionId: 'posted',
    })).status).toBe(400);
    const paid = await call('POST', `/${id}/repayments`, {
      paidOn: '2026-10-15', amount: 15000, transactionId: 'posted',
    });
    expect(paid.status).toBe(201);
    expect(paid.body.outstanding).toBe(35000);
    const another = await call('POST', '/', { ...loanInput, borrower: 'Sarah' });
    expect((await call('POST', `/${another.body.id}/repayments`, {
      paidOn: '2026-10-15', amount: 15000, transactionId: 'posted',
    })).status).toBe(409);
    expect(db.select().from(transactions).all()).toHaveLength(3);
  });
});
