/** Deterministic cash-flow scenarios; all amounts are in one account's minor currency units. */
export interface CashFlowEvent {
  id: string;
  date: string; // YYYY-MM-DD, account-local calendar date
  amount: number; // positive income, negative spending
  kind: 'income' | 'bill' | 'other';
}
export interface CashFlowInput {
  asOf: string;
  accountKind: 'cash' | 'credit' | 'other';
  available: number | null;
  postedLedger: number;
  pendingAmount: number;
  reserve: number;
  events: CashFlowEvent[];
  days: 7 | 14 | 30;
}

export function forecastCashFlow(input: CashFlowInput) {
  if (input.accountKind !== 'cash') throw new Error('Cash-flow availability forecast requires a cash account');
  const start = Date.parse(input.asOf + 'T00:00:00Z');
  if (!Number.isFinite(start)) throw new Error('Invalid forecast date');
  if (!Number.isSafeInteger(input.reserve) || input.reserve < 0) throw new Error('Invalid reserve');
  const end = new Date(start + input.days * 86_400_000).toISOString().slice(0, 10);
  const starting = input.available ?? input.postedLedger + input.pendingAmount;
  const scheduled = input.events
    .filter((event) => event.date > input.asOf && event.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let balance = starting;
  let minimum = starting;
  const timeline = scheduled.map((event) => {
    balance += event.amount;
    minimum = Math.min(minimum, balance);
    return { ...event, projectedBalance: balance };
  });
  // Conservative: don't count anticipated income when deciding safe-to-spend now.
  const futureOutflows = scheduled.reduce((sum, event) => sum + Math.min(0, event.amount), 0);
  const safeToSpendNow = Math.max(0, starting + futureOutflows - input.reserve);
  return {
    startingBalance: starting,
    startingSource: input.available === null ? 'ledger_pending' as const : 'bank_available' as const,
    endingBalance: balance,
    minimumBalance: minimum,
    reserve: input.reserve,
    safeToSpendNow,
    through: end,
    timeline,
    disclaimer: 'Estimate only. Bank available funds may include holds or credit limits; upcoming events must be verified and income is not guaranteed.',
  };
}
