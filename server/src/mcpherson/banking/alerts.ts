import type { BalanceFreshness } from './contracts.js';

export interface BankingAlertInput {
  itemId: string;
  institutionName: string;
  status: string;
  transactionFreshness: BalanceFreshness;
  accountName: string | null;
  balanceFreshness: BalanceFreshness | null;
}

/** Pure alert candidates; no notifications, external messages, or financial mutations. */
export function bankingAlertCandidates(inputs: BankingAlertInput[]) {
  return inputs.flatMap((input) => {
    const alerts: Array<{ itemId: string; severity: 'warning' | 'critical'; code: string; message: string }> = [];
    if (input.status === 'login_required') {
      alerts.push({ itemId: input.itemId, severity: 'critical', code: 'RECONNECT', message: input.institutionName + ' needs bank reconnection.' });
    } else if (input.status === 'error') {
      alerts.push({ itemId: input.itemId, severity: 'warning', code: 'SYNC_ERROR', message: input.institutionName + ' transaction sync failed.' });
    }
    if (input.transactionFreshness === 'stale') {
      alerts.push({ itemId: input.itemId, severity: 'warning', code: 'STALE_TRANSACTIONS', message: input.institutionName + ' transactions have not synced recently.' });
    }
    if (input.accountName && input.balanceFreshness === 'stale') {
      alerts.push({ itemId: input.itemId, severity: 'warning', code: 'STALE_BALANCE', message: input.accountName + ' balance retrieval is stale.' });
    }
    return alerts;
  });
}
