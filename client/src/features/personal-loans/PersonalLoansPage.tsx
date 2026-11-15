import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus, UserRound } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { formatCurrency } from '../../utils/currency';
import { ProfileForm } from './FinancialProfileForms';
import * as api from './api';

export default function PersonalLoansPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profiles = [], isLoading, error } = useQuery({
    queryKey: ['borrower-profiles'],
    queryFn: api.listProfiles,
  });
  const [creating, setCreating] = useState(false);
  const createProfile = useMutation({
    mutationFn: api.createProfile,
    onSuccess: (profile) => {
      qc.invalidateQueries({ queryKey: ['borrower-profiles'] });
      setCreating(false);
      navigate(`/money-lent/people/${profile.id}`);
    },
  });
  const owed = profiles.reduce((sum, p) => sum + p.outstanding, 0);
  const received = profiles.reduce((sum, p) => sum + p.repaid, 0);
  const credited = profiles.reduce((sum, p) => sum + p.credited, 0);

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
        <div>
          <h1 className="text-lg font-semibold text-text">Money Lent</h1>
          <p className="text-xs text-text-secondary">
            Overview of people and money owed
          </p>
        </div>
        <Button size="sm" onClick={() => { createProfile.reset(); setCreating(true); }}>
          <Plus size={15} /> Add person
        </Button>
      </header>
      <main className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface-alt p-3">
            <div className="text-xs text-text-secondary">Total still owed</div>
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
              {formatCurrency(credited)}
            </div>
          </div>
        </div>
        <p className="text-xs text-text-tertiary">
          Loans and credits are tracked separately from cash and bank accounts.
          Open a person to see their individual loans and activity.
        </p>
        {error && <p role="alert" className="text-sm text-negative">{error.message}</p>}
        {isLoading ? (
          <p className="text-sm text-text-secondary">Loading people…</p>
        ) : profiles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <UserRound size={30} className="mx-auto text-text-tertiary" />
            <h2 className="mt-3 text-sm font-semibold text-text">No financial profiles yet</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Create a person to track separate loans, repayments and applied credits.
            </p>
            <div className="mt-4">
              <Button onClick={() => setCreating(true)}><Plus size={15} /> Add person</Button>
            </div>
          </div>
        ) : (
          <section aria-label="People" className="space-y-3">
            <h2 className="text-sm font-semibold text-text">
              People ({profiles.length})
            </h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {profiles.map((profile) => (
                <button key={profile.id} type="button"
                  onClick={() => navigate(`/money-lent/people/${profile.id}`)}
                  className="flex min-h-24 w-full items-center gap-4 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-alt">
                    <UserRound size={20} className="text-text-secondary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold text-text">{profile.name}</div>
                    <div className="mt-1 text-xs text-text-secondary">
                      {profile.loanCount} loan{profile.loanCount === 1 ? '' : 's'}
                      {' · '}{formatCurrency(profile.repaid)} repaid
                    </div>
                    {profile.credited > 0 && (
                      <div className="mt-1 text-xs text-text-tertiary">
                        {formatCurrency(profile.credited)} in credits
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-base font-semibold tabular-nums text-text">
                      {formatCurrency(profile.outstanding)}
                    </div>
                    <div className="text-xs text-text-tertiary">still owed</div>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-text-tertiary" />
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
      {creating && (
        <Modal isOpen title="Add person" onClose={() => setCreating(false)} size="lg">
          <ProfileForm busy={createProfile.isPending} error={createProfile.error?.message}
            onCancel={() => setCreating(false)}
            onSubmit={(body) => createProfile.mutate(body)} />
        </Modal>
      )}
    </div>
  );
}
