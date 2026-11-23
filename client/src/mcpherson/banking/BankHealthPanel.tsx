import { useCallback, useEffect, useState } from 'react';
import { formatMoney } from '../../utils/currency';
import {
  getBankDiagnostics,
  getBankReconciliation,
  type BankDiagnosticsResponse,
  type BankReconciliationResponse,
} from './api';

const showTime = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not yet recorded';

/** Optional fork-owned UI. Never triggers a bank sync or changes account balances. */
export function BankHealthPanel() {
  const [diagnostics, setDiagnostics] = useState<BankDiagnosticsResponse | null>(null);
  const [reconciliation, setReconciliation] = useState<BankReconciliationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextDiagnostics, nextReconciliation] = await Promise.all([
        getBankDiagnostics(),
        getBankReconciliation(),
      ]);
      setDiagnostics(nextDiagnostics);
      setReconciliation(nextReconciliation);
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
      {diagnostics && diagnostics.institutions.length === 0 && <p className="text-xs text-text-secondary">No Plaid institutions connected.</p>}
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
                {comparison && <p className="text-xs text-text-secondary">Ledger comparison: {comparison.state}{comparison.currentDifference !== null ? ` · Difference: ${formatMoney(comparison.currentDifference, comparison.currency)}` : ''}</p>}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
