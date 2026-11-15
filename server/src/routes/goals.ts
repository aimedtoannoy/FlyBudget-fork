import { Router } from 'express';
import { db } from '../db/index.js';
import { goalTransactionLinks, goals, transactions } from '../db/schema.js';
import { bankCandidates, bankTransaction } from '../features/transaction-links/bankCandidates.js';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { isoDate } from '../utils/validation.js';

export const goalsRouter = Router();

/** Manual saved balance remains unchanged; confirmed transaction allocations are an overlay. */
function withLinkedAmounts() {
  const sums = new Map<string, number>();
  const links = db.select().from(goalTransactionLinks).all();
  for (const link of links) {
    sums.set(link.goalId, (sums.get(link.goalId) ?? 0) + link.appliedAmount);
  }
  return db.select().from(goals).orderBy(goals.sortOrder).all()
    .map((goal) => ({
      ...goal,
      linkedAmount: sums.get(goal.id) ?? 0,
      trackedAmount: goal.currentAmount + (sums.get(goal.id) ?? 0),
      linkedTransactionCount: links.filter((link) => link.goalId === goal.id).length,
    }));
}


const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  targetAmount: z.number().int().min(0).max(1e13),
  currentAmount: z.number().int().min(-1e13).max(1e13).optional(),
  targetDate: isoDate.nullable().optional(),
  accountId: z.string().max(64).nullable().optional(),
  icon: z.string().max(32).optional(),
  // Used in inline styles on the client
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

goalsRouter.get('/', (_req, res) => {
  res.json(withLinkedAmounts());
});

goalsRouter.post('/', (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const now = new Date().toISOString();
  const row = {
    id: nanoid(),
    name: parsed.data.name,
    targetAmount: parsed.data.targetAmount,
    currentAmount: parsed.data.currentAmount ?? 0,
    targetDate: parsed.data.targetDate ?? null,
    accountId: parsed.data.accountId ?? null,
    icon: parsed.data.icon ?? '🎯',
    color: parsed.data.color ?? '#2563EB',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(goals).values(row).run();
  res.status(201).json(withLinkedAmounts().find((g) => g.id === row.id));
});

goalsRouter.put('/:id', (req, res) => {
  const parsed = createSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.targetAmount !== undefined) update.targetAmount = parsed.data.targetAmount;
  if (parsed.data.currentAmount !== undefined) update.currentAmount = parsed.data.currentAmount;
  if (parsed.data.targetDate !== undefined) update.targetDate = parsed.data.targetDate;
  if (parsed.data.accountId !== undefined) update.accountId = parsed.data.accountId;
  if (parsed.data.icon !== undefined) update.icon = parsed.data.icon;
  if (parsed.data.color !== undefined) update.color = parsed.data.color;

  db.update(goals).set(update).where(eq(goals.id, req.params.id)).run();
  const updated = db.select().from(goals).where(eq(goals.id, req.params.id)).get();
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(withLinkedAmounts().find((g) => g.id === updated.id));
});

goalsRouter.delete('/:id', (req, res) => {
  db.delete(goals).where(eq(goals.id, req.params.id)).run();
  res.status(204).send();
});

/** Linked transactions make goal progress auditable without rewriting the bank register. */
goalsRouter.get('/:id/transactions', (req, res) => {
  const goal = db.select().from(goals).where(eq(goals.id, req.params.id)).get();
  if (!goal) return res.status(404).json({ error: 'Goal not found' });
  const links = db.select().from(goalTransactionLinks)
    .where(eq(goalTransactionLinks.goalId, goal.id)).all();
  res.json(links.map((link) => {
    const tx = bankTransaction(link.transactionId);
    return { ...link, transaction: tx };
  }));
});

goalsRouter.get('/:id/transactions/candidates', (req, res) => {
  const goal = db.select().from(goals).where(eq(goals.id, req.params.id)).get();
  if (!goal) return res.status(404).json({ error: 'Goal not found' });
  const search = typeof req.query.search === 'string' ? req.query.search : '';
  const links = db.select().from(goalTransactionLinks).all();
  res.json(bankCandidates({
    includeTransfers: true,
    accountId: goal.accountId,
    search,
  }).map((tx) => ({
    id: tx.id,
    accountId: tx.accountId,
    accountName: tx.accountName,
    payeeName: tx.payeeName,
    date: tx.date,
    amount: tx.value,
    isTransfer: tx.isTransfer,
    availableAmount: Math.max(0, Math.abs(tx.value) -
      links.filter((link) => link.transactionId === tx.id)
        .reduce((total, link) => total + Math.abs(link.appliedAmount), 0)),
  })).filter((candidate) => candidate.availableAmount > 0));
});

const linkInput = z.object({
  transactionId: z.string().min(1).max(100),
  appliedAmount: z.number().int().min(-1e13).max(1e13).refine((value) => value !== 0),
});

goalsRouter.post('/:id/transactions', (req, res) => {
  const goal = db.select().from(goals).where(eq(goals.id, req.params.id)).get();
  if (!goal) return res.status(404).json({ error: 'Goal not found' });
  const parsed = linkInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const tx = bankTransaction(parsed.data.transactionId);
  if (!tx || tx.value === 0) return res.status(400).json({ error: 'Select a posted transaction' });
  if (goal.accountId && tx.accountId !== goal.accountId) {
    return res.status(400).json({ error: 'Transaction is not in the account assigned to this goal' });
  }
  const applied = parsed.data.appliedAmount;
  if (Math.sign(applied) !== Math.sign(tx.value) || Math.abs(applied) > Math.abs(tx.value)) {
    return res.status(400).json({ error: 'Contribution direction/amount does not match the transaction' });
  }
  const existing = db.select().from(goalTransactionLinks)
    .where(eq(goalTransactionLinks.transactionId, tx.id)).all();
  if (existing.some((l) => l.goalId === goal.id)) {
    return res.status(409).json({ error: 'This transaction is already linked to this goal' });
  }
  const claimed = existing.reduce((sum, link) => sum + Math.abs(link.appliedAmount), 0);
  if (claimed + Math.abs(applied) > Math.abs(tx.value)) {
    return res.status(409).json({ error: 'Other goals already claim the remaining amount' });
  }
  if (tx.transferTransactionId) {
    const otherSide = db.select().from(goalTransactionLinks)
      .where(and(eq(goalTransactionLinks.goalId, goal.id),
        eq(goalTransactionLinks.transactionId, tx.transferTransactionId))).get();
    if (otherSide) return res.status(409).json({
      error: 'The opposite side of this transfer already contributes to this goal',
    });
  }
  const id = nanoid();
  db.insert(goalTransactionLinks).values({
    id, goalId: goal.id, transactionId: tx.id, appliedAmount: applied,
  }).run();
  res.status(201).json(withLinkedAmounts().find((g) => g.id === goal.id));
});

goalsRouter.delete('/:id/transactions/:linkId', (req, res) => {
  const link = db.select().from(goalTransactionLinks).where(
    and(eq(goalTransactionLinks.id, req.params.linkId),
      eq(goalTransactionLinks.goalId, req.params.id)),
  ).get();
  if (!link) return res.status(404).json({ error: 'Goal transaction link not found' });
  db.delete(goalTransactionLinks).where(eq(goalTransactionLinks.id, link.id)).run();
  res.json(withLinkedAmounts().find((g) => g.id === req.params.id));
});
