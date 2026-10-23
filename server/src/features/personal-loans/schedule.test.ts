import { describe, expect, it } from 'vitest';
import { loanProgress } from './schedule.js';

const base = {
  principal: 50000,
  repaid: 0,
  repaymentMode: 'open' as const,
  firstDueOn: null,
  cadence: null,
  installmentAmount: null,
  remindersEnabled: 1,
};

describe('personal loan schedule', () => {
  it('keeps open-ended loans active without overdue notices', () => {
    expect(loanProgress(base, '2026-11-01')).toMatchObject({
      outstanding: 50000, nextDueOn: null, overdueAmount: 0, reminder: false,
    });
  });
  it('marks one-time repayment overdue only after its due date', () => {
    const loan = { ...base, repaymentMode: 'once' as const, firstDueOn: '2026-11-02' };
    expect(loanProgress(loan, '2026-11-01').overdueAmount).toBe(0);
    expect(loanProgress(loan, '2026-11-03').overdueAmount).toBe(50000);
    expect(loanProgress({ ...loan, repaid: 50000 }, '2026-11-03').status).toBe('repaid');
  });
  it('accounts for partial installment payments and calendar-month anchor dates', () => {
    const loan = {
      ...base, repaymentMode: 'installments' as const,
      firstDueOn: '2026-01-31', cadence: 'monthly' as const, installmentAmount: 10000,
    };
    expect(loanProgress(loan, '2026-02-28').expectedPaid).toBe(20000);
    expect(loanProgress({ ...loan, repaid: 15000 }, '2026-03-01')).toMatchObject({
      outstanding: 35000, overdueAmount: 5000, nextDueOn: '2026-02-28',
    });
    expect(loanProgress({ ...loan, repaid: 50000 }, '2026-03-01').nextDueOn).toBeNull();
  });
});
