import { addMonths, addWeeks, format, parseISO } from 'date-fns';

export type LoanMode = 'open' | 'once' | 'installments';
export type LoanCadence = 'weekly' | 'biweekly' | 'monthly';

export type LoanPlan = {
  principal: number;
  repaid: number;
  repaymentMode: LoanMode;
  firstDueOn: string | null;
  cadence: LoanCadence | null;
  installmentAmount: number | null;
  remindersEnabled: number;
};

/** Pure, date-based calculation. Reminders stay in-app (no messages sent to borrowers). */
export function loanProgress(loan: LoanPlan, today: string) {
  const outstanding = Math.max(0, loan.principal - loan.repaid);
  let expectedPaid = 0;
  let nextDueOn: string | null = null;

  if (outstanding > 0 && loan.repaymentMode === 'once' && loan.firstDueOn) {
    nextDueOn = loan.firstDueOn;
    expectedPaid = today >= loan.firstDueOn ? loan.principal : 0;
  }
  if (
    outstanding > 0 &&
    loan.repaymentMode === 'installments' &&
    loan.firstDueOn &&
    loan.cadence &&
    loan.installmentAmount &&
    loan.installmentAmount > 0
  ) {
    const anchor = parseISO(loan.firstDueOn);
    const dateOf = (n: number) =>
      format(
        loan.cadence === 'monthly'
          ? addMonths(anchor, n)
          : addWeeks(anchor, n * (loan.cadence === 'biweekly' ? 2 : 1)),
        'yyyy-MM-dd',
      );
    const covered = Math.floor(loan.repaid / loan.installmentAmount);
    nextDueOn = dateOf(covered);
    let countDue = 0;
    for (let i = 0; i < 2400 && dateOf(i) <= today; i++) countDue++;
    expectedPaid = Math.min(loan.principal, countDue * loan.installmentAmount);
  }

  const overdueAmount = Math.max(0, expectedPaid - loan.repaid);
  const reminder =
    loan.remindersEnabled === 1 &&
    outstanding > 0 &&
    nextDueOn !== null &&
    nextDueOn <= format(addWeeks(parseISO(today), 1), 'yyyy-MM-dd');

  return {
    outstanding,
    expectedPaid,
    overdueAmount,
    nextDueOn,
    status: outstanding === 0 ? 'repaid' : overdueAmount > 0 ? 'overdue' : 'active',
    reminder,
  };
}
