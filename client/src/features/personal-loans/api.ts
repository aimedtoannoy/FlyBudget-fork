import { apiFetch } from '../../api/client';

export type LoanMode = 'open' | 'once' | 'installments';
export type LoanCadence = 'weekly' | 'biweekly' | 'monthly';

export type BorrowerProfile = {
  id: string;
  name: string;
  notes: string | null;
  loanCount: number;
  outstanding: number;
  repaid: number;
  advanced: number;
};

export type LoanAdvance = {
  id: string;
  loanId: string;
  amount: number;
  advancedOn: string;
  transactionId: string | null;
  notes: string | null;
};

export type LoanRepayment = {
  id: string;
  loanId: string;
  paidOn: string;
  amount: number;
  notes: string | null;
  transactionId: string | null;
};

export type PersonalLoan = {
  id: string;
  borrower: string;
  profileId: string | null;
  title: string;
  disbursementTransactionId: string | null;
  principal: number;
  advanced: number;
  totalPrincipal: number;
  advances: LoanAdvance[];
  lentOn: string;
  repaymentMode: LoanMode;
  firstDueOn: string | null;
  cadence: LoanCadence | null;
  installmentAmount: number | null;
  remindersEnabled: number;
  notes: string | null;
  repaid: number;
  outstanding: number;
  expectedPaid: number;
  overdueAmount: number;
  nextDueOn: string | null;
  status: 'active' | 'overdue' | 'repaid';
  reminder: boolean;
  repayments: LoanRepayment[];
};

export type LoanInput = Pick<
  PersonalLoan,
  | 'borrower'
  | 'principal'
  | 'lentOn'
  | 'repaymentMode'
  | 'firstDueOn'
  | 'cadence'
  | 'installmentAmount'
  | 'remindersEnabled'
  | 'notes'
> & { profileId?: string | null; title?: string | null };

export type RepaymentInput = {
  paidOn: string;
  amount: number;
  notes: string | null;
  transactionId: string | null;
};

export type DepositCandidate = {
  id: string;
  date: string;
  amount: number;
  payeeName: string | null;
};

export const listLoans = () => apiFetch<PersonalLoan[]>('/personal-loans');
export const createLoan = (body: LoanInput) =>
  apiFetch<PersonalLoan>('/personal-loans', { method: 'POST', body: JSON.stringify(body) });
export const editLoan = (id: string, body: LoanInput) =>
  apiFetch<PersonalLoan>(`/personal-loans/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
export const deleteLoan = (id: string) =>
  apiFetch<void>(`/personal-loans/${id}`, { method: 'DELETE' });
export const depositsForLoan = (id: string, search = '') =>
  apiFetch<DepositCandidate[]>(
    `/personal-loans/${id}/deposits?search=${encodeURIComponent(search)}`,
  );
export const repayLoan = (id: string, body: RepaymentInput) =>
  apiFetch<PersonalLoan>(`/personal-loans/${id}/repayments`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const deleteRepayment = (id: string, paymentId: string) =>
  apiFetch<PersonalLoan>(`/personal-loans/${id}/repayments/${paymentId}`, {
    method: 'DELETE',
  });

export type LoanAdvanceInput = {
  advancedOn: string;
  amount: number;
  notes: string | null;
  transactionId: string | null;
};

export type OutflowCandidate = DepositCandidate & { accountName?: string };

export const listProfiles = () => apiFetch<BorrowerProfile[]>('/personal-loans/profiles');
export const createProfile = (body: { name: string; notes: string | null }) =>
  apiFetch<BorrowerProfile>('/personal-loans/profiles', {
    method: 'POST', body: JSON.stringify(body),
  });
export const editProfile = (id: string, body: { name: string; notes: string | null }) =>
  apiFetch<BorrowerProfile>(`/personal-loans/profiles/${id}`, {
    method: 'PUT', body: JSON.stringify(body),
  });
export const deleteProfile = (id: string) =>
  apiFetch<void>(`/personal-loans/profiles/${id}`, { method: 'DELETE' });

export const loanOutflows = (id: string, search = '') =>
  apiFetch<OutflowCandidate[]>(
    `/personal-loans/${id}/outflows?search=${encodeURIComponent(search)}`,
  );
export const linkDisbursement = (id: string, transactionId: string | null) =>
  apiFetch<PersonalLoan>(`/personal-loans/${id}/disbursement`, {
    method: 'PUT', body: JSON.stringify({ transactionId }),
  });
export const addAdvance = (id: string, body: LoanAdvanceInput) =>
  apiFetch<PersonalLoan>(`/personal-loans/${id}/advances`, {
    method: 'POST', body: JSON.stringify(body),
  });
export const deleteAdvance = (id: string, creditId: string) =>
  apiFetch<PersonalLoan>(`/personal-loans/${id}/advances/${creditId}`, {
    method: 'DELETE',
  });
