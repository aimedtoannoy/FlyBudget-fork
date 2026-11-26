/** Read-only reconciliation math. Values are in the account's native minor units. */
export interface ReconciliationInput {
  accountId: string;
  currency: string;
  startingBalance: number;
  postedTransactionSum: number;
  pendingTransactionSum: number;
  bankCurrentBalance: number | null;
  bankAvailableBalance: number | null;
  bankBalanceFetchedAt: string | null;
  bankCurrency?: string | null;
}

export function inspectReconciliation(input: ReconciliationInput) {
  const postedLedgerBalance = input.startingBalance + input.postedTransactionSum;
  const pendingInclusiveLedgerBalance = postedLedgerBalance + input.pendingTransactionSum;
  const currencyMismatch = !!input.bankCurrency && input.currency !== input.bankCurrency;
  const currentDifference = input.bankCurrentBalance === null || currencyMismatch
    ? null
    : input.bankCurrentBalance - postedLedgerBalance;
  return {
    accountId: input.accountId,
    currency: input.currency,
    postedLedgerBalance,
    pendingInclusiveLedgerBalance,
    bankCurrentBalance: input.bankCurrentBalance,
    bankAvailableBalance: input.bankAvailableBalance,
    bankBalanceFetchedAt: input.bankBalanceFetchedAt,
    bankRefreshTimeKnown: false,
    currentDifference,
    state: currencyMismatch ? 'currency_mismatch' as const : currentDifference === null ? 'unavailable' as const : currentDifference === 0 ? 'matched' as const : 'difference' as const,
    note: 'A matching current balance does not prove transactions and bank data represent the same moment. Pending authorizations can affect available balance differently at each bank.',
  };
}
