import type { BalanceFreshness, BankSyncDiagnostic } from './contracts.js';

/** Classify retrieval age, not the bank's actual posting or refresh age. */
export function classifyRetrievalFreshness(
  fetchedAt: string | null,
  nowMs: number,
  agingAfterMs = 6 * 60 * 60 * 1000,
  staleAfterMs = 24 * 60 * 60 * 1000,
): BalanceFreshness {
  if (!fetchedAt) return 'unknown';
  const fetchedMs = Date.parse(fetchedAt);
  if (!Number.isFinite(fetchedMs) || fetchedMs > nowMs) return 'unknown';
  const age = nowMs - fetchedMs;
  if (age >= staleAfterMs) return 'stale';
  if (age >= agingAfterMs) return 'aging';
  return 'fresh';
}

export function describeBankSync(
  diagnostic: BankSyncDiagnostic,
  nowMs: number,
): { retrievalFreshness: BalanceFreshness; bankFreshnessKnown: boolean; needsAttention: boolean } {
  const retrievalFreshness = classifyRetrievalFreshness(diagnostic.balanceFetchedAt, nowMs);
  return {
    retrievalFreshness,
    bankFreshnessKnown: diagnostic.bankReportedAt !== null,
    needsAttention:
      diagnostic.status === 'error' ||
      diagnostic.status === 'login_required' ||
      retrievalFreshness === 'stale' ||
      retrievalFreshness === 'unknown',
  };
}
