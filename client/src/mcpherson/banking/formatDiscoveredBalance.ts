import { formatMoney } from '../../utils/currency';

/** Bank discovery amounts are integer minor units in the institution account's currency. */
export function formatDiscoveredBalance(amount: number | null, currency: string): string {
  return amount === null ? 'Not provided' : formatMoney(amount, currency);
}
