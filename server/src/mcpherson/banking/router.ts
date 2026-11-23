import { Router } from 'express';
import { db } from '../../db/index.js';
import { accounts, mcBankSyncEvents, plaidAccountMappings, plaidItems } from '../../db/schema.js';
import { desc, eq, notInArray } from 'drizzle-orm';
import { accountPostedTransactionSum, accountTransactionSum } from '../../services/balances.js';
import { budgetCurrency } from '../../services/mainAmountService.js';
import { inspectReconciliation } from './reconciliation.js';
import { buildBankDiagnostics } from './diagnostics.js';
import { bankingAlertCandidates, forecastAlertCandidates, prioritizeAlerts, reconciliationAlertCandidates } from './alerts.js';
import { forecastAccount } from './forecastAccount.js';
import { mcAlertPreferences, mcAlertDeliveryState } from '../../db/schema.js';
import { DEFAULT_ALERT_PREFERENCES, eligibleAlertIds, validAlertPreferences } from './delivery.js';

/** Mounted behind the app's existing requireSession middleware. */
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

  const institutions = buildBankDiagnostics(items, mappings, Date.now());
  const alerts = bankingAlertCandidates(institutions.flatMap((item) => [
    { itemId: item.itemId, institutionName: item.institutionName, status: item.status,
      transactionFreshness: item.transactionSyncFreshness, accountName: null, balanceFreshness: null },
    ...item.accounts.map((account) => ({
      itemId: item.itemId, institutionName: item.institutionName, status: 'good',
      transactionFreshness: 'fresh' as const, accountName: account.accountName,
      balanceFreshness: account.balanceRetrievalFreshness,
    })),
  ]));
  res.json({
    generatedAt: new Date().toISOString(),
    interpretation: 'Freshness measures when FlyBudget retrieved data, not when the bank updated it.',
    institutions,
    alerts,
  });
});

/** Read-only balance comparison. Never updates starting balances or bank data. */
mcphersonBankingRouter.get('/reconciliation', (_req, res) => {
  const mappings = db.select({
    accountId: plaidAccountMappings.accountId,
    currency: plaidAccountMappings.currency,
    bankCurrentBalance: plaidAccountMappings.bankCurrentBalance,
    bankAvailableBalance: plaidAccountMappings.bankAvailableBalance,
    bankBalanceFetchedAt: plaidAccountMappings.bankBalanceFetchedAt,
  }).from(plaidAccountMappings).where(eq(plaidAccountMappings.isEnabled, 1)).all();
  const latestByAccount = new Map<string, (typeof mappings)[number]>();
  for (const mapping of mappings) {
    if (!mapping.accountId) continue;
    const prior = latestByAccount.get(mapping.accountId);
    if (!prior || (mapping.bankBalanceFetchedAt ?? '') > (prior.bankBalanceFetchedAt ?? '')) {
      latestByAccount.set(mapping.accountId, mapping);
    }
  }
  const records = db.select({
    id: accounts.id,
    currency: accounts.currency,
    startingBalance: accounts.startingBalance,
  }).from(accounts).all();
  const results = records.flatMap((account) => {
    const mapping = latestByAccount.get(account.id);
    if (!mapping) return [];
    const postedTransactionSum = accountPostedTransactionSum(account.id);
    return [inspectReconciliation({
      accountId: account.id,
      currency: account.currency ?? budgetCurrency() ?? 'UNKNOWN',
      bankCurrency: mapping.currency,
      startingBalance: account.startingBalance,
      postedTransactionSum,
      pendingTransactionSum: accountTransactionSum(account.id) - postedTransactionSum,
      bankCurrentBalance: mapping.bankCurrentBalance,
      bankAvailableBalance: mapping.bankAvailableBalance,
      bankBalanceFetchedAt: mapping.bankBalanceFetchedAt,
    })];
  });
  res.json({ generatedAt: new Date().toISOString(), accounts: results });
});

/** Latest sync attempts, limited and sanitized for operational troubleshooting. */
mcphersonBankingRouter.get('/history', (_req, res) => {
  const recent = db.select({
    itemId: mcBankSyncEvents.plaidItemId,
    occurredAt: mcBankSyncEvents.occurredAt,
    status: mcBankSyncEvents.status,
    added: mcBankSyncEvents.addedCount,
    modified: mcBankSyncEvents.modifiedCount,
    removed: mcBankSyncEvents.removedCount,
    errorCode: mcBankSyncEvents.errorCode,
  }).from(mcBankSyncEvents).orderBy(desc(mcBankSyncEvents.occurredAt)).limit(100).all();
  res.json({ events: recent });
});

/** Preview-only; does not mutate balances, schedules, or transactions. */
mcphersonBankingRouter.get('/forecast/:accountId', (req, res) => {
  const days = Number(req.query.days ?? 14);
  const reserve = Number(req.query.reserve ?? 0);
  if (![7, 14, 30].includes(days) || !Number.isSafeInteger(reserve) || reserve < 0) {
    return res.status(400).json({ error: 'Use days=7,14,30 and a nonnegative reserve in minor units' });
  }
  const asOf = new Date().toISOString().slice(0, 10);
  const result = forecastAccount(req.params.accountId, days as 7 | 14 | 30, reserve, asOf);
  if ('error' in result) return res.status(result.status ?? 400).json({ error: result.error });
  res.json(result);
});

/** On-demand, read-only financial alert inbox. No scheduler, push, email, or account writes. */
function generateCurrentAlerts(now: number) {
  const asOf = new Date(now).toISOString().slice(0, 10);
  const items = db.select({ id: plaidItems.id, institutionName: plaidItems.institutionName, lastSyncedAt: plaidItems.lastSyncedAt, syncStatus: plaidItems.syncStatus, syncError: plaidItems.syncError }).from(plaidItems).all();
  const mappings = db.select({ plaidItemId: plaidAccountMappings.plaidItemId, accountId: plaidAccountMappings.accountId, plaidAccountName: plaidAccountMappings.plaidAccountName, isEnabled: plaidAccountMappings.isEnabled, bankBalanceFetchedAt: plaidAccountMappings.bankBalanceFetchedAt, bankCurrentBalance: plaidAccountMappings.bankCurrentBalance, bankAvailableBalance: plaidAccountMappings.bankAvailableBalance, currency: plaidAccountMappings.currency }).from(plaidAccountMappings).all();
  const diagnostics = buildBankDiagnostics(items, mappings, now);
  const bankAlerts = bankingAlertCandidates(diagnostics.flatMap((item) => [
    { itemId: item.itemId, institutionName: item.institutionName, status: item.status, transactionFreshness: item.transactionSyncFreshness, accountName: null, balanceFreshness: null },
    ...item.accounts.map((account) => ({ itemId: item.itemId, institutionName: item.institutionName, status: 'good', transactionFreshness: 'fresh' as const, accountName: account.accountName, balanceFreshness: account.balanceRetrievalFreshness })),
  ]));
  const enabled = mappings.filter((mapping) => mapping.isEnabled === 1 && mapping.accountId);
  const accountsById = new Map(db.select().from(accounts).all().map((account) => [account.id, account]));
  const latest = new Map<string, (typeof enabled)[number]>();
  for (const mapping of enabled) {
    const prior = latest.get(mapping.accountId!);
    if (!prior || (mapping.bankBalanceFetchedAt ?? '') > (prior.bankBalanceFetchedAt ?? '')) latest.set(mapping.accountId!, mapping);
  }
  const reconciliationInputs = [];
  const forecastAlerts = [];
  for (const [accountId, mapping] of latest) {
    const account = accountsById.get(accountId);
    if (!account) continue;
    const postedSum = accountPostedTransactionSum(accountId);
    const result = inspectReconciliation({ accountId, currency: account.currency ?? budgetCurrency() ?? 'UNKNOWN', bankCurrency: mapping.currency, startingBalance: account.startingBalance, postedTransactionSum: postedSum, pendingTransactionSum: accountTransactionSum(accountId) - postedSum, bankCurrentBalance: mapping.bankCurrentBalance, bankAvailableBalance: mapping.bankAvailableBalance, bankBalanceFetchedAt: mapping.bankBalanceFetchedAt });
    reconciliationInputs.push(result);
    if (!['checking', 'savings', 'cash'].includes(account.type.toLowerCase())) continue;
    const forecast = forecastAccount(accountId, 14, 0, asOf);
    if ('error' in forecast) continue;
    forecastAlerts.push(...forecastAlertCandidates({ accountId, accountName: account.name, available: forecast.startingBalance, safeToSpendNow: forecast.safeToSpendNow, reserve: forecast.reserve, through: forecast.through, timeline: forecast.timeline, uncertainSchedules: forecast.uncertainSchedules }));
  }
  return prioritizeAlerts([...bankAlerts, ...reconciliationAlertCandidates(reconciliationInputs), ...forecastAlerts]);
}

mcphersonBankingRouter.get('/alerts', (_req, res) => {
  const now = Date.now();
  res.json({ generatedAt: new Date(now).toISOString(), mode: 'preview', notificationsSent: false, explanation: 'Read-only estimates; no bank refresh or outbound notifications. Bank and ledger timestamps may differ.', alerts: generateCurrentAlerts(now) });
});

/** On-demand in-app inbox; recomputes all candidates server-side, never accepts client alert content. */
mcphersonBankingRouter.post('/alert-inbox', (_req, res) => {
  const now = Date.now();
  const alerts = generateCurrentAlerts(now);
  const result = db.transaction(() => {
    const row = db.select().from(mcAlertPreferences).where(eq(mcAlertPreferences.id, 'default')).get();
    const preferences = row ? { enabled: row.enabled === 1, minimumSeverity: row.minimumSeverity as 'info' | 'warning' | 'critical', cooldownHours: row.cooldownHours } : DEFAULT_ALERT_PREFERENCES;
    if (!preferences.enabled) return { enabled: false, alerts: [], newlyDelivered: 0 };
    // Resolution clears old suppression; a later recurrence can alert again.
    const activeIds = alerts.map((alert) => alert.id);
    if (activeIds.length) db.delete(mcAlertDeliveryState).where(notInArray(mcAlertDeliveryState.alertId, activeIds)).run();
    else db.delete(mcAlertDeliveryState).run();
    const existing = new Map(db.select().from(mcAlertDeliveryState).all().map((entry) => [entry.alertId, entry]));
    const eligible = new Set(eligibleAlertIds(alerts, preferences, existing, now));
    for (const alert of alerts) {
      if (!eligible.has(alert.id)) continue;
      db.insert(mcAlertDeliveryState).values({ alertId: alert.id, lastShownAt: new Date(now).toISOString(), acknowledgedAt: null })
        .onConflictDoUpdate({ target: mcAlertDeliveryState.alertId, set: { lastShownAt: new Date(now).toISOString(), acknowledgedAt: null } }).run();
    }
    const current = db.select().from(mcAlertDeliveryState).all();
    const visible = new Set(current.filter((entry) => !entry.acknowledgedAt).map((entry) => entry.alertId));
    return { enabled: true, newlyDelivered: eligible.size, alerts: alerts.filter((alert) => visible.has(alert.id)) };
  });
  res.json({ ...result, generatedAt: new Date(now).toISOString(), delivery: 'in_app_only' });
});

/** Preferences are opt-in and local; no external messages are sent. */
mcphersonBankingRouter.get('/alert-preferences', (_req, res) => {
  const row = db.select().from(mcAlertPreferences).where(eq(mcAlertPreferences.id, 'default')).get();
  res.json(row ? { enabled: row.enabled === 1, minimumSeverity: row.minimumSeverity, cooldownHours: row.cooldownHours } : DEFAULT_ALERT_PREFERENCES);
});
mcphersonBankingRouter.put('/alert-preferences', (req, res) => {
  if (!validAlertPreferences(req.body)) return res.status(400).json({ error: 'Invalid alert preferences' });
  const value = req.body;
  db.insert(mcAlertPreferences).values({ id: 'default', enabled: value.enabled ? 1 : 0, minimumSeverity: value.minimumSeverity, cooldownHours: value.cooldownHours })
    .onConflictDoUpdate({ target: mcAlertPreferences.id, set: { enabled: value.enabled ? 1 : 0, minimumSeverity: value.minimumSeverity, cooldownHours: value.cooldownHours } }).run();
  res.json(value);
});
mcphersonBankingRouter.post('/alert-acknowledgements', (req, res) => {
  const id = req.body?.id;
  if (typeof id !== 'string' || id.length > 256 || !/^[a-zA-Z0-9:_-]+$/.test(id)) return res.status(400).json({ error: 'Invalid alert ID' });
  const existing = db.select().from(mcAlertDeliveryState).where(eq(mcAlertDeliveryState.alertId, id)).get();
  if (!existing) return res.status(404).json({ error: 'Alert not delivered' });
  db.update(mcAlertDeliveryState).set({ acknowledgedAt: new Date().toISOString() }).where(eq(mcAlertDeliveryState.alertId, id)).run();
  res.json({ acknowledged: true });
});
