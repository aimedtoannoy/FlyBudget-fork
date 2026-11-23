import { useCallback, useEffect, useState } from 'react';
import { formatMoney } from '../../utils/currency';
import { ForecastPanel } from './ForecastPanel';
import {
  getBankDiagnostics,
  getFinancialAlerts,
  type FinancialAlertsResponse,
  getBankReconciliation,
  getBankSyncHistory,
  type BankDiagnosticsResponse,
  type BankReconciliationResponse,
  type BankSyncHistoryResponse,
} from './api';

const showTime = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not yet recorded';

/** Optional fork-owned UI. Never triggers a bank sync or changes account balances. */
export function BankHealthPanel() {
  const [diagnostics, setDiagnostics] = useState<BankDiagnosticsResponse | null>(null);
  const [financialAlerts, setFinancialAlerts] = useState<FinancialAlertsResponse | null>(null);
  const [reconciliation, setReconciliation] = useState<BankReconciliationResponse | null>(null);
  const [history, setHistory] = useState<BankSyncHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextDiagnostics, nextReconciliation, nextHistory, nextAlerts] = await Promise.all([
        getBankDiagnostics(),
        getBankReconciliation(),
        getBankSyncHistory(),
        getFinancialAlerts(),
      ]);
      setDiagnostics(nextDiagnostics);
      setFinancialAlerts(nextAlerts);
      setReconciliation(nextReconciliation);
      setHistory(nextHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load bank diagnostics');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <section className="rounded-lg border border-border p-4 space-y-3" aria-label="Bank sync health">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">Bank sync health (McPherson extension)</h3>
        <button type="button" className="text-xs text-brand-600 hover:underline" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh report'}
        </button>
      </div>
      <p className="text-xs text-text-tertiary">This report is read-only. Freshness is based on FlyBudget retrieval time, not a verified bank refresh. Refreshing the report does not sync Plaid.</p>
      {error && <p role="alert" className="text-xs text-negative">{error}</p>}
      {financialAlerts && <div className="rounded-md border border-border p-3 space-y-2" aria-label="Financial alert preview">
        <h4 className="text-xs font-semibold text-text">Financial alerts (preview only)</h4>
        <p className="text-xs text-text-tertiary">No push or email notifications are sent. Alerts are estimates based on recorded data.</p>
        {financialAlerts.alerts.length === 0 && <p className="text-xs text-text-secondary">No current alerts.</p>}
        {financialAlerts.alerts.map((alert) => <p key={alert.id} className="text-xs text-text-secondary" role={alert.severity === 'critical' ? 'alert' : 'status'}>{alert.severity === 'critical' ? 'Urgent' : alert.severity === 'warning' ? 'Review' : 'Upcoming'}: {alert.message}</p>)}
      </div>}
      {false && diagnostics?.alerts.map((alert, index) => (
        <p key={`${alert.itemId}-${alert.code}-${index}`} className="text-xs text-text-secondary" role="status">{alert.severity === 'critical' ? 'Action needed' : 'Attention'}: {alert.message}</p>
      ))}
      {diagnostics && diagnostics.institutions.length === 0 && <p className="text-xs text-text-secondary">No Plaid institutions connected.</p>}
      {history && history.events.length > 0 && (
        <p className="text-xs text-text-secondary">Recent Plaid sync attempts: {history.events.length} (latest: {showTime(history.events[0].occurredAt)} · {history.events[0].status}).</p>
      )}
      {diagnostics?.institutions.map((item) => (
        <div key={item.itemId} className="rounded-md bg-surface-alt p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm text-text">{item.institutionName}</strong>
            <span className="text-xs text-text-secondary">Sync: {item.status} · Transactions: {item.transactionSyncFreshness}</span>
          </div>
          <p className="text-xs text-text-tertiary">Last transaction sync: {showTime(item.transactionSyncAt)}</p>
          {item.accounts.map((account, index) => {
            const comparison = reconciliation?.accounts.find((a) => a.accountId === account.accountId);
            return (
              <div key={account.accountId ?? index} className="border-t border-border-light pt-2 space-y-1">
                <p className="text-xs font-medium text-text">{account.accountName}</p>
                <p className="text-xs text-text-secondary">Balance retrieval: {account.balanceRetrievalFreshness} · {showTime(account.balanceFetchedAt)}</p>
                <p className="text-xs text-text-tertiary">Bank refresh time: unknown · Current balance: {account.hasCurrentBalance ? 'provided' : 'not provided'} · Available: {account.hasAvailableBalance ? 'provided' : 'not provided'}</p>
                {account.accountId && <ForecastPanel accountId={account.accountId} accountName={account.accountName} />}
                {comparison && <p className="text-xs text-text-secondary">Ledger comparison: {comparison.state}{comparison.currentDifference !== null ? ` · Difference: ${formatMoney(comparison.currentDifference, comparison.currency)}` : ''}</p>}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
