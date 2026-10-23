-- Standalone IOU records. No bank transactions, balances or categories are modified.
CREATE TABLE `personal_loans` (
  `id` text PRIMARY KEY NOT NULL,
  `borrower` text NOT NULL,
  `principal` integer NOT NULL,
  `lent_on` text NOT NULL,
  `repayment_mode` text DEFAULT 'open' NOT NULL,
  `first_due_on` text,
  `cadence` text,
  `installment_amount` integer,
  `reminders_enabled` integer DEFAULT 0 NOT NULL,
  `notes` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `personal_loan_repayments` (
  `id` text PRIMARY KEY NOT NULL,
  `loan_id` text NOT NULL,
  `paid_on` text NOT NULL,
  `amount` integer NOT NULL,
  `notes` text,
  `transaction_id` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`loan_id`) REFERENCES `personal_loans`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `personal_loan_repayments_loan_idx` ON `personal_loan_repayments` (`loan_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `personal_loan_repayments_transaction_idx` ON `personal_loan_repayments` (`transaction_id`);
