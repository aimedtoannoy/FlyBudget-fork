# Phase 7 release rehearsal

## Safety gates

- Do not merge or deploy until explicitly approved.
- Record the running image digest, database location, volume configuration, and encryption-key location. Never print or commit credentials.
- Stop production writers before taking a final release backup. Use SQLite's online backup API or a verified cold copy after clean shutdown; never copy only the main file of a live WAL database.
- Preserve the original database and encryption key together in restricted storage. Verify integrity and rehearse restoring to a separate path.
- Use a separate staging volume and port. Never mount production data read-write in staging. Block outbound network access for a clone containing live bank credentials; do not reconnect Plaid or run live sync against the clone. Prefer synthetic fixtures for automated testing.
- Rehearse migration from the current deployed version, compare historical accounts, transactions, categories, budgets, schedules, loan records and links before/after. Verify pending/posted balances and reconciliation in observe mode. Test scheduled bills, forecast and alert interactions.
- Rollback: stop the new instance, restore the verified pre-upgrade database into a clean volume (no stale WAL/SHM), restore matching encryption configuration and previous image digest, then verify integrity and login before resuming writes. Post-backup writes require explicit reconciliation; do not silently discard them.

## Evidence

The automated upgrade test starts at migration 0030, populates synthetic historical records, takes an SQLite online backup, upgrades through the current journal, compares all pre-existing tables, reruns migrations, and verifies the backup independently. This is not proof of the actual deployed version or a live staging rehearsal.

Release approval requires green CI, a verified production backup, actual-version staging rehearsal, documented balance/transaction comparisons, Money Lent isolation, combined forecast/reconciliation validation, and rollback verification.
