CREATE TABLE `mc_alert_preferences` (`id` text PRIMARY KEY NOT NULL, `enabled` integer DEFAULT 0 NOT NULL, `minimum_severity` text DEFAULT 'warning' NOT NULL, `cooldown_hours` integer DEFAULT 24 NOT NULL);
--> statement-breakpoint
CREATE TABLE `mc_alert_delivery_state` (`alert_id` text PRIMARY KEY NOT NULL, `last_shown_at` text NOT NULL, `acknowledged_at` text);
