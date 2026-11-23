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
| Bank health UI | `client/src/mcpherson/banking/BankHealthPanel.tsx` | Phase 1 read-only | `ConnectedAccounts.tsx` mounts the panel in Plaid settings |
| Pending Plaid matching | `server/src/features/pending-transactions/plaidPending.ts` | Existing fork code | `plaidSyncService.ts` |
| Balance snapshots | `plaidAccountMappings` | Existing fork code | `plaidSyncService.ts`, `routes/accounts.ts` |

## Data safety and rollout

Migration `0031_mc_bank_sync_history.sql` adds only `mc_bank_sync_events` and `mc_bank_balance_snapshots` with foreign keys and indexes. It does not rewrite existing accounts, transactions, or Plaid data. Event rows contain status, counts and a short provider error code; no access tokens or bank credentials. Balance snapshots contain financial values and are accessible only to the server database, not the public diagnostics API. Audit writes are best-effort and cannot block a bank sync. Retention, backfill, and optional audit pruning are future work; the initial history API caps responses at 100 events. A backup and staging migration test are required before production rollout.

## Planned next modules

`bank-sync/` for durable sync events and detailed refresh metadata; `balance-integrity/` for non-destructive reconciliation; `pending-engine/` for lifecycle events; `cash-flow/` for deterministic forecasting. All require tests and explicit release review.
