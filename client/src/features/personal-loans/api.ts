import { apiFetch } from '../../api/client';

export type LoanMode = 'open' | 'once' | 'installments';
export type LoanCadence = 'weekly' | 'biweekly' | 'monthly';

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
  principal: number;
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
>;

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
export const depositsForLoan = (id: string) =>
  apiFetch<DepositCandidate[]>(`/personal-loans/${id}/deposits`);
export const repayLoan = (id: string, body: RepaymentInput) =>
  apiFetch<PersonalLoan>(`/personal-loans/${id}/repayments`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const deleteRepayment = (id: string, paymentId: string) =>
  apiFetch<PersonalLoan>(`/personal-loans/${id}/repayments/${paymentId}`, {
    method: 'DELETE',
  });
