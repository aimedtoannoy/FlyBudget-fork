import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertCircle, CalendarClock, HandCoins, Plus, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import { useCanSave } from '../../hooks/useConnection';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import {
  centsToInput,
  formatCurrency,
  isUnreadableAmount,
  parseCents,
} from '../../utils/currency';
import * as io from './api';
import type {
  DepositCandidate,
  LoanInput,
  LoanRepayment,
  PersonalLoan,
  RepaymentInput,
  LoanMode,
  LoanCadence,
} from './api';

const field =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-brand-600';
const label = 'grid gap-1 text-sm font-medium text-text-secondary';
const today = () => format(new Date(), 'yyyy-MM-dd');

function LoanForm({
  loan,
  onCancel,
  onSubmit,
  saving,
  error,
}: {
  loan?: PersonalLoan;
  onCancel: () => void;
  onSubmit: (body: LoanInput) => void;
  saving: boolean;
  error: string | null;
}) {
  const canSave = useCanSave();
  const [borrower, setBorrower] = useState(loan?.borrower ?? '');
  const [principal, setPrincipal] = useState(centsToInput(loan?.principal ?? 0));
  const [lentOn, setLentOn] = useState(loan?.lentOn ?? today());
  const [repaymentMode, setRepaymentMode] = useState<LoanMode>(
    loan?.repaymentMode ?? 'open',
  );
  const [firstDueOn, setFirstDueOn] = useState(loan?.firstDueOn ?? today());
  const [cadence, setCadence] = useState<LoanCadence>(loan?.cadence ?? 'monthly');
  const [installment, setInstallment] = useState(
    centsToInput(loan?.installmentAmount ?? 0),
  );
  const [remindersEnabled, setRemindersEnabled] = useState(
    Boolean(loan?.remindersEnabled),
  );
  const [notes, setNotes] = useState(loan?.notes ?? '');
  const [invalid, setInvalid] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (isUnreadableAmount(principal) ||
      (repaymentMode === 'installments' && isUnreadableAmount(installment))) {
      setInvalid('Enter a valid amount.');
      return;
    }
    const principalAmount = parseCents(principal);
    const installmentAmount = repaymentMode === 'installments' ? parseCents(installment) : null;
    if (principalAmount <= 0 || !Number.isSafeInteger(principalAmount) ||
      (repaymentMode === 'installments' && (!installmentAmount || installmentAmount <= 0))) {
      setInvalid('Amounts must be greater than zero.');
      return;
    }
    setInvalid('');
    onSubmit({
      borrower: borrower.trim(),
      principal: principalAmount,
      lentOn,
      repaymentMode,
      firstDueOn: repaymentMode === 'open' ? null : firstDueOn,
      cadence: repaymentMode === 'installments' ? cadence : null,
      installmentAmount,
      remindersEnabled: repaymentMode === 'open' ? 0 : Number(remindersEnabled),
      notes: notes.trim() || null,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className={label}>
        Borrower
        <input
          className={field}
          value={borrower}
          maxLength={200}
          onChange={(event) => setBorrower(event.target.value)}
          placeholder="Who borrowed the money?"
          required
        />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={label}>
          Amount originally lent
          <input
            className={field}
            value={principal}
            onChange={(event) => setPrincipal(event.target.value)}
            inputMode="decimal"
            aria-label="Loan amount"
            required
          />
        </label>
        <label className={label}>
          Date lent
          <input
            type="date"
            className={field}
            value={lentOn}
            onChange={(event) => setLentOn(event.target.value)}
            required
          />
        </label>
      </div>
      <label className={label}>
        Repayment arrangement
        <select
          className={field}
          value={repaymentMode}
          onChange={(event) => setRepaymentMode(event.target.value as LoanMode)}
        >
          <option value="open">Open-ended — no due date</option>
          <option value="once">One payment — fixed due date</option>
          <option value="installments">Installments — recurring payments</option>
        </select>
      </label>
      {repaymentMode !== 'open' && (
        <div className="space-y-3 rounded-lg bg-surface-alt p-3">
          <label className={label}>
            {repaymentMode === 'once' ? 'Due date' : 'First repayment due'}
            <input
              type="date"
              className={field}
              value={firstDueOn}
              min={lentOn}
              onChange={(event) => setFirstDueOn(event.target.value)}
              required
            />
          </label>
          {repaymentMode === 'installments' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={label}>
                Frequency
                <select
                  className={field}
                  value={cadence}
                  onChange={(event) => setCadence(event.target.value as LoanCadence)}
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
              <label className={label}>
                Payment per installment
                <input
                  className={field}
                  inputMode="decimal"
                  value={installment}
                  onChange={(event) => setInstallment(event.target.value)}
                  required
                  aria-label="Installment amount"
                />
              </label>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={remindersEnabled}
              onChange={(event) => setRemindersEnabled(event.target.checked)}
            />
            Show due-soon and overdue reminders inside FlyBudget
          </label>
        </div>
      )}
      <label className={label}>
        Notes or agreement details (optional)
        <textarea
          className={field}
          value={notes}
          maxLength={5000}
          rows={3}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="What was agreed? Reference numbers, payment expectations..."
        />
      </label>
      <p className="text-xs text-text-tertiary">
        This IOU record will not move money or alter your bank accounts. Add any real
        transfer or payment through your normal bank transaction records.
      </p>
      {(invalid || error) && <p role="alert" className="text-sm text-negative">{invalid || error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={!canSave || saving}>
          {saving ? 'Saving…' : loan ? 'Save changes' : 'Create loan'}
        </Button>
      </div>
    </form>
  );
}

function PaymentForm({
  loan,
  close,
  submitPayment,
  saving,
  error,
}: {
  loan: PersonalLoan;
  close: () => void;
  submitPayment: (body: RepaymentInput) => void;
  saving: boolean;
  error: string | null;
}) {
  const canSave = useCanSave();
  const [source, setSource] = useState<'manual' | 'deposit'>('manual');
  const [amount, setAmount] = useState(centsToInput(loan.outstanding));
  const [paidOn, setPaidOn] = useState(today());
  const [notes, setNotes] = useState('');
  const [depositId, setDepositId] = useState('');
  const [invalid, setInvalid] = useState('');
  const { data: deposits = [], isLoading } = useQuery({
    queryKey: ['personal-loan-deposits', loan.id],
    queryFn: () => io.depositsForLoan(loan.id),
    enabled: source === 'deposit',
  });
  const deposit = deposits.find((d) => d.id === depositId);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (source === 'deposit') {
      if (!deposit) return setInvalid('Select a posted deposit.');
      submitPayment({
        paidOn: deposit.date,
        amount: deposit.amount,
        transactionId: deposit.id,
        notes: notes.trim() || null,
      });
      return;
    }
    if (isUnreadableAmount(amount)) return setInvalid('Enter a valid amount.');
    const cents = parseCents(amount);
    if (cents <= 0 || cents > loan.outstanding || !Number.isSafeInteger(cents)) {
      return setInvalid('Enter a positive amount no greater than the outstanding balance.');
    }
    submitPayment({ amount: cents, paidOn, transactionId: null, notes: notes.trim() || null });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-text-secondary">
        Outstanding: <strong className="text-text">{formatCurrency(loan.outstanding)}</strong>
      </p>
      <label className={label}>
        Payment source
        <select
          value={source}
          className={field}
          onChange={(event) => {
            setSource(event.target.value as 'manual' | 'deposit');
            setDepositId('');
            setInvalid('');
          }}
        >
          <option value="manual">Manual / cash repayment</option>
          <option value="deposit">Link existing posted bank deposit</option>
        </select>
      </label>
      {source === 'manual' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Amount received
            <input
              className={field}
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </label>
          <label className={label}>
            Date received
            <input
              className={field}
              type="date"
              min={loan.lentOn}
              value={paidOn}
              onChange={(event) => setPaidOn(event.target.value)}
              required
            />
          </label>
        </div>
      ) : (
        <label className={label}>
          Choose the matching posted deposit
          <select
            className={field}
            value={depositId}
            onChange={(event) => setDepositId(event.target.value)}
            required
          >
            <option value="">Select a deposit…</option>
            {deposits.map((d: DepositCandidate) => (
              <option key={d.id} value={d.id}>
                {d.date} · {d.payeeName || 'Deposit'} · {formatCurrency(d.amount)}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-text-tertiary">
            {isLoading
              ? 'Loading recent posted deposits…'
              : 'Only unlinked posted inflows from the last 180 days are shown. Linking is a reference, not a new bank transaction.'}
          </span>
        </label>
      )}
      <label className={label}>
        Notes (optional)
        <textarea
          className={field}
          rows={2}
          value={notes}
          maxLength={5000}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      {(invalid || error) && <p role="alert" className="text-sm text-negative">{invalid || error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>Cancel</Button>
        <Button disabled={!canSave || saving} type="submit">
          {saving ? 'Saving…' : 'Record repayment'}
        </Button>
      </div>
    </form>
  );
}

function LoanItem({
  loan,
  onEdit,
  onRepay,
  onDelete,
  onDeletePayment,
}: {
  loan: PersonalLoan;
  onEdit: () => void;
  onRepay: () => void;
  onDelete: () => void;
  onDeletePayment: (payment: LoanRepayment) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const state =
    loan.status === 'repaid'
      ? 'text-positive'
      : loan.status === 'overdue'
        ? 'text-negative'
        : 'text-text-secondary';
  return (
    <section className="rounded-lg border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-start gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-alt">
          <HandCoins size={20} className="text-text-secondary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-text">{loan.borrower}</h2>
          <div className={`mt-1 flex items-center gap-2 text-xs ${state}`}>
            {loan.status === 'repaid'
              ? <CheckCircle2 size={14} />
              : loan.status === 'overdue'
                ? <AlertCircle size={14} />
                : <CalendarClock size={14} />}
            <span>
              {loan.status === 'repaid'
                ? 'Fully repaid'
                : loan.status === 'overdue'
                  ? `${formatCurrency(loan.overdueAmount)} overdue`
                  : loan.repaymentMode === 'open'
                    ? 'Open-ended — no deadline'
                    : loan.nextDueOn
                      ? `Next unpaid due: ${loan.nextDueOn}`
                      : 'Scheduled'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums text-text">
            {formatCurrency(loan.outstanding)}
          </div>
          <div className="text-xs text-text-tertiary">still owed</div>
        </div>
      </div>
      <div className="border-t border-border-light px-4 py-3">
        <div className="flex justify-between text-xs text-text-tertiary">
          <span>Originally {formatCurrency(loan.principal)} · {loan.lentOn}</span>
          <span>{formatCurrency(loan.repaid)} received</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-alt">
          <div
            className="h-full rounded-full bg-brand-500"
            style={{ width: `${Math.min(100, (loan.repaid / loan.principal) * 100)}%` }}
          />
        </div>
        {loan.notes && (
          <p className="mt-3 whitespace-pre-wrap text-xs text-text-secondary">{loan.notes}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {loan.outstanding > 0 && (
            <Button size="sm" onClick={onRepay}>Record repayment</Button>
          )}
          <Button size="sm" variant="secondary" onClick={onEdit}>
            <Pencil size={13} /> Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowHistory(!showHistory)}
          >
            {showHistory ? 'Hide' : 'View'} payments ({loan.repayments.length})
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 size={13} /> Delete
          </Button>
        </div>
        {showHistory && (
          <div className="mt-3 divide-y divide-border-light border-t border-border-light">
            {loan.repayments.length === 0 ? (
              <p className="py-3 text-sm text-text-tertiary">No repayments recorded yet.</p>
            ) : (
              loan.repayments.map((payment) => (
                <div key={payment.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="text-text-secondary">{payment.paidOn}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-text-tertiary">
                    {payment.transactionId ? 'Linked bank deposit' : 'Manual'}
                    {payment.notes ? ` · ${payment.notes}` : ''}
                  </span>
                  <span className="font-medium tabular-nums text-text">
                    {formatCurrency(payment.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeletePayment(payment)}
                    aria-label={`Remove repayment from ${payment.paidOn}`}
                    className="rounded p-2 text-text-tertiary hover:text-negative"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default function PersonalLoansPage() {
  const qc = useQueryClient();
  const { data: loans = [], isLoading, error: loadError } = useQuery({
    queryKey: ['personal-loans'],
    queryFn: io.listLoans,
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['personal-loans'] });
    qc.invalidateQueries({ queryKey: ['personal-loan-deposits'] });
  };
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PersonalLoan | null>(null);
  const [repaying, setRepaying] = useState<PersonalLoan | null>(null);
  const [deleting, setDeleting] = useState<PersonalLoan | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<{
    loan: PersonalLoan;
    payment: LoanRepayment;
  } | null>(null);
  const create = useMutation({
    mutationFn: io.createLoan,
    onSuccess: () => { invalidate(); setCreating(false); },
  });
  const edit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: LoanInput }) => io.editLoan(id, body),
    onSuccess: () => { invalidate(); setEditing(null); },
  });
  const repay = useMutation({
    mutationFn: ({ id, body }: { id: string; body: RepaymentInput }) => io.repayLoan(id, body),
    onSuccess: () => { invalidate(); setRepaying(null); },
  });
  const remove = useMutation({
    mutationFn: io.deleteLoan,
    onSuccess: () => { invalidate(); setDeleting(null); },
  });
  const removePayment = useMutation({
    mutationFn: ({ id, paymentId }: { id: string; paymentId: string }) =>
      io.deleteRepayment(id, paymentId),
    onSuccess: () => { invalidate(); setDeletingPayment(null); },
  });

  const outstanding = loans.reduce((sum, x) => sum + x.outstanding, 0);
  const repaid = loans.reduce((sum, x) => sum + x.repaid, 0);
  const due = loans.filter((x) => x.reminder && x.status !== 'repaid');

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-text">Money Lent</h1>
          <p className="text-xs text-text-secondary">Personal loans and IOUs</p>
        </div>
        <Button size="sm" onClick={() => { create.reset(); setCreating(true); }}>
          <Plus size={15} /> Add loan
        </Button>
      </header>
      <main className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-surface-alt p-4">
            <div className="text-xs text-text-secondary">Total still owed</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-text">
              {formatCurrency(outstanding)}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface-alt p-4">
            <div className="text-xs text-text-secondary">Repayments recorded</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-text">
              {formatCurrency(repaid)}
            </div>
          </div>
        </div>
        {due.length > 0 && (
          <div role="status" className="flex items-start gap-2 rounded-lg border border-border bg-surface-alt p-3 text-sm text-text">
            <CalendarClock size={18} className="shrink-0 text-negative" />
            <div>
              <strong>{due.length} repayment reminder{due.length !== 1 ? 's' : ''}</strong>
              <p className="text-text-secondary">One or more scheduled repayments are due within seven days or overdue.</p>
            </div>
          </div>
        )}
        <p className="text-xs text-text-tertiary">
          IOU balances are tracked separately and are not automatically added to net worth or
          cash available to budget. Bank deposits are linked only when you explicitly select one.
        </p>
        {loadError && <p role="alert" className="text-sm text-negative">{loadError.message}</p>}
        {isLoading ? (
          <p className="text-sm text-text-secondary">Loading loans…</p>
        ) : loans.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <HandCoins size={30} className="mx-auto text-text-tertiary" />
            <h2 className="mt-3 font-medium text-text">No money lent recorded yet</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Track open-ended IOUs, payment plans, and partial repayments in one place.
            </p>
            <div className="mt-4">
              <Button onClick={() => { create.reset(); setCreating(true); }}>
                <Plus size={15} /> Add your first loan
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {loans.map((loan) => (
              <LoanItem
                key={loan.id}
                loan={loan}
                onEdit={() => { edit.reset(); setEditing(loan); }}
                onRepay={() => { repay.reset(); setRepaying(loan); }}
                onDelete={() => setDeleting(loan)}
                onDeletePayment={(payment) => setDeletingPayment({ loan, payment })}
              />
            ))}
          </div>
        )}
      </main>
      {creating && (
        <Modal isOpen onClose={() => setCreating(false)} title="Add money lent" size="lg">
          <LoanForm
            onCancel={() => setCreating(false)}
            onSubmit={(body) => create.mutate(body)}
            saving={create.isPending}
            error={create.error?.message ?? null}
          />
        </Modal>
      )}
      {editing && (
        <Modal isOpen onClose={() => setEditing(null)} title="Edit loan" size="lg">
          <LoanForm
            key={editing.id}
            loan={editing}
            onCancel={() => setEditing(null)}
            onSubmit={(body) => edit.mutate({ id: editing.id, body })}
            saving={edit.isPending}
            error={edit.error?.message ?? null}
          />
        </Modal>
      )}
      {repaying && (
        <Modal isOpen onClose={() => setRepaying(null)} title={`Repayment from ${repaying.borrower}`} size="lg">
          <PaymentForm
            key={repaying.id}
            loan={repaying}
            close={() => setRepaying(null)}
            submitPayment={(body) => repay.mutate({ id: repaying.id, body })}
            saving={repay.isPending}
            error={repay.error?.message ?? null}
          />
        </Modal>
      )}
      <ConfirmModal
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete loan?"
        message="This permanently deletes the IOU and its repayment history. Bank transactions will remain unchanged."
        danger
        confirmLabel="Delete loan"
        onConfirm={() => { if (deleting) remove.mutate(deleting.id); }}
      />
      <ConfirmModal
        isOpen={deletingPayment !== null}
        onClose={() => setDeletingPayment(null)}
        title="Remove repayment?"
        message="The remaining IOU balance will increase. An already linked bank transaction will not be deleted."
        danger
        confirmLabel="Remove repayment"
        onConfirm={() => {
          if (deletingPayment) {
            removePayment.mutate({
              id: deletingPayment.loan.id,
              paymentId: deletingPayment.payment.id,
            });
          }
        }}
      />
      {(remove.error || removePayment.error) && (
        <p role="alert" className="px-6 py-2 text-sm text-negative">
          {(remove.error || removePayment.error)?.message}
        </p>
      )}
    </div>
  );
}
