-- Applied credits are non-cash debt reductions. Old advances and repayments are untouched.
CREATE TABLE `personal_loan_credits` (
  `id` text PRIMARY KEY NOT NULL,
  `loan_id` text NOT NULL,
  `applied_on` text NOT NULL,
  `amount` integer NOT NULL,
  `notes` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`loan_id`) REFERENCES `personal_loans`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `personal_loan_credits_loan_idx` ON `personal_loan_credits` (`loan_id`);
