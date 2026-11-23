# McPherson FlyBudget Extensions

This fork retains upstream FlyBudget as the base. Custom features must be independently identifiable, tested, and documented.

## Ownership and layout

- `server/src/mcpherson/`: extension-owned server logic and contracts.
- `client/src/mcpherson/`: extension-owned client logic and UI.
- `website/docs/mcpherson/`: extension-specific guides (when appropriate).
- `server/src/features/pending-transactions/`: earlier fork customization; migrate carefully after inventory and regression tests.
- Existing bank snapshot columns in upstream `plaidAccountMappings` predate this architecture and remain in place for compatibility.

## Upstream integration policy

1. Keep business logic in extension-owned modules; upstream files should only import adapters, register routes, or expose typed fields.
2. Record every changed upstream file and why in the PR description.
3. Preserve account currency minor units; never use the budget currency to format a bank-account amount.
4. Preserve null separately from zero for unavailable bank data.
5. Do not treat Plaid's retrieval timestamp as the bank's actual update time.
6. Never silently rewrite ledger starting balances as part of a new feature without migration and reconciliation tests.
7. Do not modify or remove existing transaction, category, or loan data in extension migrations.
8. Run client/server type checks, focused tests, and full CI before merging. Use a staging image before production.

## Current extension inventory

| Module | Path | Status | Integration |
| --- | --- | --- | --- |
| Bank-currency display | `client/src/mcpherson/banking/formatDiscoveredBalance.ts` | Phase 0 | `ConnectBankModal.tsx` |
| Banking contracts | `server/src/mcpherson/banking/contracts.ts` | Phase 0 | Shared extension contracts |
| Bank sync diagnostics | `server/src/mcpherson/banking/{router,diagnostics,freshness}.ts` | Phase 1 read-only | `server/src/index.ts` mounts authenticated `/api/mcpherson/banking/diagnostics` |
| Reconciliation report | `server/src/mcpherson/banking/reconciliation.ts` | Phase 2 read-only preview | Authenticated `/api/mcpherson/banking/reconciliation`; never modifies balances |
| Bank sync history | `server/src/mcpherson/banking/history.ts` and `server/src/db/migrations/0031_mc_bank_sync_history.sql` | Phase 1 | `plaidSyncService.ts` writes best-effort audit events and bank snapshots; `/api/mcpherson/banking/history` reads the latest 100 sync events |
| Plaid transient retry | `server/src/mcpherson/banking/retry.ts` | Phase 1 | `plaidService.ts` wraps only Plaid transaction/balance requests with bounded retries |
| Reconciliation rollout control | `server/src/mcpherson/banking/reconciliationMode.ts` | Phase 2 staging | `MC_BANK_RECONCILIATION_MODE=observe` disables automatic starting-balance alignment; default `legacy` preserves existing behavior |
| Bank health alert candidates | `server/src/mcpherson/banking/alerts.ts` | Phase 5 preview | Diagnostics API includes on-screen warnings only; no push/email notifications |
| Cash-flow scenario engine | `server/src/mcpherson/banking/forecast.ts` | Phase 4 foundation | Pure 7/14/30-day calculation, not yet connected to scheduled bills or account UI |
| Bank health UI | `client/src/mcpherson/banking/BankHealthPanel.tsx` | Phase 1 read-only | `ConnectedAccounts.tsx` mounts the panel in Plaid settings |
| Pending Plaid matching | `server/src/features/pending-transactions/plaidPending.ts` | Existing fork code | `plaidSyncService.ts` |
| Balance snapshots | `plaidAccountMappings` | Existing fork code | `plaidSyncService.ts`, `routes/accounts.ts` |

## Data safety and rollout

Migration `0031_mc_bank_sync_history.sql` adds only `mc_bank_sync_events` and `mc_bank_balance_snapshots` with foreign keys and indexes. It does not rewrite existing accounts, transactions, or Plaid data. Event rows contain status, counts and a short provider error code; no access tokens or bank credentials. Balance snapshots contain financial values and are accessible only to the server database, not the public diagnostics API. Audit writes are best-effort and cannot block a bank sync. Retention, backfill, and optional audit pruning are future work; the initial history API caps responses at 100 events. A backup and staging migration test are required before production rollout.

## Reconciliation rollout safety

Default `MC_BANK_RECONCILIATION_MODE=legacy` retains the upstream automatic starting-balance alignment. In staging only, set `MC_BANK_RECONCILIATION_MODE=observe` to keep imported bank snapshots and sync transactions without rewriting starting balances. Before enabling in production, review ledger drift and account opening balances against bank statements, and make a database backup. This toggle does **not** repair past adjustments. It is not a substitute for a full migration and historical reconciliation.

## Planned next modules

`bank-sync/` for durable sync events and detailed refresh metadata; `balance-integrity/` for non-destructive reconciliation; `pending-engine/` for lifecycle events; `cash-flow/` for deterministic forecasting. All require tests and explicit release review.

### Live scheduled cash-flow preview

The authenticated read-only endpoint `GET /api/mcpherson/banking/forecast/:accountId?days=14&reserve=20000` connects the deterministic forecast engine to existing **materialized** schedule occurrences for a checking/savings/cash account. `reserve` is expressed in the account's minor units (for USD, 20000 = $200). Supports 7, 14, and 30 days. Excludes matched/skipped schedules and internal transfers; uses bank available only if retrieved within 24 hours and currency-compatible, otherwise uses the pending-inclusive ledger. It does not invent recurring events missing from the schedule occurrence table. The endpoint is preview-only; no payment execution, transaction mutations or UI forecasting dashboard yet. Validate with staging data before production.

### Forecast settings preview (batch 4)

The McPherson bank health panel includes an on-demand 7/14/30-day forecast preview per linked account. Cash accounts are supported; credit and other accounts return a clear validation error. Reserve input is **minor units** (cents for USD) to avoid silently assuming all currencies have two decimal places. Results explicitly disclose missing scheduled occurrences and the difference between bank retrieval time and bank data freshness. The view makes no writes and does not initiate Plaid sync.

### Phase 4: recurring forecast projection

The read-only cash-flow endpoint now projects active recurrence rules (once, weekly, biweekly, semimonthly, monthly, quarterly, semiannual, annual) through the selected horizon. It reuses the existing recurrence engine, honors weekend adjustments, overlays materialized pending occurrences by schedule and scheduled date, and excludes paid/skipped/matched items and internal transfers. Projection does **not** generate database records. Non-exact amounts and invalid rules are explicitly flagged. Unscheduled expenses, bank refresh latency, and uncertain paychecks still limit the forecast; the displayed remainder is illustrative, not a guarantee of spendable funds.


### Phase 6: Financial alert preview
The authenticated read-only endpoint `GET /mcpherson/banking/alerts` produces deterministic, deduplicated, severity-ranked candidates for bank reconnect, sync staleness/errors, reconciliation discrepancies, 14-day scheduled bills, projected overdraft, zero estimated safe-to-spend, and uncertain schedules. The Bank Sync Health panel displays this preview. No email, push, cron, automatic payments, or notification preferences are activated. Alerts reflect retrieval-time data, not verified live bank updates. Validate on staging before enabling outbound delivery.


### Phase 6 delivery safeguards (not yet activated)
Local alert preferences are disabled by default, with minimum severity and 1–168 hour cooldown. Durable delivery state and an authenticated acknowledgement endpoint are included. The pure delivery policy handles opt-in, severity, acknowledgement, and repeat suppression. The user interface saves preferences, but no background scheduler, push, email, or in-app delivery activation is implemented yet. Never treat this as an active notification system.
