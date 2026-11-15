import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Button } from '../../components/ui/Button';
import { useCanSave } from '../../hooks/useConnection';
import { centsToInput, formatCurrency, isUnreadableAmount, parseCents } from '../../utils/currency';
import * as api from './api';
import type {
  BorrowerProfile, LoanAdvanceInput, LoanCadence, LoanCreditInput, LoanInput, LoanMode,
  PersonalLoan, RepaymentInput,
} from './api';

const today = () => format(new Date(), 'yyyy-MM-dd');
export const field = 'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-brand-600';
export const label = 'grid gap-1 text-sm font-medium text-text-secondary';

function Actions({ onCancel, busy, saveLabel }: { onCancel: () => void; busy: boolean; saveLabel: string }) {
  const canSave = useCanSave();
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      <Button type="submit" disabled={!canSave || busy}>{busy ? 'Saving…' : saveLabel}</Button>
    </div>
  );
}

export function ProfileForm({
  profile, onCancel, onSubmit, busy, error,
}: {
  profile?: BorrowerProfile;
  onCancel: () => void;
  onSubmit: (value: { name: string; notes: string | null }) => void;
  busy: boolean;
  error?: string | null;
}) {
  const [name, setName] = useState(profile?.name ?? '');
  const [notes, setNotes] = useState(profile?.notes ?? '');
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      if (name.trim()) onSubmit({ name: name.trim(), notes: notes.trim() || null });
    }} className="space-y-4">
      <label className={label}>
        Person / profile name
        <input className={field} value={name} maxLength={200} required
          onChange={(e) => setName(e.target.value)} placeholder="Who do you lend money to?" />
      </label>
      <label className={label}>
        Notes about this person (optional)
        <textarea className={field} rows={3} value={notes} maxLength={5000}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Contact details, agreed terms or other notes" />
      </label>
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      <Actions onCancel={onCancel} busy={busy}
        saveLabel={profile ? 'Save profile' : 'Create profile'} />
    </form>
  );
}

export function LoanForm({
  loan, profile, profiles, onCancel, onSubmit, busy, error,
}: {
  loan?: PersonalLoan;
  profile: BorrowerProfile;
  profiles: BorrowerProfile[];
  onCancel: () => void;
  onSubmit: (value: LoanInput) => void;
  busy: boolean;
  error?: string | null;
}) {
  const [profileId, setProfileId] = useState(loan?.profileId ?? profile.id);
  const [title, setTitle] = useState(loan?.title ?? '');
  const [principal, setPrincipal] = useState(centsToInput(loan?.principal ?? 0));
  const [lentOn, setLentOn] = useState(loan?.lentOn ?? today());
  const [repaymentMode, setRepaymentMode] = useState<LoanMode>(loan?.repaymentMode ?? 'open');
  const [firstDueOn, setFirstDueOn] = useState(loan?.firstDueOn ?? today());
  const [cadence, setCadence] = useState<LoanCadence>(loan?.cadence ?? 'monthly');
  const [installment, setInstallment] = useState(centsToInput(loan?.installmentAmount ?? 0));
  const [reminders, setReminders] = useState(Boolean(loan?.remindersEnabled));
  const [notes, setNotes] = useState(loan?.notes ?? '');
  const [invalid, setInvalid] = useState('');
  const selected = profiles.find((p) => p.id === profileId);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return setInvalid('Select a person.');
    if (isUnreadableAmount(principal) ||
      (repaymentMode === 'installments' && isUnreadableAmount(installment))) {
      return setInvalid('Enter valid amounts.');
    }
    const base = parseCents(principal);
    const each = repaymentMode === 'installments' ? parseCents(installment) : null;
    if (base <= 0 || !Number.isSafeInteger(base) ||
      (repaymentMode === 'installments' && (!each || each <= 0))) {
      return setInvalid('Loan and installment amounts must be positive.');
    }
    onSubmit({
      borrower: selected.name, profileId: selected.id,
      title: title.trim() || `Loan · ${lentOn}`,
      principal: base, lentOn, repaymentMode,
      firstDueOn: repaymentMode === 'open' ? null : firstDueOn,
      cadence: repaymentMode === 'installments' ? cadence : null,
      installmentAmount: each,
      remindersEnabled: repaymentMode === 'open' ? 0 : Number(reminders),
      notes: notes.trim() || null,
    });
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className={label}>
        Person
        <select className={field} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
          {profiles.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}
        </select>
        {loan && (
          <span className="text-xs font-normal text-text-tertiary">
            To transfer this existing loan to a different person's profile,
            select the person here and save. All previous repayments, extra credit,
            bank links and the original loan ID are preserved.
          </span>
        )}
      </label>
      <label className={label}>
        Loan name / purpose
        <input className={field} value={title} maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="For example: Truck repair, November loan" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Originally lent
          <input className={field} inputMode="decimal" value={principal} required
            onChange={(e) => setPrincipal(e.target.value)} />
        </label>
        <label className={label}>
          Date lent
          <input className={field} type="date" value={lentOn} required
            onChange={(e) => setLentOn(e.target.value)} />
        </label>
      </div>
      <label className={label}>
        Repayment arrangement
        <select className={field} value={repaymentMode}
          onChange={(e) => setRepaymentMode(e.target.value as LoanMode)}>
          <option value="open">Open-ended (no deadline)</option>
          <option value="once">Single due date</option>
          <option value="installments">Recurring installments</option>
        </select>
      </label>
      {repaymentMode !== 'open' && (
        <div className="space-y-3 rounded-lg bg-surface-alt p-3">
          <label className={label}>
            {repaymentMode === 'once' ? 'Due date' : 'First due date'}
            <input className={field} type="date" min={lentOn} value={firstDueOn} required
              onChange={(e) => setFirstDueOn(e.target.value)} />
          </label>
          {repaymentMode === 'installments' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>
                Frequency
                <select className={field} value={cadence}
                  onChange={(e) => setCadence(e.target.value as LoanCadence)}>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
              <label className={label}>
                Amount per payment
                <input className={field} inputMode="decimal" value={installment} required
                  onChange={(e) => setInstallment(e.target.value)} />
              </label>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" checked={reminders} onChange={(e) => setReminders(e.target.checked)} />
            Show due and overdue notices in Money Lent
          </label>
        </div>
      )}
      <label className={label}>
        Loan notes
        <textarea className={field} rows={2} maxLength={5000} value={notes}
          onChange={(e) => setNotes(e.target.value)} />
      </label>
      <p className="text-xs text-text-tertiary">
        This records an IOU only. Additional lending and repayments go into their own history.
        No bank balances or transactions change automatically.
      </p>
      {(invalid || error) && <p role="alert" className="text-sm text-negative">{invalid || error}</p>}
      <Actions busy={busy} onCancel={onCancel} saveLabel={loan ? 'Save loan' : 'Add loan'} />
    </form>
  );
}

export function EventForm({
  loan, kind, onCancel, onSubmit, busy, error,
}: {
  loan: PersonalLoan;
  kind: 'advance' | 'repayment';
  onCancel: () => void;
  onSubmit: (body: LoanAdvanceInput | RepaymentInput) => void;
  busy: boolean;
  error?: string | null;
}) {
  const isAdvance = kind === 'advance';
  const [method, setMethod] = useState<'manual' | 'bank'>('manual');
  const [search, setSearch] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [amount, setAmount] = useState(centsToInput(isAdvance ? 0 : loan.outstanding));
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [invalid, setInvalid] = useState('');
  const { data: candidates = [] } = useQuery({
    queryKey: ['loan-bank-candidates', loan.id, kind, search],
    queryFn: () => isAdvance ? api.loanOutflows(loan.id, search) : api.depositsForLoan(loan.id, search),
    enabled: method === 'bank',
  });
  const selected = candidates.find((c) => c.id === transactionId);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (method === 'bank' && !selected) return setInvalid('Select a posted bank transaction.');
    if (method === 'manual' && isUnreadableAmount(amount)) return setInvalid('Enter a valid amount.');
    const cents = method === 'bank' ? selected!.amount : parseCents(amount);
    const when = method === 'bank' ? selected!.date : date;
    if (!Number.isSafeInteger(cents) || cents <= 0 ||
      (!isAdvance && cents > loan.outstanding)) {
      return setInvalid('Enter an amount greater than zero and within the remaining loan balance.');
    }
    const common = { amount: cents, notes: notes.trim() || null, transactionId: method === 'bank' ? selected!.id : null };
    onSubmit(isAdvance ? { ...common, advancedOn: when } : { ...common, paidOn: when });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-text-secondary">
        {isAdvance ? 'Additional money you lend increases the amount owed on this loan.' :
          `Currently owed: ${formatCurrency(loan.outstanding)}`}
      </p>
      <label className={label}>
        Source
        <select className={field} value={method}
          onChange={(e) => { setMethod(e.target.value as 'manual' | 'bank'); setTransactionId(''); }}>
          <option value="manual">Record manually / cash</option>
          <option value="bank">{isAdvance ? 'Link posted bank outflow' : 'Link posted bank deposit'}</option>
        </select>
      </label>
      {method === 'manual' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Amount
            <input className={field} value={amount} required inputMode="decimal"
              onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className={label}>
            Date
            <input className={field} type="date" min={loan.lentOn} required value={date}
              onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
      ) : (
        <div className="space-y-2">
          <label className={label}>
            Search posted transactions
            <input className={field} value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Merchant, date, amount or account" />
          </label>
          <label className={label}>
            Bank transaction
            <select className={field} value={transactionId} required
              onChange={(e) => setTransactionId(e.target.value)}>
              <option value="">Select a posted transaction</option>
              {candidates.map((tx) => (
                <option key={tx.id} value={tx.id}>
                  {tx.date} · {tx.payeeName || tx.accountName || 'Transaction'} · {formatCurrency(tx.amount)}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-text-tertiary">
            The date and amount must match the posted transaction. This creates only a
            reference, not a duplicate bank entry.
          </p>
        </div>
      )}
      <label className={label}>
        Notes
        <textarea className={field} rows={2} maxLength={5000}
          value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {(invalid || error) && <p role="alert" className="text-sm text-negative">{invalid || error}</p>}
      <Actions busy={busy} onCancel={onCancel}
        saveLabel={isAdvance ? 'Add to loan' : 'Record repayment'} />
    </form>
  );
}

export function OriginalOutflowForm({
  loan, close, onLink, busy, error,
}: {
  loan: PersonalLoan;
  close: () => void;
  onLink: (id: string | null) => void;
  busy: boolean;
  error?: string | null;
}) {
  const canSave = useCanSave();
  const [search, setSearch] = useState('');
  const [transactionId, setTransactionId] = useState(loan.disbursementTransactionId ?? '');
  const { data: options = [] } = useQuery({
    queryKey: ['loan-original-outflows', loan.id, search],
    queryFn: () => api.loanOutflows(loan.id, search),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onLink(transactionId || null); }}
      className="space-y-3">
      <p className="text-xs text-text-secondary">
        Link the original {formatCurrency(loan.principal)} you lent to an existing
        posted bank outflow. No transactions will be changed or created.
      </p>
      <label className={label}>Search<input className={field} value={search}
        onChange={(e) => setSearch(e.target.value)} /></label>
      <label className={label}>
        Original bank outflow
        <select className={field} value={transactionId}
          onChange={(e) => setTransactionId(e.target.value)}>
          <option value="">No linked transaction</option>
          {options.filter((o) => o.amount === loan.principal).map((o) => (
            <option value={o.id} key={o.id}>
              {o.date} · {o.payeeName || o.accountName || 'Outflow'} · {formatCurrency(o.amount)}
            </option>
          ))}
          {loan.disbursementTransactionId && !options.some((o) => o.id === loan.disbursementTransactionId) &&
            <option value={loan.disbursementTransactionId}>Currently linked (unchanged)</option>}
        </select>
      </label>
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>Cancel</Button>
        <Button type="submit" disabled={!canSave || busy}>{busy ? 'Saving…' : 'Save link'}</Button>
      </div>
    </form>
  );
}

// A non-cash credit is never associated with a posted bank transaction.
export function ApplyCreditForm({
  loan, onCancel, onSubmit, busy, error,
}: {
  loan: PersonalLoan;
  onCancel: () => void;
  onSubmit: (body: LoanCreditInput) => void;
  busy: boolean;
  error?: string | null;
}) {
  const [amount, setAmount] = useState('');
  const [appliedOn, setAppliedOn] = useState(today());
  const [notes, setNotes] = useState('');
  const [invalid, setInvalid] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    if (isUnreadableAmount(amount)) return setInvalid('Enter a valid credit amount.');
    const cents = parseCents(amount);
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > loan.outstanding) {
      return setInvalid('Credit must be positive and cannot exceed the amount currently owed.');
    }
    setInvalid('');
    onSubmit({ amount: cents, appliedOn, notes: notes.trim() || null });
  }
  return (
    <form className="space-y-4" onSubmit={submit}>
      <p className="text-sm text-text-secondary">
        An applied credit reduces what this person owes, without recording a cash payment
        or adding new money to the loan. Outstanding: {formatCurrency(loan.outstanding)}.
      </p>
      <label className={label}>
        Credit amount
        <input className={field} inputMode="decimal" value={amount}
          onChange={(e) => setAmount(e.target.value)} required placeholder="0.00" />
      </label>
      <label className={label}>
        Date applied
        <input className={field} type="date" value={appliedOn} min={loan.lentOn}
          onChange={(e) => setAppliedOn(e.target.value)} required />
      </label>
      <label className={label}>
        Reason / notes (optional)
        <textarea className={field} rows={3} maxLength={5000} value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Forgiven amount, substitution, discount, adjustment…" />
      </label>
      {(invalid || error) && <p role="alert" className="text-sm text-negative">{invalid || error}</p>}
      <Actions onCancel={onCancel} busy={busy} saveLabel="Apply credit" />
    </form>
  );
}
