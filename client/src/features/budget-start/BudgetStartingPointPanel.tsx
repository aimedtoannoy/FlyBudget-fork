import { useEffect, useState, type FormEvent } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarRange, ChevronDown, ChevronUp } from 'lucide-react';
import { useBudgetStartingPoint, useSaveBudgetStartingPoint } from '../../hooks/useBudget';
import { useCanSave } from '../../hooks/useConnection';
import { centsToInput, formatCurrency, isUnreadableAmount, parseCents } from '../../utils/currency';

/** User-entered starting balance for the *budget*, not any connected bank account. */
export function BudgetStartingPointPanel({ selectedMonth }: { selectedMonth: string }) {
  const { data: point } = useBudgetStartingPoint();
  const save = useSaveBudgetStartingPoint();
  const canSave = useCanSave();
  const [expanded, setExpanded] = useState(false);
  const [month, setMonth] = useState(selectedMonth);
  const [opening, setOpening] = useState('0.00');
  const [error, setError] = useState('');

  useEffect(() => {
    setMonth(point?.startMonth ?? selectedMonth);
    setOpening(centsToInput(point?.openingFunds ?? 0));
    setError('');
  }, [point?.startMonth, point?.openingFunds, selectedMonth]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      setError('Choose a valid starting month.');
      return;
    }
    if (isUnreadableAmount(opening)) {
      setError('Enter a valid opening amount.');
      return;
    }
    const openingFunds = parseCents(opening);
    if (!Number.isSafeInteger(openingFunds) || Math.abs(openingFunds) > 1e13) {
      setError('Opening funds are outside the allowed range.');
      return;
    }
    setError('');
    save.mutate(
      { startMonth: month, openingFunds },
      {
        onSuccess: () => setExpanded(false),
        onError: (reason) => setError(reason.message),
      },
    );
  }

  const beforeStart = !!point?.startMonth && selectedMonth < point.startMonth;

  return (
    <div className="mx-6 mt-3 shrink-0 rounded-lg border border-border-light bg-surface-alt">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-text"
      >
        <CalendarRange size={16} className="shrink-0 text-text-tertiary" />
        <span className="flex-1">
          <strong className="font-medium">Budget starting point:</strong>{' '}
          {point?.startMonth
            ? `${format(parseISO(`${point.startMonth}-01`), 'MMMM yyyy')} · ${formatCurrency(point.openingFunds)} opening funds`
            : 'Not set — historical income still carries forward'}
        </span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {beforeStart && !expanded && (
        <p className="px-4 pb-2 text-xs text-text-tertiary">
          This month is before your budget starting point. Its history does not roll forward.
        </p>
      )}

      {expanded && (
        <form onSubmit={submit} className="grid gap-3 border-t border-border-light px-4 py-3">
          <p className="text-xs text-text-secondary">
            Start your budget here without deleting older bank transactions or changing account
            balances. Enter only money genuinely unassigned as of the start of the month;
            income received during that month is counted separately.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm text-text">
              Starting month
              <input
                aria-label="Budget starting month"
                type="month"
                min="2000-01"
                max="2099-12"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="min-h-10 rounded-md border border-border bg-surface px-2 text-text"
                required
              />
            </label>
            <label className="grid gap-1 text-sm text-text">
              Unallocated opening funds
              <input
                aria-label="Unallocated opening funds"
                type="text"
                inputMode="decimal"
                value={opening}
                onChange={(event) => setOpening(event.target.value)}
                className="min-h-10 rounded-md border border-border bg-surface px-2 text-text"
                required
              />
            </label>
          </div>
          <p className="text-xs text-text-tertiary">
            This is not a bank balance adjustment. Funds already reserved for unpaid bills should
            be assigned to their budget categories so they are not treated as free spending money.
          </p>
          {(error || save.error) && (
            <p role="alert" className="text-xs text-negative">
              {error || save.error?.message}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!canSave || save.isPending}
              className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Save starting point
            </button>
            {point?.startMonth && (
              <button
                type="button"
                disabled={!canSave || save.isPending}
                onClick={() =>
                  save.mutate(
                    { startMonth: null, openingFunds: 0 },
                    {
                      onSuccess: () => setExpanded(false),
                      onError: (reason) => setError(reason.message),
                    },
                  )
                }
                className="rounded-md border border-border px-3 py-2 text-sm text-text-secondary disabled:opacity-50"
              >
                Disable starting point
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
