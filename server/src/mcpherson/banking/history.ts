import { randomUUID } from 'node:crypto';
import { db } from '../../db/index.js';
import { mcBankBalanceSnapshots, mcBankSyncEvents } from '../../db/schema.js';
import { logError } from '../../utils/log.js';

/** Record only sync metadata. Never persist Plaid credentials or full provider errors. */
export function recordBankSyncEvent(input: {
  plaidItemId: string;
  status: 'good' | 'error' | 'login_required';
  added: number;
  modified: number;
  removed: number;
  errorCode?: string | null;
}) {
  try {
    db.insert(mcBankSyncEvents).values({
    id: randomUUID(),
    plaidItemId: input.plaidItemId,
    occurredAt: new Date().toISOString(),
    status: input.status,
    addedCount: input.added,
    modifiedCount: input.modified,
    removedCount: input.removed,
    errorCode: input.errorCode?.slice(0, 80) ?? null,
    }).run();
  } catch (err) {
    logError('McPherson sync audit recording failed', err);
  }
}

/** Persist exactly what Plaid returned, including null vs zero. */
export function recordBankBalanceSnapshot(input: {
  mappingId: string;
  fetchedAt: string;
  current: number | null;
  available: number | null;
  currency: string | null;
}) {
  try {
    db.insert(mcBankBalanceSnapshots).values({
    id: randomUUID(),
    mappingId: input.mappingId,
    fetchedAt: input.fetchedAt,
    currentMinor: input.current,
    availableMinor: input.available,
    currency: input.currency,
    }).run();
  } catch (err) {
    logError('McPherson balance snapshot recording failed', err);
  }
}
