# Budget starting point (FlyBudget-fork)

## Why

The original To Be Budgeted formula carries all earlier categorized income minus
earlier budget allocations. Importing many months of historical transactions into
a previously unused budget can therefore show an imaginary amount ready to assign.

This opt-in feature lets the user define the first budget month and **opening
unallocated money**, without rewriting the past.

## Behavior

- Open the Budget page and expand **Budget starting point**. Enter the first
  month, such as October 2026, and the money actually unassigned on its first day.
  The default is **not configured**, preserving old behavior until saved.
- Starting in the configured month, old income and allocations **before** that
  month no longer inflate To Be Budgeted. The first month adds the manually
  specified opening funds; later months carry it forward once, together with
  income received and money allocated since the configured start.
- Per-category carryover also excludes pre-start budgets and transactions.
- Browsing old months, reporting, transaction history, bank balances, account
  starting balances, and Plaid connections are unchanged.
- Disabling the starting point restores the legacy budget calculation. Bank
  transaction and account records are not edited by either operation.
- The opening amount is a **budget planning figure**, not an authoritative bank
  available balance. It must not double-count paychecks received during the
  starting month and should not include money already committed elsewhere.

## Deployment

Migration `0026_budget_start.sql` is additive. Preserve your existing database
volume and encryption key. Back up the SQLite database and secret before
updating Portainer. Commit-triggered Actions are consolidated: one full CI run
on `main`, with fork image publishing gated on the passing CI job; upstream
Docker and the previous standalone fork publisher are manual-only.
