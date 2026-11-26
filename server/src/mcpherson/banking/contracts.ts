/** Extension-owned contracts. Keep these separate from upstream Plaid response types. */
export type BalanceFreshness = 'unknown' | 'fresh' | 'aging' | 'stale';

export interface BankSyncDiagnostic {
  itemId: string;
  accountId: string | null;
  transactionSyncAt: string | null;
  balanceFetchedAt: string | null;
  bankReportedAt: string | null;
  status: 'good' | 'syncing' | 'error' | 'login_required';
  error: string | null;
}

export interface BankBalanceSnapshot {
  accountId: string;
  currency: string;
  current: number | null;
  available: number | null;
  fetchedAt: string;
  bankReportedAt: string | null;
}
