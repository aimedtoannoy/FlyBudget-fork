import { useState } from 'react';
import { formatMoney } from '../../utils/currency';
import { minorUnits } from '../../utils/currencies';
import { getAccountForecast, type AccountForecastResponse } from './api';

/** Read-only preview. A forecast is not a bank-verified spendable balance. */
export function ForecastPanel({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [reserve, setReserve] = useState('0');
  const [result, setResult] = useState<AccountForecastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function preview() {
    const amount = Number(reserve);
    const multiplier = 10 ** minorUnits(result?.currency ?? null);
    if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * multiplier))) {
      setError('Enter a valid nonnegative reserve amount.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try { setResult(await getAccountForecast(accountId, days, Math.round(amount * multiplier))); }
    catch (err) { setError(err instanceof Error ? err.message : 'Forecast unavailable'); }
    finally { setLoading(false); }
  }
  const money = (amount: number) => formatMoney(amount, result?.currency ?? undefined);
  return (
    <div className="rounded-md border border-border p-3 space-y-2" aria-label={`Cash-flow preview for ${accountName}`}>
      <h4 className="text-xs font-semibold text-text">Cash-flow preview · {accountName}</h4>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-text-secondary">Horizon
          <select className="block rounded border border-border bg-surface p-1" value={days} onChange={(e) => { setDays(Number(e.target.value) as 7 | 14 | 30); setResult(null); }}>
            <option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option>
          </select>
        </label>
        <label className="text-xs text-text-secondary">Reserve (account currency)
          <input className="block w-28 rounded border border-border bg-surface p-1" type="number" min="0" step="0.01" value={reserve} onChange={(e) => { setReserve(e.target.value); setResult(null); }} />
        </label>
        <button type="button" disabled={loading} onClick={() => void preview()} className="rounded border border-border px-2 py-1 text-xs text-text">{loading ? 'Calculating…' : 'Preview'}</button>
      </div>
      {error && <p role="alert" className="text-xs text-negative">{error}</p>}
      {result && <div className="space-y-1 text-xs text-text-secondary">
        <p>Starting estimate: {money(result.startingBalance)} ({result.startingSource === 'bank_available' ? 'recently retrieved bank available' : 'pending-inclusive ledger'})</p>
        <p>Projected ending balance: {money(result.endingBalance)} · Lowest projected balance: {money(result.minimumBalance)}</p>
        <p>Conservative amount after scheduled expenses and reserve: {money(result.safeToSpendNow)}</p>
        <p>Included scheduled occurrences: {result.scheduledOccurrenceCount} · Through {result.through}</p>
        {result.timeline.map((event) => <p key={event.id}>{event.date}: {money(event.amount)} · projected {money(event.projectedBalance)}</p>)}
        <p className="text-text-tertiary">{result.disclaimer}</p>
        {result.caveats.map((caveat) => <p key={caveat} className="text-text-tertiary">{caveat}</p>)}
        {!result.hasScheduledEvents && <p role="status">No pending scheduled occurrences were found. This is not evidence that no bills are due.</p>}
      </div>}
    </div>
  );
}
