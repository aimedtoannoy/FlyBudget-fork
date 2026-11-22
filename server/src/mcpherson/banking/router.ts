import { Router } from 'express';
import { db } from '../../db/index.js';
import { plaidAccountMappings, plaidItems } from '../../db/schema.js';
import { buildBankDiagnostics } from './diagnostics.js';

/** Mounted behind the app's existing requireSession middleware. Read-only. */
export const mcphersonBankingRouter = Router();

mcphersonBankingRouter.get('/diagnostics', (_req, res) => {
  const items = db.select({
    id: plaidItems.id,
    institutionName: plaidItems.institutionName,
    lastSyncedAt: plaidItems.lastSyncedAt,
    syncStatus: plaidItems.syncStatus,
    syncError: plaidItems.syncError,
  }).from(plaidItems).all();
  const mappings = db.select({
    plaidItemId: plaidAccountMappings.plaidItemId,
    accountId: plaidAccountMappings.accountId,
    plaidAccountName: plaidAccountMappings.plaidAccountName,
    isEnabled: plaidAccountMappings.isEnabled,
    bankBalanceFetchedAt: plaidAccountMappings.bankBalanceFetchedAt,
    bankCurrentBalance: plaidAccountMappings.bankCurrentBalance,
    bankAvailableBalance: plaidAccountMappings.bankAvailableBalance,
  }).from(plaidAccountMappings).all();

  res.json({
    generatedAt: new Date().toISOString(),
    interpretation: 'Freshness measures when FlyBudget retrieved data, not when the bank updated it.',
    institutions: buildBankDiagnostics(items, mappings, Date.now()),
  });
});
