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
  forecastCoverage: 'projected_recurring_schedules';
  projectedOccurrenceCount: number;
  uncertainSchedules: string[];
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

export interface FinancialAlertsResponse {
  generatedAt: string;
  mode: 'preview';
  notificationsSent: false;
  explanation: string;
  alerts: Array<{ id: string; itemId: string; accountId?: string; severity: 'info' | 'warning' | 'critical'; code: string; message: string; action: 'reconnect' | 'review_sync' | 'review_balance' | 'review_forecast' }>;
}
export const getFinancialAlerts = () => apiFetch<FinancialAlertsResponse>('/mcpherson/banking/alerts');

export interface AlertPreferences { enabled: boolean; minimumSeverity: 'info' | 'warning' | 'critical'; cooldownHours: number }
export const getAlertPreferences = () => apiFetch<AlertPreferences>('/mcpherson/banking/alert-preferences');
export const saveAlertPreferences = (value: AlertPreferences) => apiFetch<AlertPreferences>('/mcpherson/banking/alert-preferences', { method: 'PUT', body: JSON.stringify(value) });
