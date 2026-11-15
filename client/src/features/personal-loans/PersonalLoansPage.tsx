import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CalendarClock, CheckCircle2, HandCoins, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { formatCurrency } from '../../utils/currency';
import { EventForm, LoanForm, OriginalOutflowForm, ProfileForm } from './FinancialProfileForms';
import * as api from './api';
import type {
  BorrowerProfile, LoanAdvanceInput, LoanInput, LoanRepayment,
  LoanAdvance, PersonalLoan, RepaymentInput,
} from './api';

type EventEdit = { loan: PersonalLoan; kind: 'advance' | 'repayment' };
type DeleteTarget =
  | { kind: 'profile'; profile: BorrowerProfile }
  | { kind: 'loan'; loan: PersonalLoan }
  | { kind: 'advance'; loan: PersonalLoan; item: LoanAdvance }
  | { kind: 'repayment'; loan: PersonalLoan; item: LoanRepayment };

function LoanCard({
  loan, onEdit, onCredit, onPayment, onOriginal, onDelete, onDeleteAdvance, onDeleteRepayment,
}: {
  loan: PersonalLoan;
  onEdit: () => void;
  onCredit: () => void;
  onPayment: () => void;
  onOriginal: () => void;
  onDelete: () => void;
  onDeleteAdvance: (item: LoanAdvance) => void;
  onDeleteRepayment: (item: LoanRepayment) => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const progress = loan.totalPrincipal > 0
    ? Math.min(100, (loan.repaid / loan.totalPrincipal) * 100) : 0;
  return (
    <article className="rounded-lg border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-text">{loan.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <span>Issued {loan.lentOn}</span>
            <span>·</span>
            {loan.status === 'repaid' ? (
              <span className="inline-flex items-center gap-1 text-positive">
                <CheckCircle2 size={13} /> Fully repaid
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
            {loan.advanced > 0 ? ` · Extra credit ${formatCurrency(loan.advanced)}` : ''}
          </span>
          <span>Received {formatCurrency(loan.repaid)}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-alt">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} />
        </div>
        {loan.notes && (
          <p className="mt-3 whitespace-pre-wrap text-xs text-text-secondary">{loan.notes}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={onCredit}>
            <Plus size={14} /> Add credit
          </Button>
          {loan.outstanding > 0 && (
            <Button size="sm" variant="secondary" onClick={onPayment}>Record repayment</Button>
          )}
          <Button size="sm" variant="secondary" onClick={onOriginal}>
            {loan.disbursementTransactionId ? 'Original transaction linked' : 'Link original transaction'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Pencil size={13} /> Edit
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
                  <div className="text-xs text-text">{advance.advancedOn} · Additional credit</div>
                  <div className="text-xs text-text-tertiary">
                    {advance.transactionId ? 'Linked posted bank outflow' : 'Manual record'}
                    {advance.notes ? ` · ${advance.notes}` : ''}
                  </div>
                </div>
                <strong className="tabular-nums text-text">{formatCurrency(advance.amount)}</strong>
                <button type="button" onClick={() => onDeleteAdvance(advance)}
                  aria-label="Remove additional credit"
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
            {loan.advances.length === 0 && loan.repayments.length === 0 && (
              <p className="text-xs text-text-tertiary">No additional activity yet.</p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export default function PersonalLoansPage() {
  const qc = useQueryClient();
  const { data: profiles = [], isLoading, error: profilesError } = useQuery({
    queryKey: ['borrower-profiles'],
    queryFn: api.listProfiles,
  });
  const { data: loans = [], error: loansError } = useQuery({
    queryKey: ['personal-loans'],
    queryFn: api.listLoans,
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['personal-loans'] });
    qc.invalidateQueries({ queryKey: ['borrower-profiles'] });
    qc.invalidateQueries({ queryKey: ['loan-bank-candidates'] });
    qc.invalidateQueries({ queryKey: ['loan-original-outflows'] });
  };
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const current = profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null;
  const shown = current ? loans.filter((loan) => loan.profileId === current.id) : [];
  const [profileEditor, setProfileEditor] = useState<'new' | 'edit' | null>(null);
  const [loanEditor, setLoanEditor] = useState<PersonalLoan | 'new' | null>(null);
  const [eventEditor, setEventEditor] = useState<EventEdit | null>(null);
  const [originalEditor, setOriginalEditor] = useState<PersonalLoan | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [actionError, setActionError] = useState('');

  const createProfile = useMutation({
    mutationFn: api.createProfile,
    onSuccess: (p) => { invalidate(); setActiveProfileId(p.id); setProfileEditor(null); },
  });
  const editProfile = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name: string; notes: string | null } }) =>
      api.editProfile(id, body),
    onSuccess: () => { invalidate(); setProfileEditor(null); },
  });
  const createLoan = useMutation({
    mutationFn: api.createLoan,
    onSuccess: (loan) => {
      invalidate();
      setActiveProfileId(loan.profileId);
      setLoanEditor(null);
    },
  });
  const editLoan = useMutation({
    mutationFn: ({ id, body }: { id: string; body: LoanInput }) => api.editLoan(id, body),
    onSuccess: (loan) => { invalidate(); setActiveProfileId(loan.profileId); setLoanEditor(null); },
  });
  const advance = useMutation({
    mutationFn: ({ id, body }: { id: string; body: LoanAdvanceInput }) => api.addAdvance(id, body),
    onSuccess: () => { invalidate(); setEventEditor(null); },
  });
  const repayment = useMutation({
    mutationFn: ({ id, body }: { id: string; body: RepaymentInput }) => api.repayLoan(id, body),
    onSuccess: () => { invalidate(); setEventEditor(null); },
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
      return api.deleteRepayment(target.loan.id, target.item.id);
    },
    onSuccess: (_result, target) => {
      invalidate();
      setDeleting(null);
      setActionError('');
      if (target.kind === 'profile') setActiveProfileId(null);
    },
    onError: (error) => setActionError(error.message),
  });
  const totalOwed = profiles.reduce((sum, p) => sum + p.outstanding, 0);
  const totalRepaid = profiles.reduce((sum, p) => sum + p.repaid, 0);

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h1 className="text-lg font-semibold text-text">Money Lent</h1>
          <p className="text-xs text-text-secondary">People, separate loans and repayment history</p>
        </div>
        <Button size="sm" onClick={() => { createProfile.reset(); setProfileEditor('new'); }}>
          <Plus size={15} /> Add person
        </Button>
      </header>
      <main className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-surface-alt p-4">
            <div className="text-xs text-text-secondary">Total still owed</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-text">
              {formatCurrency(totalOwed)}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface-alt p-4">
            <div className="text-xs text-text-secondary">Total repaid</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-text">
              {formatCurrency(totalRepaid)}
            </div>
          </div>
        </div>
        <p className="text-xs text-text-tertiary">
          These are tracking-only IOUs, not additional cash or net-worth accounts.
          Linking a bank transaction never creates or modifies a bank entry.
        </p>
        {(profilesError || loansError) && (
          <p role="alert" className="text-sm text-negative">
            {(profilesError || loansError)?.message}
          </p>
        )}
        {isLoading ? (
          <p className="text-sm text-text-secondary">Loading borrower profiles…</p>
        ) : profiles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <UserRound size={32} className="mx-auto text-text-tertiary" />
            <h2 className="mt-2 font-semibold text-text">Create a financial profile</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Each person can have multiple separate loans with their own payment schedules.
            </p>
            <div className="mt-4">
              <Button onClick={() => setProfileEditor('new')}>
                <Plus size={15} /> Add person
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(220px,0.36fr)_minmax(0,1fr)]">
            <section className="space-y-2" aria-label="Borrower profiles">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text">People ({profiles.length})</h2>
              </div>
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => setActiveProfileId(profile.id)}
                  aria-pressed={current?.id === profile.id}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    current?.id === profile.id
                      ? 'border-brand-500 bg-surface-alt'
                      : 'border-border bg-surface hover:bg-hover'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate font-medium text-text">{profile.name}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-text">
                      {formatCurrency(profile.outstanding)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-text-tertiary">
                    {profile.loanCount} loan{profile.loanCount === 1 ? '' : 's'} ·
                    {formatCurrency(profile.repaid)} repaid
                  </p>
                </button>
              ))}
            </section>
            {current && (
              <section className="min-w-0 space-y-4" aria-label={`Loans for ${current.name}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <HandCoins size={20} className="text-text-secondary" />
                      <h2 className="text-lg font-semibold text-text">{current.name}</h2>
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">
                      {current.loanCount} loan{current.loanCount === 1 ? '' : 's'} ·
                      {formatCurrency(current.outstanding)} owed
                    </p>
                    {current.notes && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">
                        {current.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => { createLoan.reset(); setLoanEditor('new'); }}>
                      <Plus size={15} /> New loan
                    </Button>
                    <Button size="sm" variant="secondary"
                      onClick={() => { editProfile.reset(); setProfileEditor('edit'); }}>
                      <Pencil size={14} /> Profile
                    </Button>
                    {current.loanCount === 0 && (
                      <Button size="sm" variant="ghost"
                        onClick={() => { setActionError(''); setDeleting({ kind: 'profile', profile: current }); }}>
                        <Trash2 size={14} /> Delete
                      </Button>
                    )}
                  </div>
                </div>
                {shown.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-7 text-center">
                    <p className="text-sm text-text-secondary">No loans for this person yet.</p>
                    <div className="mt-3">
                      <Button onClick={() => setLoanEditor('new')}>
                        <Plus size={14} /> Add their first loan
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {shown.map((loan) => (
                      <LoanCard
                        key={loan.id}
                        loan={loan}
                        onEdit={() => { editLoan.reset(); setLoanEditor(loan); }}
                        onCredit={() => { advance.reset(); setEventEditor({ loan, kind: 'advance' }); }}
                        onPayment={() => { repayment.reset(); setEventEditor({ loan, kind: 'repayment' }); }}
                        onOriginal={() => { original.reset(); setOriginalEditor(loan); }}
                        onDelete={() => { setActionError(''); setDeleting({ kind: 'loan', loan }); }}
                        onDeleteAdvance={(item) => { setActionError(''); setDeleting({ kind: 'advance', loan, item }); }}
                        onDeleteRepayment={(item) => { setActionError(''); setDeleting({ kind: 'repayment', loan, item }); }}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>
      {profileEditor && (
        <Modal isOpen title={profileEditor === 'new' ? 'Add person' : 'Edit financial profile'}
          onClose={() => setProfileEditor(null)} size="lg">
          <ProfileForm
            key={profileEditor === 'new' ? 'new' : current?.id}
            profile={profileEditor === 'edit' ? current ?? undefined : undefined}
            busy={createProfile.isPending || editProfile.isPending}
            error={(profileEditor === 'new' ? createProfile.error : editProfile.error)?.message}
            onCancel={() => setProfileEditor(null)}
            onSubmit={(body) => {
              if (profileEditor === 'new') createProfile.mutate(body);
              else if (current) editProfile.mutate({ id: current.id, body });
            }}
          />
        </Modal>
      )}
      {loanEditor && current && (
        <Modal isOpen title={loanEditor === 'new' ? 'Add loan' : 'Edit loan'}
          onClose={() => setLoanEditor(null)} size="lg">
          <LoanForm
            key={loanEditor === 'new' ? 'new' : loanEditor.id}
            profile={current} profiles={profiles}
            loan={loanEditor === 'new' ? undefined : loanEditor}
            busy={createLoan.isPending || editLoan.isPending}
            error={(loanEditor === 'new' ? createLoan.error : editLoan.error)?.message}
            onCancel={() => setLoanEditor(null)}
            onSubmit={(body) => {
              if (loanEditor === 'new') createLoan.mutate(body);
              else editLoan.mutate({ id: loanEditor.id, body });
            }}
          />
        </Modal>
      )}
      {eventEditor && (
        <Modal isOpen
          title={eventEditor.kind === 'advance' ? 'Add credit to loan' : 'Record repayment'}
          onClose={() => setEventEditor(null)} size="lg">
          <EventForm
            key={`${eventEditor.loan.id}-${eventEditor.kind}`}
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
            }}
          />
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
      <ConfirmModal
        isOpen={deleting !== null} onClose={() => { setDeleting(null); setActionError(''); }}
        title="Remove recorded data?"
        message={
          deleting?.kind === 'profile'
            ? 'This removes an empty financial profile.'
            : deleting?.kind === 'loan'
              ? 'This deletes this loan and its credit/repayment history. Bank transactions remain.'
              : 'This removes the selected IOU activity. Bank transactions remain unchanged.'
        }
        confirmLabel="Remove" danger
        onConfirm={() => { if (deleting) remove.mutate(deleting); }}
      />
      {actionError && (
        <div role="alert" className="px-5 pb-3 text-sm text-negative">{actionError}</div>
      )}
    </div>
  );
}
