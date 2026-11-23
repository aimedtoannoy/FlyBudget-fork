import { apiFetch } from '../../api/client';

export type Freshness = 'unknown' | 'fresh' | 'aging' | 'stale';
export interface BankDiagnosticsResponse {
  generatedAt: string;
  interpretation: string;
  alerts: Array<{ itemId: string; severity: 'warning' | 'critical'; code: string; message: string }>;
  institutions: Array<{
    itemId: string;
    institutionName: string;
    transactionSyncAt: string | null;
    transactionSyncFreshness: Freshness;
    status: string;
    hasSyncError: boolean;
    accounts: Array<{
      accountId: string | null;
      accountName: string;
      balanceFetchedAt: string | null;
      balanceRetrievalFreshness: Freshness;
      bankRefreshTimeKnown: boolean;
      hasCurrentBalance: boolean;
      hasAvailableBalance: boolean;
    }>;
  }>;
}

export interface BankReconciliationResponse {
  generatedAt: string;
  accounts: Array<{
    accountId: string;
    currency: string;
    postedLedgerBalance: number;
    pendingInclusiveLedgerBalance: number;
    bankCurrentBalance: number | null;
    bankAvailableBalance: number | null;
    bankBalanceFetchedAt: string | null;
    currentDifference: number | null;
    state: 'matched' | 'difference' | 'unavailable' | 'currency_mismatch';
    note: string;
  }>;
}

export const getBankDiagnostics = () =>
  apiFetch<BankDiagnosticsResponse>('/mcpherson/banking/diagnostics');
export const getBankReconciliation = () =>
  apiFetch<BankReconciliationResponse>('/mcpherson/banking/reconciliation');

export interface BankSyncHistoryResponse {
  events: Array<{
    itemId: string;
    occurredAt: string;
    status: string;
    added: number;
    modified: number;
    removed: number;
    errorCode: string | null;
  }>;
}
export const getBankSyncHistory = () =>
  apiFetch<BankSyncHistoryResponse>('/mcpherson/banking/history');
