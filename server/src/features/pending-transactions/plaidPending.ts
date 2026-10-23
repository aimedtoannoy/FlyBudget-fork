import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { transactions } from '../../db/schema.js';
import { refreshMainAmounts } from '../../services/mainAmountService.js';
import { syncedTransferChange } from '../../services/transferService.js';

interface PostedReplacement {
  accountId: string;
  priorPlaidId: string | null;
  postedPlaidId: string;
  date: string;
  amount: number;
  importedPayee: string | null;
}

/** Plaid links a newly posted charge to its former authorization by ID.
 * Never guess by merchant or amount: multiple same-day purchases are common.
 */
export function priorPendingImportId(
  pending: boolean,
  pendingTransactionId: string | null,
): string | null {
  return !pending && pendingTransactionId ? `plaid:${pendingTransactionId}` : null;
}

/**
 * Preserve FlyBudget's local transaction ID, category, notes, and schedule link
 * when Plaid replaces a pending ID with a new posted ID. This runs before Plaid's
 * removed[] events so the old authorization cannot delete the promoted row.
 */
export function promotePendingPlaidTransaction(change: PostedReplacement): boolean {
  const priorId = priorPendingImportId(false, change.priorPlaidId);
  if (!priorId) return false;
  const row = db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, change.accountId),
        eq(transactions.importedId, priorId),
        eq(transactions.pending, 1),
      ),
    )
    .get();
  if (!row || row.reconciled === 1) return false;

  db.transaction(() => {
    const transfer = syncedTransferChange(row, {
      date: change.date,
      amount: change.amount,
      importedPayee: change.importedPayee,
    });

    db.update(transactions)
      .set({
        importedId: `plaid:${change.postedPlaidId}`,
        pending: 0,
        ...(transfer === 'unlinked'
          ? row.transferTransactionId
            ? { date: change.date, amount: change.amount, importedPayee: change.importedPayee }
            : {
                date: change.date,
                amount: change.amount,
                payeeName: change.importedPayee,
              }
          : transfer === 'locked'
            ? { date: change.date, importedPayee: change.importedPayee }
            : {
                date: change.date,
                amount: change.amount,
                importedPayee: change.importedPayee,
              }),
      })
      .where(eq(transactions.id, row.id))
      .run();

    // Split children inherit the parent's posting status. The user retains
    // their chosen split allocation; if the final amount differs, review it.
    db.update(transactions)
      .set({ pending: 0 })
      .where(eq(transactions.parentTransactionId, row.id))
      .run();
    refreshMainAmounts([row.id], { keepManual: change.amount === row.amount });
  });
  return true;
}
