import { Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { format } from 'date-fns';
import { db } from '../../db/index.js';
import {
  borrowerProfiles,
  personalLoans,
  personalLoanAdvances,
  personalLoanRepayments,
} from '../../db/schema.js';
import { bankCandidates, bankTransaction } from '../transaction-links/bankCandidates.js';
import { isoDate } from '../../utils/validation.js';
import { loanProgress, type LoanCadence, type LoanMode } from './schedule.js';

export const personalLoansRouter = Router();

const money = z.number().int().positive().max(1e13);
const notes = z.string().trim().max(5000).nullable();
const loanFields = z.object({
  borrower: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200).nullable().optional(),
  profileId: z.string().min(1).max(100).nullable().optional(),
  principal: money,
  lentOn: isoDate,
  repaymentMode: z.enum(['open', 'once', 'installments']),
  firstDueOn: isoDate.nullable(),
  cadence: z.enum(['weekly', 'biweekly', 'monthly']).nullable(),
  installmentAmount: money.nullable(),
  remindersEnabled: z.number().int().min(0).max(1),
  notes,
});

const loanInput = loanFields.superRefine((v, ctx) => {
  const reject = (field: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [field], message });
  if (v.repaymentMode === 'open') {
    if (v.firstDueOn || v.cadence || v.installmentAmount) {
      reject('repaymentMode', 'Open-ended loans cannot have a repayment schedule');
    }
  } else {
    if (!v.firstDueOn) reject('firstDueOn', 'Choose the first repayment date');
    if (v.firstDueOn && v.firstDueOn < v.lentOn)
      reject('firstDueOn', 'Repayment cannot be due before the loan date');
    if (v.repaymentMode === 'once' && (v.cadence || v.installmentAmount))
      reject('cadence', 'One-time loans cannot have installments');
    if (v.repaymentMode === 'installments' && (!v.cadence || !v.installmentAmount))
      reject('installmentAmount', 'Choose a frequency and installment amount');
  }
});

const paymentInput = z.object({
  paidOn: isoDate,
  amount: money,
  notes: notes.default(null),
  transactionId: z.string().min(1).max(100).nullable().default(null),
});

const profileInput = z.object({
  name: z.string().trim().min(1).max(200),
  notes: notes.default(null),
});

/** Existing standalone IOUs are grouped once by the decrypted borrower name. */
function ensureProfiles() {
  const all = db.select().from(borrowerProfiles).all();
  const byName = new Map(all.map((p) => [p.name.trim().toLocaleLowerCase(), p]));
  for (const loan of db.select().from(personalLoans).all()) {
    if (loan.profileId) continue;
    const name = loan.borrower.trim();
    const key = name.toLocaleLowerCase();
    let profile = byName.get(key);
    if (!profile) {
      profile = {
        id: nanoid(),
        name,
        notes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.insert(borrowerProfiles).values(profile).run();
      byName.set(key, profile);
    }
    db.update(personalLoans).set({ profileId: profile.id })
      .where(eq(personalLoans.id, loan.id)).run();
  }
}

function resolveProfile(borrower: string, profileId: string | null | undefined) {
  ensureProfiles();
  if (profileId) {
    const profile = db.select().from(borrowerProfiles)
      .where(eq(borrowerProfiles.id, profileId)).get();
    if (!profile) return null;
    return profile;
  }
  const found = db.select().from(borrowerProfiles).all()
    .find((p) => p.name.trim().toLocaleLowerCase() === borrower.trim().toLocaleLowerCase());
  if (found) return found;
  const created = {
    id: nanoid(),
    name: borrower.trim(),
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.insert(borrowerProfiles).values(created).run();
  return created;
}

function isLoanTransactionUsed(transactionId: string) {
  return Boolean(
    db.select({ id: personalLoans.id }).from(personalLoans)
      .where(eq(personalLoans.disbursementTransactionId, transactionId)).get() ||
    db.select({ id: personalLoanAdvances.id }).from(personalLoanAdvances)
      .where(eq(personalLoanAdvances.transactionId, transactionId)).get() ||
    db.select({ id: personalLoanRepayments.id }).from(personalLoanRepayments)
      .where(eq(personalLoanRepayments.transactionId, transactionId)).get()
  );
}

function allLoans() {
  ensureProfiles();
  const profiles = new Map(db.select().from(borrowerProfiles).all().map((p) => [p.id, p]));
  const rows = db.select().from(personalLoans).orderBy(desc(personalLoans.lentOn)).all();
  const payments = db.select().from(personalLoanRepayments)
    .orderBy(desc(personalLoanRepayments.paidOn)).all();
  const advances = db.select().from(personalLoanAdvances)
    .orderBy(desc(personalLoanAdvances.advancedOn)).all();
  const today = format(new Date(), 'yyyy-MM-dd');
  return rows.map((loan) => {
    const repayments = payments.filter((p) => p.loanId === loan.id);
    const credits = advances.filter((p) => p.loanId === loan.id);
    const repaid = repayments.reduce((sum, p) => sum + p.amount, 0);
    const advanced = credits.reduce((sum, p) => sum + p.amount, 0);
    const totalPrincipal = loan.principal + advanced;
    return {
      ...loan,
      borrower: (loan.profileId ? profiles.get(loan.profileId)?.name : null) ?? loan.borrower,
      title: loan.title ?? `Loan · ${loan.lentOn}`,
      advances: credits,
      advanced,
      totalPrincipal,
      repayments,
      repaid,
      ...loanProgress({
        ...loan,
        principal: totalPrincipal,
        repaid,
        repaymentMode: loan.repaymentMode as LoanMode,
        cadence: loan.cadence as LoanCadence | null,
      }, today),
    };
  });
}

function getLoan(id: string) {
  return allLoans().find((loan) => loan.id === id);
}

personalLoansRouter.get('/profiles', (_req, res) => {
  ensureProfiles();
  const loans = allLoans();
  res.json(db.select().from(borrowerProfiles).all().map((profile) => {
    const own = loans.filter((loan) => loan.profileId === profile.id);
    return {
      ...profile,
      loanCount: own.length,
      outstanding: own.reduce((v, loan) => v + loan.outstanding, 0),
      repaid: own.reduce((v, loan) => v + loan.repaid, 0),
      totalLent: own.reduce((v, loan) => v + loan.totalPrincipal, 0),
    };
  }).sort((a, b) => a.name.localeCompare(b.name)));
});

personalLoansRouter.post('/profiles', (req, res) => {
  const parsed = profileInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  ensureProfiles();
  // Profiles are identified by ID: two distinct people may have the same name.
  const id = nanoid();
  const row = { id, ...parsed.data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  db.insert(borrowerProfiles).values(row).run();
  res.status(201).json(row);
});

personalLoansRouter.put('/profiles/:profileId', (req, res) => {
  const original = db.select().from(borrowerProfiles)
    .where(eq(borrowerProfiles.id, req.params.profileId)).get();
  if (!original) return res.status(404).json({ error: 'Profile not found' });
  const parsed = profileInput.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  db.update(borrowerProfiles).set({ ...parsed.data, updatedAt: new Date().toISOString() })
    .where(eq(borrowerProfiles.id, original.id)).run();
  if (parsed.data.name) {
    db.update(personalLoans).set({ borrower: parsed.data.name })
      .where(eq(personalLoans.profileId, original.id)).run();
  }
  res.json(db.select().from(borrowerProfiles).where(eq(borrowerProfiles.id, original.id)).get());
});

personalLoansRouter.delete('/profiles/:profileId', (req, res) => {
  const exists = db.select().from(borrowerProfiles)
    .where(eq(borrowerProfiles.id, req.params.profileId)).get();
  if (!exists) return res.status(404).json({ error: 'Profile not found' });
  if (db.select({ id: personalLoans.id }).from(personalLoans)
    .where(eq(personalLoans.profileId, exists.id)).get()) {
    return res.status(409).json({ error: 'Move or delete this profile’s loans first' });
  }
  db.delete(borrowerProfiles).where(eq(borrowerProfiles.id, exists.id)).run();
  res.status(204).send();
});

personalLoansRouter.get('/', (_req, res) => res.json(allLoans()));

personalLoansRouter.post('/', (req, res) => {
  const parsed = loanInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const id = nanoid();
  const profile = resolveProfile(parsed.data.borrower, parsed.data.profileId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  db.insert(personalLoans).values({
    id,
    ...parsed.data,
    borrower: profile.name,
    profileId: profile.id,
  }).run();
  res.status(201).json(getLoan(id));
});

personalLoansRouter.put('/:id', (req, res) => {
  const original = db.select().from(personalLoans)
    .where(eq(personalLoans.id, req.params.id)).get();
  if (!original) return res.status(404).json({ error: 'Loan not found' });
  const patch = loanFields.partial().safeParse(req.body);
  if (!patch.success) return res.status(400).json({ error: patch.error.flatten() });
  const parsed = loanInput.safeParse({ ...original, ...patch.data });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const profile = resolveProfile(parsed.data.borrower, parsed.data.profileId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  if (original.disbursementTransactionId && parsed.data.principal !== original.principal) {
    return res.status(409).json({
      error: 'Unlink the original bank transaction before changing the original loan amount',
    });
  }
  const advancesTotal = db.select({
    total: sql<number>`coalesce(sum(${personalLoanAdvances.amount}), 0)`,
  }).from(personalLoanAdvances)
    .where(eq(personalLoanAdvances.loanId, original.id)).get()?.total ?? 0;
  const repaid = db.select({
    total: sql<number>`coalesce(sum(${personalLoanRepayments.amount}), 0)`,
  }).from(personalLoanRepayments)
    .where(eq(personalLoanRepayments.loanId, original.id)).get()?.total ?? 0;
  if (parsed.data.principal + advancesTotal < repaid) {
    return res.status(409).json({ error: 'Principal cannot be less than recorded repayments' });
  }
  db.update(personalLoans)
    .set({ ...parsed.data, profileId: profile.id, borrower: profile.name, updatedAt: new Date().toISOString() })
    .where(eq(personalLoans.id, original.id)).run();
  res.json(getLoan(original.id));
});

personalLoansRouter.delete('/:id', (req, res) => {
  const loan = db.select({ id: personalLoans.id }).from(personalLoans)
    .where(eq(personalLoans.id, req.params.id)).get();
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  db.delete(personalLoans).where(eq(personalLoans.id, loan.id)).run();
  res.status(204).send();
});

/** Reviewable posted transactions. No automatic association or invented bank entries. */
personalLoansRouter.get('/:id/deposits', (req, res) => {
  const loan = getLoan(req.params.id);
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  res.json(bankCandidates({
    direction: 'in',
    onBudgetOnly: true,
    search: typeof req.query.search === 'string' ? req.query.search : '',
  }).filter((t) => t.date >= loan.lentOn && t.value <= loan.outstanding &&
    !isLoanTransactionUsed(t.id)).map((t) => ({
      id: t.id, date: t.date, amount: t.value, payeeName: t.payeeName, accountName: t.accountName,
    })));
});

personalLoansRouter.get('/:id/outflows', (req, res) => {
  const loan = getLoan(req.params.id);
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  res.json(bankCandidates({
    direction: 'out',
    onBudgetOnly: true,
    search: typeof req.query.search === 'string' ? req.query.search : '',
  }).filter((t) => !isLoanTransactionUsed(t.id)).map((t) => ({
    id: t.id, date: t.date, amount: Math.abs(t.value),
    payeeName: t.payeeName, accountName: t.accountName,
  })));
});

personalLoansRouter.put('/:id/disbursement', (req, res) => {
  const loan = getLoan(req.params.id);
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  const parsed = z.object({ transactionId: z.string().min(1).max(100).nullable() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const txId = parsed.data.transactionId;
  if (txId) {
    const tx = bankTransaction(txId);
    if (!tx || tx.isTransfer || tx.isOffBudget || tx.value !== -loan.principal) {
      return res.status(400).json({ error: 'Choose a posted outflow equal to the original amount lent' });
    }
    if (isLoanTransactionUsed(txId) && loan.disbursementTransactionId !== txId) {
      return res.status(409).json({ error: 'Transaction already assigned to another IOU event' });
    }
  }
  db.update(personalLoans).set({ disbursementTransactionId: txId })
    .where(eq(personalLoans.id, loan.id)).run();
  res.json(getLoan(loan.id));
});

const advanceInput = z.object({
  advancedOn: isoDate,
  amount: money,
  notes: notes.default(null),
  transactionId: z.string().min(1).max(100).nullable().default(null),
});

personalLoansRouter.post('/:id/advances', (req, res) => {
  const loan = getLoan(req.params.id);
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  const parsed = advanceInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const credit = parsed.data;
  if (credit.advancedOn < loan.lentOn)
    return res.status(400).json({ error: 'Additional credit predates original loan' });
  if (loan.totalPrincipal + credit.amount > 1e13)
    return res.status(400).json({ error: 'Loan total exceeds supported amount' });
  if (credit.transactionId) {
    const tx = bankTransaction(credit.transactionId);
    if (!tx || tx.isTransfer || tx.isOffBudget || tx.date !== credit.advancedOn ||
        tx.value !== -credit.amount) {
      return res.status(400).json({ error: 'Credit must match an existing posted bank outflow' });
    }
    if (isLoanTransactionUsed(credit.transactionId))
      return res.status(409).json({ error: 'Transaction already linked to another IOU' });
  }
  db.insert(personalLoanAdvances)
    .values({ id: nanoid(), loanId: loan.id, ...credit }).run();
  res.status(201).json(getLoan(loan.id));
});

personalLoansRouter.delete('/:id/advances/:advanceId', (req, res) => {
  const loan = getLoan(req.params.id);
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  const credit = db.select().from(personalLoanAdvances).where(
    and(eq(personalLoanAdvances.id, req.params.advanceId), eq(personalLoanAdvances.loanId, loan.id)),
  ).get();
  if (!credit) return res.status(404).json({ error: 'Credit not found' });
  if (loan.totalPrincipal - credit.amount < loan.repaid)
    return res.status(409).json({ error: 'Cannot remove credit already covered by repayments' });
  db.delete(personalLoanAdvances).where(eq(personalLoanAdvances.id, credit.id)).run();
  res.json(getLoan(loan.id));
});

/** Manual repayment or explicit approval of an actual posted inflow. */
personalLoansRouter.post('/:id/repayments', (req, res) => {
  const loan = getLoan(req.params.id);
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  const parsed = paymentInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const p = parsed.data;
  if (p.paidOn < loan.lentOn) return res.status(400).json({ error: 'Repayment predates the loan' });
  if (p.amount > loan.outstanding)
    return res.status(409).json({ error: 'Repayment exceeds outstanding principal' });

  if (p.transactionId) {
    const tx = bankTransaction(p.transactionId);
    if (!tx || tx.isTransfer || tx.isOffBudget || tx.value <= 0) {
      return res.status(400).json({ error: 'Choose a posted unlinked bank inflow' });
    }
    if (isLoanTransactionUsed(tx.id)) {
      return res.status(409).json({ error: 'Bank deposit already linked to another IOU event' });
    }
    if (p.paidOn !== tx.date || p.amount !== tx.value) {
      return res.status(400).json({ error: 'Repayment must exactly match deposit date and amount' });
    }
  }
  db.insert(personalLoanRepayments)
    .values({ id: nanoid(), loanId: loan.id, ...p }).run();
  res.status(201).json(getLoan(loan.id));
});

personalLoansRouter.delete('/:id/repayments/:paymentId', (req, res) => {
  const payment = db.select({ id: personalLoanRepayments.id })
    .from(personalLoanRepayments)
    .where(and(eq(personalLoanRepayments.id, req.params.paymentId),
      eq(personalLoanRepayments.loanId, req.params.id))).get();
  if (!payment) return res.status(404).json({ error: 'Repayment not found' });
  db.delete(personalLoanRepayments).where(eq(personalLoanRepayments.id, payment.id)).run();
  res.json(getLoan(req.params.id));
});
