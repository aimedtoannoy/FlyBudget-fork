-- Opt-in budget baseline: no existing budgets, account balances or bank records change.
ALTER TABLE `budget_settings` ADD `budget_start_month` text;
--> statement-breakpoint
ALTER TABLE `budget_settings` ADD `opening_funds` integer DEFAULT 0 NOT NULL;
