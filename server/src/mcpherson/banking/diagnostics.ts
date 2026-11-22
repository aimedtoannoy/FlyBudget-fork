import { classifyRetrievalFreshness } from './freshness.js';

export interface PlaidDiagnosticItem {
  id: string;
  institutionName: string;
  lastSyncedAt: string | null;
  syncStatus: string;
  syncError: string | null;
}

export interface PlaidDiagnosticAccount {
  plaidItemId: string;
  accountId: string | null;
  plaidAccountName: string;
  isEnabled: number;
  bankBalanceFetchedAt: string | null;
  bankCurrentBalance: number | null;
  bankAvailableBalance: number | null;
}

/** Safe, read-only projection: excludes Plaid access tokens, bank identifiers and balances. */
export function buildBankDiagnostics(
  items: PlaidDiagnosticItem[],
  accounts: PlaidDiagnosticAccount[],
  nowMs: number,
) {
  return items.map((item) => ({
    itemId: item.id,
    institutionName: item.institutionName,
    transactionSyncAt: item.lastSyncedAt,
    transactionSyncFreshness: classifyRetrievalFreshness(item.lastSyncedAt, nowMs),
    status: item.syncStatus,
    hasSyncError: item.syncError !== null,
    accounts: accounts
      .filter((account) => account.plaidItemId === item.id && account.isEnabled === 1)
      .map((account) => ({
        accountId: account.accountId,
        accountName: account.plaidAccountName,
        balanceFetchedAt: account.bankBalanceFetchedAt,
        balanceRetrievalFreshness: classifyRetrievalFreshness(account.bankBalanceFetchedAt, nowMs),
        bankRefreshTimeKnown: false,
        hasCurrentBalance: account.bankCurrentBalance !== null,
        hasAvailableBalance: account.bankAvailableBalance !== null,
      })),
  }));
}
