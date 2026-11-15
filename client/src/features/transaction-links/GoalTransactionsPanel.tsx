import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { useCanSave } from '../../hooks/useConnection';
import { apiFetch } from '../../api/client';
import { centsToInput, formatCurrency, isUnreadableAmount, parseCents } from '../../utils/currency';
import type { Goal } from '../../types';

type Candidate = {
  id: string;
  date: string;
  accountId: string;
  accountName: string;
  payeeName: string | null;
  amount: number;
  availableAmount: number;
  isTransfer: boolean;
};

type GoalLink = {
  id: string;
  goalId: string;
  transactionId: string;
  appliedAmount: number;
  transaction: Candidate | null;
};

const field = 'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text';
const label = 'grid gap-1 text-sm font-medium text-text-secondary';

export function GoalTransactionsPanel({ goal }: { goal: Goal }) {
  const qc = useQueryClient();
  const canSave = useCanSave();
  const [search, setSearch] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [amount, setAmount] = useState('');
  const [invalid, setInvalid] = useState('');
  const { data: links = [] } = useQuery({
    queryKey: ['goal-links', goal.id],
    queryFn: () => apiFetch<GoalLink[]>(`/goals/${goal.id}/transactions`),
  });
  const { data: candidates = [], isFetching } = useQuery({
    queryKey: ['goal-bank-candidates', goal.id, search],
    queryFn: () => apiFetch<Candidate[]>(
      `/goals/${goal.id}/transactions/candidates?search=${encodeURIComponent(search)}`,
    ),
  });
  const selected = candidates.find((tx) => tx.id === transactionId);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['goals'] });
    qc.invalidateQueries({ queryKey: ['goal-links', goal.id] });
    qc.invalidateQueries({ queryKey: ['goal-bank-candidates', goal.id] });
  };
  const create = useMutation({
    mutationFn: (body: { transactionId: string; appliedAmount: number }) =>
      apiFetch(`/goals/${goal.id}/transactions`, {
        method: 'POST', body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidate();
      setTransactionId('');
      setAmount('');
      setInvalid('');
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/goals/${goal.id}/transactions/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return setInvalid('Select a transaction.');
    if (isUnreadableAmount(amount)) return setInvalid('Enter a valid contribution amount.');
    const absolute = parseCents(amount);
    if (!Number.isSafeInteger(absolute) || absolute <= 0 || absolute > selected.availableAmount) {
      return setInvalid('Enter an amount within the unassigned transaction balance.');
    }
    create.mutate({
      transactionId: selected.id,
      appliedAmount: Math.sign(selected.amount) * absolute,
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Record which posted transactions contribute to this goal. Incoming funds add to
        progress; outgoing funds reduce it. The amount saved manually is kept separate.
      </p>
      <div className="rounded-lg bg-surface-alt p-3 text-sm">
        <div className="flex justify-between text-text-secondary">
          <span>Manual starting amount</span>
          <span className="font-medium tabular-nums text-text">{formatCurrency(goal.currentAmount)}</span>
        </div>
        <div className="mt-1 flex justify-between text-text-secondary">
          <span>Linked transaction adjustments</span>
          <span className="font-medium tabular-nums text-text">
            {formatCurrency(goal.linkedAmount ?? 0)}
          </span>
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold text-text">
          <span>Tracked total</span>
          <span className="tabular-nums">
            {formatCurrency(goal.trackedAmount ?? goal.currentAmount)}
          </span>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <label className={label}>
          Search account transactions
          <input className={field} value={search} onChange={(e) => {
            setSearch(e.target.value); setTransactionId(''); setAmount('');
          }} placeholder="Payee, date, amount, account" />
        </label>
        <label className={label}>
          Posted transaction
          <select className={field} required value={transactionId}
            onChange={(e) => {
              const id = e.target.value;
              const found = candidates.find((tx) => tx.id === id);
              setTransactionId(id);
              setAmount(found ? centsToInput(found.availableAmount) : '');
            }}>
            <option value="">Choose a transaction…</option>
            {candidates.map((tx) => (
              <option value={tx.id} key={tx.id}>
                {tx.date} · {tx.payeeName || 'Transaction'} · {tx.accountName} ·
                {tx.amount > 0 ? '+' : '−'}{formatCurrency(Math.abs(tx.amount))}
                {tx.availableAmount < Math.abs(tx.amount) ? ' (partly allocated)' : ''}
              </option>
            ))}
          </select>
        </label>
        {isFetching && <p className="text-xs text-text-tertiary">Checking transactions…</p>}
        {selected && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={label}>
              Amount applied to this goal
              <input className={field} value={amount} required inputMode="decimal"
                onChange={(e) => setAmount(e.target.value)} />
            </label>
            <div className="flex items-end text-xs text-text-tertiary">
              {selected.amount > 0 ? 'Adds to' : 'Subtracts from'} this goal.
              Available: {formatCurrency(selected.availableAmount)}
            </div>
          </div>
        )}
        <p className="text-xs text-text-tertiary">
          Transfers can be assigned from the appropriate account side, but a goal cannot
          count both sides of the same transfer. All entries are references only.
        </p>
        {(invalid || create.error || remove.error) && (
          <p role="alert" className="text-sm text-negative">
            {invalid || create.error?.message || remove.error?.message}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={!canSave || create.isPending || !selected}>
            {create.isPending ? 'Linking…' : 'Link transaction'}
          </Button>
        </div>
      </form>
      <section className="space-y-2 border-t border-border pt-3">
        <h3 className="text-sm font-semibold text-text">Linked transactions ({links.length})</h3>
        {links.length === 0 ? (
          <p className="text-sm text-text-tertiary">No transactions linked to this goal yet.</p>
        ) : links.map((link) => (
          <div className="flex items-center gap-3 rounded-lg border border-border-light p-3" key={link.id}>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-text">
                {link.transaction?.payeeName || 'Recorded transaction'}
              </div>
              <div className="text-xs text-text-tertiary">
                {link.transaction?.date || 'Original transaction removed'} ·
                {link.transaction?.accountName || 'Account unavailable'}
              </div>
            </div>
            <div className="shrink-0 text-sm font-semibold tabular-nums text-text">
              {formatCurrency(link.appliedAmount)}
            </div>
            <Button size="sm" variant="ghost" disabled={!canSave || remove.isPending}
              onClick={() => remove.mutate(link.id)}>Unlink</Button>
          </div>
        ))}
      </section>
    </div>
  );
}
