import type { Account } from '../../types';
import { formatMoney } from '../../utils/currency';

type BankAccount = Pick<
  Account,
  | 'type'
  | 'currency'
  | 'bankSource'
  | 'bankCurrentBalance'
  | 'bankAvailableBalance'
  | 'bankBalanceFetchedAt'
>;

export function BankBalances({ account, compact = false }: { account: BankAccount; compact?: boolean }) {
  if (account.bankSource !== 'plaid') return null;

  const availableLabel =
    account.type === 'credit' || account.type === 'line_of_credit' ? 'Available credit' : 'Available';
  const showMoney = (value: number | null | undefined) =>
    value === null || value === undefined ? 'Not provided' : formatMoney(value, account.currency);

  return (
    <div
      className={
        compact
          ? 'mt-1 space-y-0.5 text-[11px] tabular-nums text-text-tertiary'
          : 'mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs tabular-nums text-text-secondary'
      }
    >
      <span className={compact ? 'block' : ''}>
        Bank balance:{' '}
        <span className="font-medium text-text">{showMoney(account.bankCurrentBalance)}</span>
      </span>
      <span className={compact ? 'block' : ''}>
        {availableLabel}:{' '}
        <span className="font-medium text-text">{showMoney(account.bankAvailableBalance)}</span>
      </span>
      {!compact && (
        <span className="text-text-tertiary">
          {account.bankBalanceFetchedAt
            ? `Fetched from Plaid: ${new Date(account.bankBalanceFetchedAt).toLocaleString()}`
            : 'Plaid balance not fetched yet'}
        </span>
      )}
    </div>
  );
}
