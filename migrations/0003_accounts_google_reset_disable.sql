CREATE TABLE `password_reset_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`request_ip` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_reset_tokens_token_hash_unique` ON `password_reset_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `password_reset_tokens_customer_idx` ON `password_reset_tokens` (`customer_id`);--> statement-breakpoint
CREATE INDEX `password_reset_tokens_expires_idx` ON `password_reset_tokens` (`expires_at`);--> statement-breakpoint
ALTER TABLE `customers` ADD `google_sub` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `email_verified_at` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `disabled_at` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `disabled_reason` text;--> statement-breakpoint
CREATE UNIQUE INDEX `customers_google_sub_uq` ON `customers` (`google_sub`);--> statement-breakpoint
CREATE INDEX `customers_created_idx` ON `customers` (`created_at`);--> statement-breakpoint
-- Public contact address (also shown on the privacy and terms pages); only
-- filled in if an administrator has not set one yet.
UPDATE `site_settings` SET `value` = '"info@herjourney.rw"' WHERE `key` = 'contact_email' AND `value` IN ('""', 'null');
