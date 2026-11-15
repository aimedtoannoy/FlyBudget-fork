import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle, ArrowLeft, CalendarClock, CheckCircle2,
  Pencil, Plus, Trash2, UserRound,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { formatCurrency } from '../../utils/currency';
import {
  ApplyCreditForm, EventForm, LoanForm, OriginalOutflowForm, ProfileForm,
} from './FinancialProfileForms';
import * as api from './api';
import type {
  BorrowerProfile, LoanAdvanceInput, LoanCreditInput, LoanInput, LoanRepayment,
  LoanAdvance, LoanCredit, PersonalLoan, RepaymentInput,
} from './api';

type EventEdit = { loan: PersonalLoan; kind: 'advance' | 'repayment' };
type DeleteTarget =
  | { kind: 'profile'; profile: BorrowerProfile }
  | { kind: 'loan'; loan: PersonalLoan }
  | { kind: 'advance'; loan: PersonalLoan; item: LoanAdvance }
  | { kind: 'credit'; loan: PersonalLoan; item: LoanCredit }
  | { kind: 'repayment'; loan: PersonalLoan; item: LoanRepayment };

function LoanCard({
  loan, onEdit, onAddToLoan, onApplyCredit, onPayment, onOriginal, onDelete, onDeleteAdvance, onDeleteCredit, onDeleteRepayment,
}: {
  loan: PersonalLoan;
  onEdit: () => void;
  onAddToLoan: () => void;
  onApplyCredit: () => void;
  onPayment: () => void;
  onOriginal: () => void;
  onDelete: () => void;
  onDeleteAdvance: (item: LoanAdvance) => void;
  onDeleteCredit: (item: LoanCredit) => void;
  onDeleteRepayment: (item: LoanRepayment) => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const progress = loan.totalPrincipal > 0
    ? Math.min(100, ((loan.repaid + loan.credited) / loan.totalPrincipal) * 100) : 0;
  return (
    <article className="rounded-lg border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-text">{loan.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <span>Issued {loan.lentOn}</span>
            <span>·</span>
            {(loan.status === 'repaid' || loan.status === 'settled') ? (
              <span className="inline-flex items-center gap-1 text-positive">
                <CheckCircle2 size={13} /> {loan.status === 'settled' ? 'Settled with credit' : 'Fully repaid'}
              </span>
            ) : loan.status === 'overdue' ? (
              <span className="inline-flex items-center gap-1 text-negative">
                <AlertCircle size={13} /> {formatCurrency(loan.overdueAmount)} overdue
              </span>
            ) : loan.repaymentMode === 'open' ? (
              <span>Open-ended</span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <CalendarClock size={13} /> Due {loan.nextDueOn || loan.firstDueOn || '—'}
              </span>
            )}
          </div>
          {loan.reminder && loan.status !== 'repaid' && (
            <p className="mt-1 text-xs text-negative">Repayment due soon or overdue</p>
          )}
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums text-text">
            {formatCurrency(loan.outstanding)}
          </div>
          <div className="text-xs text-text-tertiary">still owed</div>
        </div>
      </div>
      <div className="border-t border-border-light px-4 py-3">
        <div className="flex justify-between gap-3 text-xs text-text-secondary">
          <span>
            Original {formatCurrency(loan.principal)}
            {loan.advanced > 0 ? ` · Added to loan ${formatCurrency(loan.advanced)}` : ''}
          </span>
          <span>Received {formatCurrency(loan.repaid)}</span>
        </div>
        {loan.credited > 0 && (
          <div className="mt-1 text-xs text-text-secondary">
            Credit applied: {formatCurrency(loan.credited)} (not a repayment)
          </div>
        )}
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-alt">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} />
        </div>
        {loan.notes && (
          <p className="mt-3 whitespace-pre-wrap text-xs text-text-secondary">{loan.notes}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={onAddToLoan}>
            <Plus size={14} /> Add to loan
          </Button>
          {loan.outstanding > 0 && (
            <Button size="sm" variant="secondary" onClick={onApplyCredit}>
              Apply credit
            </Button>
          )}
          {loan.outstanding > 0 && (
            <Button size="sm" variant="secondary" onClick={onPayment}>Record repayment</Button>
          )}
          <Button size="sm" variant="secondary" onClick={onOriginal}>
            {loan.disbursementTransactionId ? 'Original transaction linked' : 'Link original transaction'}
          </Button>
          <Button size="sm" variant="secondary" onClick={onEdit}>
            <UserRound size={13} /> Edit / move loan
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(!historyOpen)}>
            {historyOpen ? 'Hide' : 'Show'} history
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 size={13} /> Delete
          </Button>
        </div>
        {historyOpen && (
          <div className="mt-4 space-y-3 border-t border-border-light pt-3">
            <h4 className="text-sm font-semibold text-text">Loan activity</h4>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-text-secondary">
              <span>{loan.lentOn} · Original amount lent</span>
              <span className="font-medium text-text">{formatCurrency(loan.principal)}</span>
            </div>
            {loan.advances.map((advance) => (
              <div className="flex items-center gap-2 text-sm" key={advance.id}>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-text">{advance.advancedOn} · Additional money lent</div>
                  <div className="text-xs text-text-tertiary">
                    {advance.transactionId ? 'Linked posted bank outflow' : 'Manual record'}
                    {advance.notes ? ` · ${advance.notes}` : ''}
                  </div>
                </div>
                <strong className="tabular-nums text-text">{formatCurrency(advance.amount)}</strong>
                <button type="button" onClick={() => onDeleteAdvance(advance)}
                  aria-label="Remove added money"
                  className="rounded p-2 text-text-tertiary hover:text-negative">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {loan.credits.map((credit) => (
              <div className="flex items-center gap-2 text-sm" key={credit.id}>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-text">{credit.appliedOn} · Applied credit</div>
                  <div className="text-xs text-text-tertiary">
                    Non-cash reduction{credit.notes ? ` · ${credit.notes}` : ''}
                  </div>
                </div>
                <strong className="tabular-nums text-text">
                  −{formatCurrency(credit.amount)}
                </strong>
                <button type="button" onClick={() => onDeleteCredit(credit)}
                  aria-label="Remove applied credit"
                  className="rounded p-2 text-text-tertiary hover:text-negative">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {loan.repayments.map((repayment) => (
              <div className="flex items-center gap-2 text-sm" key={repayment.id}>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-text">{repayment.paidOn} · Repayment</div>
                  <div className="text-xs text-text-tertiary">
                    {repayment.transactionId ? 'Linked posted bank deposit' : 'Manual record'}
                    {repayment.notes ? ` · ${repayment.notes}` : ''}
                  </div>
                </div>
                <strong className="tabular-nums text-text">−{formatCurrency(repayment.amount)}</strong>
                <button type="button" onClick={() => onDeleteRepayment(repayment)}
                  aria-label="Remove repayment"
                  className="rounded p-2 text-text-tertiary hover:text-negative">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {loan.advances.length === 0 && loan.credits.length === 0 && loan.repayments.length === 0 && (
              <p className="text-xs text-text-tertiary">No additional activity yet.</p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}


export default function BorrowerProfilePage() {
  const { profileId } = useParams<{ profileId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profiles = [], isLoading, error: profilesError } = useQuery({
    queryKey: ['borrower-profiles'],
    queryFn: api.listProfiles,
  });
  const { data: loans = [], error: loansError } = useQuery({
    queryKey: ['personal-loans'],
    queryFn: api.listLoans,
  });
  const current = profiles.find((p) => p.id === profileId);
  const shown = loans.filter((loan) => loan.profileId === profileId);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['personal-loans'] });
    qc.invalidateQueries({ queryKey: ['borrower-profiles'] });
    qc.invalidateQueries({ queryKey: ['loan-bank-candidates'] });
    qc.invalidateQueries({ queryKey: ['loan-original-outflows'] });
  };
  const [editingProfile, setEditingProfile] = useState(false);
  const [loanEditor, setLoanEditor] = useState<PersonalLoan | 'new' | null>(null);
  const [eventEditor, setEventEditor] = useState<EventEdit | null>(null);
  const [creditEditor, setCreditEditor] = useState<PersonalLoan | null>(null);
  const [originalEditor, setOriginalEditor] = useState<PersonalLoan | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [actionError, setActionError] = useState('');

  const editProfile = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name: string; notes: string | null } }) =>
      api.editProfile(id, body),
    onSuccess: () => { invalidate(); setEditingProfile(false); },
  });
  const createLoan = useMutation({
    mutationFn: api.createLoan,
    onSuccess: (loan) => {
      invalidate();
      setLoanEditor(null);
      if (loan.profileId !== profileId && loan.profileId) {
        navigate(`/money-lent/people/${loan.profileId}`);
      }
    },
  });
  const editLoan = useMutation({
    mutationFn: ({ id, body }: { id: string; body: LoanInput }) => api.editLoan(id, body),
    onSuccess: (loan) => {
      invalidate();
      setLoanEditor(null);
      if (loan.profileId !== profileId && loan.profileId) {
        navigate(`/money-lent/people/${loan.profileId}`);
      }
    },
  });
  const advance = useMutation({
    mutationFn: ({ id, body }: { id: string; body: LoanAdvanceInput }) => api.addAdvance(id, body),
    onSuccess: () => { invalidate(); setEventEditor(null); },
  });
  const repayment = useMutation({
    mutationFn: ({ id, body }: { id: string; body: RepaymentInput }) => api.repayLoan(id, body),
    onSuccess: () => { invalidate(); setEventEditor(null); },
  });
  const applyCredit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: LoanCreditInput }) =>
      api.applyLoanCredit(id, body),
    onSuccess: () => { invalidate(); setCreditEditor(null); },
  });
  const original = useMutation({
    mutationFn: ({ id, transactionId }: { id: string; transactionId: string | null }) =>
      api.linkDisbursement(id, transactionId),
    onSuccess: () => { invalidate(); setOriginalEditor(null); },
  });
  const remove = useMutation({
    mutationFn: async (target: DeleteTarget) => {
      if (target.kind === 'profile') return api.deleteProfile(target.profile.id);
      if (target.kind === 'loan') return api.deleteLoan(target.loan.id);
      if (target.kind === 'advance') return api.deleteAdvance(target.loan.id, target.item.id);
      if (target.kind === 'credit') return api.deleteLoanCredit(target.loan.id, target.item.id);
      return api.deleteRepayment(target.loan.id, target.item.id);
    },
    onSuccess: (_result, target) => {
      invalidate();
      setDeleting(null);
      setActionError('');
      if (target.kind === 'profile') navigate('/money-lent');
    },
    onError: (error) => setActionError(error.message),
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-text-secondary">Loading financial profile…</div>;
  }
  if (!current) {
    return (
      <div className="space-y-4 p-6">
        <Button size="sm" variant="secondary" onClick={() => navigate('/money-lent')}>
          <ArrowLeft size={15} /> Money Lent
        </Button>
        <p role="alert" className="text-sm text-negative">
          {profilesError?.message ?? 'This person’s financial profile could not be found.'}
        </p>
      </div>
    );
  }

  const owed = shown.reduce((sum, loan) => sum + loan.outstanding, 0);
  const received = shown.reduce((sum, loan) => sum + loan.repaid, 0);
  const forgiven = shown.reduce((sum, loan) => sum + loan.credited, 0);

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
        <button type="button" onClick={() => navigate('/money-lent')}
          className="mb-3 inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text">
          <ArrowLeft size={16} /> Back to Money Lent
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-text">{current.name}</h1>
            <p className="text-xs text-text-secondary">
              Financial profile · {shown.length} separate loan{shown.length === 1 ? '' : 's'}
            </p>
            {current.notes && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">{current.notes}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => { createLoan.reset(); setLoanEditor('new'); }}>
              <Plus size={15} /> New loan
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { editProfile.reset(); setEditingProfile(true); }}>
              <Pencil size={14} /> Edit person
            </Button>
            {shown.length === 0 && (
              <Button size="sm" variant="ghost"
                onClick={() => { setActionError(''); setDeleting({ kind: 'profile', profile: current }); }}>
                <Trash2 size={14} /> Delete
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface-alt p-3">
            <div className="text-xs text-text-secondary">Still owed</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-text">
              {formatCurrency(owed)}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface-alt p-3">
            <div className="text-xs text-text-secondary">Repayments received</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-text">
              {formatCurrency(received)}
            </div>
          </div>
          <div className="col-span-2 rounded-lg border border-border bg-surface-alt p-3 sm:col-span-1">
            <div className="text-xs text-text-secondary">Credits applied</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-text">
              {formatCurrency(forgiven)}
            </div>
          </div>
        </div>
        {loansError && <p role="alert" className="text-sm text-negative">{loansError.message}</p>}
        <section className="space-y-3" aria-label={`Loans for ${current.name}`}>
          <h2 className="text-sm font-semibold text-text">Loans</h2>
          {shown.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <UserRound size={28} className="mx-auto text-text-tertiary" />
              <p className="mt-2 text-sm text-text-secondary">No loans recorded for this person yet.</p>
              <div className="mt-3">
                <Button onClick={() => setLoanEditor('new')}>
                  <Plus size={14} /> Add first loan
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              {shown.map((loan) => (
                <LoanCard key={loan.id} loan={loan}
                  onEdit={() => { editLoan.reset(); setLoanEditor(loan); }}
                  onAddToLoan={() => { advance.reset(); setEventEditor({ loan, kind: 'advance' }); }}
                  onApplyCredit={() => { applyCredit.reset(); setCreditEditor(loan); }}
                  onPayment={() => { repayment.reset(); setEventEditor({ loan, kind: 'repayment' }); }}
                  onOriginal={() => { original.reset(); setOriginalEditor(loan); }}
                  onDelete={() => { setActionError(''); setDeleting({ kind: 'loan', loan }); }}
                  onDeleteAdvance={(item) => { setActionError(''); setDeleting({ kind: 'advance', loan, item }); }}
                  onDeleteCredit={(item) => { setActionError(''); setDeleting({ kind: 'credit', loan, item }); }}
                  onDeleteRepayment={(item) => { setActionError(''); setDeleting({ kind: 'repayment', loan, item }); }}
                />
              ))}
            </div>
          )}
        </section>
      </main>
      {editingProfile && (
        <Modal isOpen title="Edit financial profile" size="lg" onClose={() => setEditingProfile(false)}>
          <ProfileForm key={current.id} profile={current} busy={editProfile.isPending}
            error={editProfile.error?.message} onCancel={() => setEditingProfile(false)}
            onSubmit={(body) => editProfile.mutate({ id: current.id, body })} />
        </Modal>
      )}
      {loanEditor && (
        <Modal isOpen title={loanEditor === 'new' ? 'Add loan' : 'Edit / move loan to person'}
          onClose={() => setLoanEditor(null)} size="lg">
          <LoanForm key={loanEditor === 'new' ? 'new' : loanEditor.id}
            profile={current} profiles={profiles}
            loan={loanEditor === 'new' ? undefined : loanEditor}
            busy={createLoan.isPending || editLoan.isPending}
            error={(loanEditor === 'new' ? createLoan.error : editLoan.error)?.message}
            onCancel={() => setLoanEditor(null)}
            onSubmit={(body) => {
              if (loanEditor === 'new') createLoan.mutate(body);
              else editLoan.mutate({ id: loanEditor.id, body });
            }} />
        </Modal>
      )}
      {eventEditor && (
        <Modal isOpen title={eventEditor.kind === 'advance' ? 'Add to loan' : 'Record repayment'}
          onClose={() => setEventEditor(null)} size="lg">
          <EventForm key={`${eventEditor.loan.id}-${eventEditor.kind}`}
            loan={eventEditor.loan} kind={eventEditor.kind}
            busy={advance.isPending || repayment.isPending}
            error={(eventEditor.kind === 'advance' ? advance.error : repayment.error)?.message}
            onCancel={() => setEventEditor(null)}
            onSubmit={(body) => {
              if (eventEditor.kind === 'advance') {
                advance.mutate({ id: eventEditor.loan.id, body: body as LoanAdvanceInput });
              } else {
                repayment.mutate({ id: eventEditor.loan.id, body: body as RepaymentInput });
              }
            }} />
        </Modal>
      )}
      {creditEditor && (
        <Modal isOpen title="Apply credit" onClose={() => setCreditEditor(null)} size="lg">
          <ApplyCreditForm key={creditEditor.id} loan={creditEditor}
            busy={applyCredit.isPending} error={applyCredit.error?.message}
            onCancel={() => setCreditEditor(null)}
            onSubmit={(body) => applyCredit.mutate({ id: creditEditor.id, body })} />
        </Modal>
      )}
      {originalEditor && (
        <Modal isOpen title="Link original money lent" size="lg"
          onClose={() => setOriginalEditor(null)}>
          <OriginalOutflowForm loan={originalEditor} close={() => setOriginalEditor(null)}
            busy={original.isPending} error={original.error?.message}
            onLink={(transactionId) => original.mutate({ id: originalEditor.id, transactionId })} />
        </Modal>
      )}
      <ConfirmModal isOpen={deleting !== null}
        onClose={() => { setDeleting(null); setActionError(''); }}
        title="Remove recorded data?"
        message={
          deleting?.kind === 'profile'
            ? 'This removes the empty financial profile.'
            : deleting?.kind === 'loan'
              ? 'This deletes the loan and all added amounts, credits and repayments. Bank transactions remain unchanged.'
              : deleting?.kind === 'credit'
                ? 'This removes the applied credit and increases the amount owed. Bank transactions remain unchanged.'
                : 'This removes the selected IOU activity. Bank transactions remain unchanged.'
        }
        confirmLabel="Remove" danger
        onConfirm={() => { if (deleting) remove.mutate(deleting); }} />
      {actionError && <p role="alert" className="px-5 pb-3 text-sm text-negative">{actionError}</p>}
    </div>
  );
}
