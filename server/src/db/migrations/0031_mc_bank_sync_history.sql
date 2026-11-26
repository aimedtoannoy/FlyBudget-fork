-- McPherson extension-owned, additive bank sync audit history. No upstream data is rewritten.
CREATE TABLE IF NOT EXISTS `mc_bank_sync_events` (
  `id` text PRIMARY KEY NOT NULL,
  `plaid_item_id` text NOT NULL,
  `occurred_at` text NOT NULL,
  `status` text NOT NULL,
  `added_count` integer NOT NULL DEFAULT 0,
  `modified_count` integer NOT NULL DEFAULT 0,
  `removed_count` integer NOT NULL DEFAULT 0,
  `error_code` text,
  FOREIGN KEY (`plaid_item_id`) REFERENCES `plaid_items`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mc_bank_sync_events_item_time_idx` ON `mc_bank_sync_events` (`plaid_item_id`, `occurred_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `mc_bank_balance_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `mapping_id` text NOT NULL,
  `fetched_at` text NOT NULL,
  `current_minor` integer,
  `available_minor` integer,
  `currency` text,
  FOREIGN KEY (`mapping_id`) REFERENCES `plaid_account_mappings`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mc_bank_balance_snapshots_mapping_time_idx` ON `mc_bank_balance_snapshots` (`mapping_id`, `fetched_at`);
