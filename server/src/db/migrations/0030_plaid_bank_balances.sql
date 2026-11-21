-- Plaid bank snapshots only; existing ledger and budgets remain unchanged.
ALTER TABLE `plaid_account_mappings` ADD `bank_current_balance` integer;
--> statement-breakpoint
ALTER TABLE `plaid_account_mappings` ADD `bank_available_balance` integer;
--> statement-breakpoint
ALTER TABLE `plaid_account_mappings` ADD `bank_balance_fetched_at` text;
