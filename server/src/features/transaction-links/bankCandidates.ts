import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { accounts, transactions } from '../../db/schema.js';
import { getBudgetSettings } from '../../services/mainAmountService.js';

/** One posted transaction, expressed in the budget's currency. Never edits source records. */
export function bankTransaction(id: string) {
  const row = db.select({
    id: transactions.id,
    accountId: transactions.accountId,
    accountName: accounts.name,
    currency: accounts.currency,
    isOffBudget: accounts.isOffBudget,
    date: transactions.date,
    amount: transactions.amount,
    mainAmount: transactions.mainAmount,
    payeeName: transactions.payeeName,
    pending: transactions.pending,
    isAdjustment: transactions.isAdjustment,
    isParent: transactions.isParent,
    parentTransactionId: transactions.parentTransactionId,
    transferTransactionId: transactions.transferTransactionId,
  }).from(transactions).innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(eq(transactions.id, id)).get();
  if (!row || row.pending || row.isAdjustment || row.isParent || row.parentTransactionId)
    return null;
  const budgetCurrency = getBudgetSettings().currency;
  if (row.currency && row.currency !== budgetCurrency && row.mainAmount === null) return null;
  return {
    ...row,
    value: row.mainAmount ?? row.amount,
    isTransfer: Boolean(row.transferTransactionId),
  };
}

export type BankCandidate = NonNullable<ReturnType<typeof bankTransaction>>;

export function bankCandidates(opts: {
  direction?: 'in' | 'out';
  accountId?: string | null;
  includeTransfers?: boolean;
  onBudgetOnly?: boolean;
  search?: string;
}) {
  const conditions = [
    eq(transactions.pending, 0),
    eq(transactions.isAdjustment, 0),
    eq(transactions.isParent, 0),
    isNull(transactions.parentTransactionId),
    ...(opts.accountId ? [eq(transactions.accountId, opts.accountId)] : []),
    ...(opts.onBudgetOnly ? [eq(accounts.isOffBudget, 0)] : []),
    ...(opts.includeTransfers ? [] : [isNull(transactions.transferTransactionId)]),
  ];
  // Fetch in one joined query, rather than 1,500 individual bank and settings reads.
  const posted = db.select({
    id: transactions.id,
    accountId: transactions.accountId,
    accountName: accounts.name,
    currency: accounts.currency,
    isOffBudget: accounts.isOffBudget,
    date: transactions.date,
    amount: transactions.amount,
    mainAmount: transactions.mainAmount,
    payeeName: transactions.payeeName,
    pending: transactions.pending,
    isAdjustment: transactions.isAdjustment,
    isParent: transactions.isParent,
    parentTransactionId: transactions.parentTransactionId,
    transferTransactionId: transactions.transferTransactionId,
  }).from(transactions).innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(and(...conditions)).orderBy(desc(transactions.date)).limit(1500).all();
  const budgetCurrency = getBudgetSettings().currency;
  const q = (opts.search ?? '').trim().toLowerCase().slice(0, 120);
  return posted.map((t) => ({
    ...t,
    value: t.currency && t.currency !== budgetCurrency && t.mainAmount === null
      ? null : (t.mainAmount ?? t.amount),
    isTransfer: Boolean(t.transferTransactionId),
  })).filter((t): t is typeof t & { value: number } => {
    if (t.value === null || t.value === 0) return false;
    if (opts.direction === 'in' && t.value <= 0) return false;
    if (opts.direction === 'out' && t.value >= 0) return false;
    if (!opts.includeTransfers && t.isTransfer) return false;
    return !q || `${t.date} ${t.payeeName ?? ''} ${t.accountName} ${Math.abs(t.value) / 100}`
      .toLowerCase().includes(q);
  }).slice(0, 100);
}
