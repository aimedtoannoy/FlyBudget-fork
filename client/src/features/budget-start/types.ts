/** Optional first month and unallocated carry-in, in budget-currency minor units. */
export interface BudgetStartingPoint {
  startMonth: string | null;
  openingFunds: number;
}
