# FlyBudget-fork customizations

Keep custom business logic in `server/src/features/<feature-name>/` and
`client/src/features/<feature-name>/`. Only small integration points belong in
upstream directories (existing Plaid services, schema, register components).

## Plaid pending transactions

Branch: `feature/plaid-pending-transactions`

- Import pending Plaid events instead of silently dropping them.
- Label pending rows in both register layouts and transaction details.
- When a charge posts, use Plaid's `pending_transaction_id` to **promote the
  existing row**, retaining its local ID, category, notes, and schedule link.
- Don't guess that two transactions match merely because they have the same
  merchant and amount.
- Count pending activity in the account's **projected ledger balance** and
  budget activity. Reconcile Plaid's `current` balance against **posted-only**
  rows to avoid reversing the pending effect with a starting-balance adjustment.
- A scheduled bill should not be automatically treated as posted solely because
  an authorization is pending.
- Existing Plaid Items receive one catch-up request for current pending
  authorizations; the historical sync cursor is not reset.

### Cautions

Plaid bank data can still lag real-time activity; pending visibility is limited
to events Plaid returns. An authorization's final amount can change (tips,
fuel holds, hotels). Split allocations may need review after posting when the
amount changes. Bank `available` balances may differ from current balance plus
pending entries due to holds and institution-specific accounting. The register
therefore represents projected activity, not an authoritative available balance.

The database migration is additive but keep backups before installing. Do not
merge or deploy until CI is green. Retain upstream licensing and credits. Use
custom images from this fork, never silently replace the upstream GHCR image.
