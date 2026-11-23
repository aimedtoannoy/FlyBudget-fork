import type { BalanceFreshness } from './contracts.js';

export interface BankingAlertInput {
  itemId: string;
  institutionName: string;
  status: string;
  transactionFreshness: BalanceFreshness;
  accountName: string | null;
  balanceFreshness: BalanceFreshness | null;
}
export interface FinancialAlert {
  id: string;
  itemId: string;
  accountId?: string;
  severity: 'info' | 'warning' | 'critical';
  code: string;
  message: string;
  action: 'reconnect' | 'review_sync' | 'review_balance' | 'review_forecast';
}
/** Stable keys allow clients to suppress duplicate presentation without storing sensitive data. */
export function bankingAlertCandidates(inputs: BankingAlertInput[]): FinancialAlert[] {
  const alerts: FinancialAlert[] = [];
  for (const input of inputs) {
    const push = (code: string, severity: FinancialAlert['severity'], message: string, action: FinancialAlert['action']) => {
      alerts.push({ id: input.itemId + ':' + code + ':' + (input.accountName ?? ''), itemId: input.itemId, code, severity, message, action });
    };
    if (input.status === 'login_required') push('RECONNECT', 'critical', input.institutionName + ' needs bank reconnection.', 'reconnect');
    else if (input.status === 'error') push('SYNC_ERROR', 'warning', input.institutionName + ' transaction sync failed.', 'review_sync');
    if (input.transactionFreshness === 'stale' && input.status !== 'login_required') push('STALE_TRANSACTIONS', 'warning', input.institutionName + ' transactions have not synced recently.', 'review_sync');
    if (input.accountName && input.balanceFreshness === 'stale') push('STALE_BALANCE', 'warning', input.accountName + ' balance retrieval is stale.', 'review_balance');
  }
  return alerts;
}

export interface ForecastAlertInput {
  accountId: string;
  accountName: string;
  available: number;
  safeToSpendNow: number;
  reserve: number;
  through: string;
  timeline: Array<{ id: string; date: string; amount: number; kind: string; projectedBalance: number }>;
  uncertainSchedules: string[];
}
/** Conservative account alerts: only explicit scheduled outflows and estimated cash position. */
export function forecastAlertCandidates(input: ForecastAlertInput): FinancialAlert[] {
  const alerts: FinancialAlert[] = [];
  const add = (code: string, severity: FinancialAlert['severity'], message: string) => alerts.push({
    id: input.accountId + ':' + code, itemId: '', accountId: input.accountId, severity, code, message, action: 'review_forecast',
  });
  if (input.safeToSpendNow === 0 && input.timeline.some((event) => event.amount < 0)) {
    add('LOW_SAFE_TO_SPEND', 'warning', input.accountName + ' has no estimated safe-to-spend funds after scheduled outflows and reserve.');
  }
  if (input.timeline.some((event) => event.projectedBalance < 0)) {
    add('PROJECTED_OVERDRAFT', 'critical', input.accountName + ' may fall below zero within the forecast window.');
  }
  if (input.timeline.some((event) => event.amount < 0)) {
    add('UPCOMING_BILLS', 'info', input.accountName + ' has scheduled outflows through ' + input.through + '.');
  }
  if (input.uncertainSchedules.length > 0) {
    add('UNCERTAIN_SCHEDULES', 'warning', input.accountName + ' has schedules with uncertain amounts or dates; review the forecast.');
  }
  return alerts;
}

/** Avoid misleading precision when bank and ledger snapshots are not simultaneous. */
export function reconciliationAlertCandidates(records: Array<{ accountId: string; state: string; currentDifference: number | null }>): FinancialAlert[] {
  return records.filter((record) => record.state === 'difference' || record.state === 'currency_mismatch').map((record) => ({
    id: record.accountId + ':RECONCILIATION_' + record.state.toUpperCase(), itemId: '', accountId: record.accountId,
    severity: 'warning' as const, code: 'RECONCILIATION_' + record.state.toUpperCase(),
    message: record.state === 'currency_mismatch' ? 'Account and bank currencies differ.' : 'Bank current balance and posted ledger differ; timestamps may not align.',
    action: 'review_balance' as const,
  }));
}

export function prioritizeAlerts(alerts: FinancialAlert[]): FinancialAlert[] {
  const order = { critical: 0, warning: 1, info: 2 };
  return [...new Map(alerts.map((alert) => [alert.id, alert])).values()].sort((a, b) => order[a.severity] - order[b.severity] || a.id.localeCompare(b.id));
}
