import { Router } from 'express';
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { format, subDays } from 'date-fns';
import { db } from '../../db/index.js';
import {
  accounts,
  personalLoans,
  personalLoanRepayments,
  transactions,
} from '../../db/schema.js';
import { getBudgetSettings } from '../../services/mainAmountService.js';
import { isoDate } from '../../utils/validation.js';
import { loanProgress, type LoanCadence, type LoanMode } from './schedule.js';

export const personalLoansRouter = Router();

const money = z.number().int().positive().max(1e13);
const notes = z.string().trim().max(5000).nullable();
const loanFields = z.object({
  borrower: z.string().trim().min(1).max(200),
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

function allLoans() {
  const rows = db.select().from(personalLoans).orderBy(desc(personalLoans.lentOn)).all();
  const payments = db.select().from(personalLoanRepayments)
    .orderBy(desc(personalLoanRepayments.paidOn)).all();
  const today = format(new Date(), 'yyyy-MM-dd');
  return rows.map((loan) => {
    const repayments = payments.filter((p) => p.loanId === loan.id);
    const repaid = repayments.reduce((sum, p) => sum + p.amount, 0);
    return {
      ...loan,
      repayments,
      repaid,
      ...loanProgress({
        ...loan,
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

personalLoansRouter.get('/', (_req, res) => res.json(allLoans()));

personalLoansRouter.post('/', (req, res) => {
  const parsed = loanInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const id = nanoid();
  db.insert(personalLoans).values({ id, ...parsed.data }).run();
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
  const repaid = db.select({
    total: sql<number>`coalesce(sum(${personalLoanRepayments.amount}), 0)`,
  }).from(personalLoanRepayments)
    .where(eq(personalLoanRepayments.loanId, original.id)).get()?.total ?? 0;
  if (parsed.data.principal < repaid) {
    return res.status(409).json({ error: 'Principal cannot be less than recorded repayments' });
  }
  db.update(personalLoans)
    .set({ ...parsed.data, updatedAt: new Date().toISOString() })
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

function depositValue(t: { amount: number; mainAmount: number | null; currency: string | null }) {
  const budgetCurrency = getBudgetSettings().currency;
  if (t.currency && t.currency !== budgetCurrency && t.mainAmount === null) return null;
  return t.mainAmount ?? t.amount;
}

personalLoansRouter.get('/:id/deposits', (req, res) => {
  const loan = getLoan(req.params.id);
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  const since = format(subDays(new Date(), 180), 'yyyy-MM-dd');
  const used = new Set(
    db.select({ transactionId: personalLoanRepayments.transactionId })
      .from(personalLoanRepayments).all().map((x) => x.transactionId),
  );
  const posted = db.select({
    id: transactions.id,
    date: transactions.date,
    amount: transactions.amount,
    mainAmount: transactions.mainAmount,
    payeeName: transactions.payeeName,
    currency: accounts.currency,
  }).from(transactions).innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(and(gte(transactions.date, since), eq(accounts.isOffBudget, 0),
      eq(transactions.pending, 0), eq(transactions.isAdjustment, 0),
      eq(transactions.isParent, 0), isNull(transactions.parentTransactionId),
      isNull(transactions.transferTransactionId)))
    .orderBy(desc(transactions.date)).limit(250).all();
  res.json(posted
    .map((tx) => ({ id: tx.id, date: tx.date, amount: depositValue(tx), payeeName: tx.payeeName }))
    .filter((tx) => tx.amount !== null && tx.amount > 0 && tx.amount <= loan.outstanding &&
      tx.date >= loan.lentOn && !used.has(tx.id))
    .slice(0, 40));
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
    const tx = db.select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      mainAmount: transactions.mainAmount,
      pending: transactions.pending,
      isAdjustment: transactions.isAdjustment,
      isParent: transactions.isParent,
      parentTransactionId: transactions.parentTransactionId,
      transferTransactionId: transactions.transferTransactionId,
      isOffBudget: accounts.isOffBudget,
      currency: accounts.currency,
    }).from(transactions).innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(eq(transactions.id, p.transactionId)).get();
    if (!tx) return res.status(404).json({ error: 'Bank deposit not found' });
    const linked = db.select({ id: personalLoanRepayments.id })
      .from(personalLoanRepayments)
      .where(eq(personalLoanRepayments.transactionId, tx.id)).get();
    if (linked) return res.status(409).json({ error: 'Deposit already linked to another repayment' });
    const amount = depositValue(tx);
    if (tx.pending || tx.isAdjustment || tx.isParent || tx.parentTransactionId ||
      tx.transferTransactionId || tx.isOffBudget || amount === null || amount <= 0) {
      return res.status(400).json({ error: 'Choose an unlinked, posted deposit' });
    }
    if (p.paidOn !== tx.date || p.amount !== amount) {
      return res.status(400).json({ error: 'Linked repayment must match deposit date and amount' });
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
