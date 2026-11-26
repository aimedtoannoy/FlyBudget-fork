import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { transactions } from '../../db/schema.js';
import { allocate } from '../../utils/money.js';

/** Keep a split's children consistent when Plaid modifies an authorization in place. */
export function synchronizePlaidSplitChildren(parentId: string, amount: number, date: string, pending: boolean): void {
  const children = db.select().from(transactions)
    .where(eq(transactions.parentTransactionId, parentId))
    .orderBy(transactions.id).all();
  if (children.length === 0) return;
  const parts = allocate(amount, children.map((child) => child.amount));
  for (const [index, child] of children.entries()) {
    db.update(transactions).set({ amount: parts[index], date, pending: pending ? 1 : 0 })
      .where(and(eq(transactions.id, child.id), eq(transactions.parentTransactionId, parentId))).run();
  }
}
