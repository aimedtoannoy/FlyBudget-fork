-- Additive feature migration. Existing loan IDs, payments, bank records and budget untouched.
CREATE TABLE `borrower_profiles` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `notes` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `personal_loans` ADD `profile_id` text REFERENCES borrower_profiles(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `personal_loans` ADD `title` text;
--> statement-breakpoint
ALTER TABLE `personal_loans` ADD `disbursement_transaction_id` text REFERENCES transactions(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `personal_loans_disbursement_tx_unique_idx` ON `personal_loans` (`disbursement_transaction_id`);
--> statement-breakpoint
CREATE TABLE `personal_loan_advances` (
  `id` text PRIMARY KEY NOT NULL,
  `loan_id` text NOT NULL,
  `advanced_on` text NOT NULL,
  `amount` integer NOT NULL,
  `notes` text,
  `transaction_id` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`loan_id`) REFERENCES `personal_loans`(`id`) ON DELETE cascade,
  FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `personal_loan_advances_loan_idx` ON `personal_loan_advances` (`loan_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `personal_loan_advances_tx_unique_idx` ON `personal_loan_advances` (`transaction_id`);
--> statement-breakpoint
CREATE TABLE `goal_transaction_links` (
  `id` text PRIMARY KEY NOT NULL,
  `goal_id` text NOT NULL,
  `transaction_id` text NOT NULL,
  `applied_amount` integer NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON DELETE cascade,
  FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `goal_transaction_links_goal_idx` ON `goal_transaction_links` (`goal_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `goal_transaction_links_goal_tx_unique_idx` ON `goal_transaction_links` (`goal_id`, `transaction_id`);
