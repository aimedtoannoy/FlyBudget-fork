-- FlyBudget-fork: show Plaid pending authorizations without duplicating posted charges.
ALTER TABLE `transactions` ADD `pending` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Only backfill once per Plaid Item: older sync cursors discarded pending rows.
ALTER TABLE `plaid_items` ADD `pending_backfilled` integer DEFAULT 0 NOT NULL;
