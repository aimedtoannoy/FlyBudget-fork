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

export interface AccountForecastResponse {
  accountId: string;
  accountName: string;
  currency: string | null;
  bankBalanceFetchedAt: string | null;
  scheduledOccurrenceCount: number;
  forecastCoverage: 'materialized_occurrences_only';
  hasScheduledEvents: boolean;
  startingBalance: number;
  startingSource: 'bank_available' | 'ledger_pending';
  endingBalance: number;
  minimumBalance: number;
  reserve: number;
  safeToSpendNow: number;
  through: string;
  timeline: Array<{ id: string; date: string; amount: number; kind: 'income' | 'bill' | 'other'; projectedBalance: number }>;
  disclaimer: string;
  caveats: string[];
}
export const getAccountForecast = (accountId: string, days: 7 | 14 | 30, reserve: number) =>
  apiFetch<AccountForecastResponse>(`/mcpherson/banking/forecast/${encodeURIComponent(accountId)}?days=${days}&reserve=${reserve}`);
