import { shouldAutoAlignStartingBalance, type ReconciliationMode } from './reconciliationMode.js';

/** Protect non-cash accounts and mismatched currencies from automatic starting-balance changes. */
export function canAutoAlignPlaidAccount(input: {
  mode: ReconciliationMode;
  bankCurrent: number | null;
  accountType: string;
  accountCurrency: string | null;
  mappingCurrency: string | null;
}): boolean {
  if (!shouldAutoAlignStartingBalance(input.mode, input.bankCurrent)) return false;
  if (!['checking', 'savings', 'cash'].includes(input.accountType.toLowerCase())) return false;
  if (input.mappingCurrency && input.accountCurrency && input.mappingCurrency !== input.accountCurrency) return false;
  return true;
}
