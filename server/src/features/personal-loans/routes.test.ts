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

describe('borrower profiles, multiple loans, extra credit and account matching', () => {
  it('groups legacy same-name IOUs into a single profile without losing repayments', async () => {
    db.insert(personalLoans).values([
      { id: 'old-a', borrower: 'Existing Borrower', principal: 50000, lentOn: '2026-09-01' },
      { id: 'old-b', borrower: ' existing borrower ', principal: 20000, lentOn: '2026-10-01' },
    ]).run();
    db.insert(personalLoanRepayments).values({
      id: 'historical-payment', loanId: 'old-a', amount: 10000, paidOn: '2026-09-10',
    }).run();
    const profiles = (await call('GET', '/profiles')).body;
    const profile = profiles.find((p: { name: string }) =>
      p.name === 'Existing Borrower');
    expect(profile).toMatchObject({ loanCount: 2, outstanding: 60000, repaid: 10000 });
    const loans = (await call('GET', '/')).body;
    expect(loans.filter((loan: { profileId: string }) => loan.profileId === profile.id))
      .toHaveLength(2);
    expect(loans.find((loan: { id: string }) => loan.id === 'old-a').repaid).toBe(10000);
    expect(db.select().from(transactions).all()).toHaveLength(0);
  });

  it('creates multiple named loans for one person and allows profile rename without losing IDs', async () => {
    const profile = await call('POST', '/profiles', {
      name: 'Borrower 18', notes: 'Two separate loans',
    });
    expect(profile.status).toBe(201);
    const first = await call('POST', '/', {
      ...loanInput, borrower: 'Borrower 18', profileId: profile.body.id,
      title: 'Truck repair', principal: 30000,
    });
    const second = await call('POST', '/', {
      ...loanInput, borrower: 'Borrower 18', profileId: profile.body.id,
      title: 'November advance', principal: 25000,
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.profileId).toBe(second.body.profileId);
    expect(first.body.id).not.toBe(second.body.id);
    const renamed = await call('PUT', `/profiles/${profile.body.id}`, {
      name: 'Borrower 18 Updated',
    });
    expect(renamed.status).toBe(200);
    const loans = (await call('GET', '/')).body;
    expect(loans.filter((l: { profileId: string }) => l.profileId === profile.body.id)
      .map((l: { title: string }) => l.title).sort()).toEqual([
      'November advance', 'Truck repair',
    ]);
    expect(loans.find((l: { id: string }) => l.id === first.body.id).borrower)
      .toBe('Borrower 18 Updated');
    expect((await call('DELETE', `/profiles/${profile.body.id}`)).status).toBe(409);
    expect(db.select().from(transactions).all()).toHaveLength(0);
  });

  it('allows different people sharing the same name to have distinct financial profiles', async () => {
    const first = await call('POST', '/profiles', { name: 'Same Name', notes: 'Person A' });
    const second = await call('POST', '/profiles', { name: 'Same Name', notes: 'Person B' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).not.toBe(second.body.id);
    const firstLoan = await call('POST', '/', {
      ...loanInput, borrower: 'Same Name', profileId: first.body.id, title: 'First account',
    });
    const secondLoan = await call('POST', '/', {
      ...loanInput, borrower: 'Same Name', profileId: second.body.id, title: 'Second account',
    });
    expect(firstLoan.body.profileId).toBe(first.body.id);
    expect(secondLoan.body.profileId).toBe(second.body.id);
  });

  it('additional credit increases outstanding without replacing original principal', async () => {
    const created = await call('POST', '/', loanInput);
    const id = created.body.id;
    const advance = await call('POST', `/${id}/advances`, {
      advancedOn: '2026-10-09', amount: 20000, notes: 'Extra loan', transactionId: null,
    });
    expect(advance.status).toBe(201);
    expect(advance.body).toMatchObject({
      principal: 50000, advanced: 20000, totalPrincipal: 70000,
      outstanding: 70000,
    });
    const payment = await call('POST', `/${id}/repayments`, {
      paidOn: '2026-10-11', amount: 60000,
    });
    expect(payment.body.outstanding).toBe(10000);
    const advanceId = advance.body.advances[0].id;
    expect((await call('DELETE', `/${id}/advances/${advanceId}`)).status).toBe(409);
    const repaymentId = payment.body.repayments[0].id;
    await call('DELETE', `/${id}/repayments/${repaymentId}`);
    const removed = await call('DELETE', `/${id}/advances/${advanceId}`);
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({ totalPrincipal: 50000, outstanding: 50000 });
  });

  it('links only posted outflows with matching values and rejects IOU reuse', async () => {
    db.insert(transactions).values([
      { id: 'original-out', accountId: 'checking',
        date: '2026-10-01', amount: -50000 },
      { id: 'extra-out', accountId: 'checking', date: '2026-10-09', amount: -10000 },
      { id: 'pending-out', accountId: 'checking', date: '2026-10-10',
        amount: -20000, pending: 1 },
    ]).run();
    const loan = (await call('POST', '/', loanInput)).body;
    const otherLoan = (await call('POST', '/', { ...loanInput, borrower: 'Other Borrower' })).body;
    expect((await call('PUT', `/${loan.id}/disbursement`, {
      transactionId: 'pending-out',
    })).status).toBe(400);
    expect((await call('PUT', `/${loan.id}/disbursement`, {
      transactionId: 'original-out',
    })).status).toBe(200);
    expect((await call('PUT', `/${otherLoan.id}/disbursement`, {
      transactionId: 'original-out',
    })).status).toBe(409);
    const added = await call('POST', `/${loan.id}/advances`, {
      advancedOn: '2026-10-09', amount: 10000, transactionId: 'extra-out',
    });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ outstanding: 60000, advanced: 10000 });
    expect((await call('POST', `/${otherLoan.id}/advances`, {
      advancedOn: '2026-10-09', amount: 10000, transactionId: 'extra-out',
    })).status).toBe(409);
    expect(db.select().from(transactions).all()).toHaveLength(3);
  });
});
