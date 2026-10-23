CREATE TABLE `admin_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`admin_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_sessions_token_hash_unique` ON `admin_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `admin_sessions_admin_idx` ON `admin_sessions` (`admin_id`);--> statement-breakpoint
CREATE INDEX `admin_sessions_expires_idx` ON `admin_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `admin_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'staff' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`failed_login_count` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`last_login_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_email_unique` ON `admin_users` (`email`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`admin_id` integer,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`details` text,
	`ip_address` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `booking_guests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`booking_id` integer NOT NULL,
	`full_name` text NOT NULL,
	`guest_type` text NOT NULL,
	`is_lead_contact` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `booking_guests_booking_idx` ON `booking_guests` (`booking_id`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference` text NOT NULL,
	`access_token_hash` text NOT NULL,
	`tour_id` integer NOT NULL,
	`departure_id` integer NOT NULL,
	`customer_name` text NOT NULL,
	`customer_email` text NOT NULL,
	`customer_phone` text NOT NULL,
	`adults` integer NOT NULL,
	`children` integer DEFAULT 0 NOT NULL,
	`total_guests` integer NOT NULL,
	`special_requests` text,
	`currency` text NOT NULL,
	`adult_unit_price` integer NOT NULL,
	`child_unit_price` integer NOT NULL,
	`discount_amount` integer DEFAULT 0 NOT NULL,
	`fees_amount` integer DEFAULT 0 NOT NULL,
	`total_amount` integer NOT NULL,
	`status` text DEFAULT 'pending_payment' NOT NULL,
	`seats_held` integer DEFAULT true NOT NULL,
	`expires_at` text,
	`confirmed_at` text,
	`cancelled_at` text,
	`cancellation_reason` text,
	`admin_notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`tour_id`) REFERENCES `tours`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`departure_id`) REFERENCES `tour_departures`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "bookings_guests_check" CHECK("bookings"."adults" >= 0 AND "bookings"."children" >= 0 AND "bookings"."total_guests" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_reference_unique` ON `bookings` (`reference`);--> statement-breakpoint
CREATE INDEX `bookings_status_idx` ON `bookings` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `bookings_departure_idx` ON `bookings` (`departure_id`);--> statement-breakpoint
CREATE INDEX `bookings_tour_idx` ON `bookings` (`tour_id`);--> statement-breakpoint
CREATE INDEX `bookings_email_idx` ON `bookings` (`customer_email`);--> statement-breakpoint
CREATE INDEX `bookings_created_idx` ON `bookings` (`created_at`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`booking_id` integer NOT NULL,
	`method` text DEFAULT 'momo_pay' NOT NULL,
	`provider` text DEFAULT 'manual' NOT NULL,
	`merchant_code` text,
	`transaction_reference` text,
	`payer_phone` text,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`paid_at` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`submitted_at` text,
	`reviewed_at` text,
	`reviewed_by` integer,
	`rejection_reason` text,
	`refunded_at` text,
	`refund_amount` integer,
	`refund_reference` text,
	`admin_notes` text,
	`provider_payload` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "payments_amount_check" CHECK("payments"."amount" >= 0)
);
--> statement-breakpoint
CREATE INDEX `payments_booking_idx` ON `payments` (`booking_id`);--> statement-breakpoint
CREATE INDEX `payments_status_idx` ON `payments` (`status`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `payments_txn_idx` ON `payments` (`transaction_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_txn_live_uq` ON `payments` (`method`,`transaction_reference`) WHERE "payments"."transaction_reference" IS NOT NULL AND "payments"."status" IN ('submitted', 'verified', 'refunded');--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`bucket` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`bucket`, `window_start`)
);
--> statement-breakpoint
CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by` integer,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `tour_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tour_categories_slug_unique` ON `tour_categories` (`slug`);--> statement-breakpoint
CREATE TABLE `tour_departures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tour_id` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`departure_time` text,
	`return_time` text,
	`booking_deadline` text,
	`seat_capacity` integer,
	`seats_reserved` integer DEFAULT 0 NOT NULL,
	`adult_price_override` integer,
	`child_price_override` integer,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`tour_id`) REFERENCES `tours`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tour_departures_seats_check" CHECK("tour_departures"."seats_reserved" >= 0),
	CONSTRAINT "tour_departures_capacity_check" CHECK("tour_departures"."seat_capacity" IS NULL OR "tour_departures"."seats_reserved" <= "tour_departures"."seat_capacity")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tour_departures_tour_date_uq` ON `tour_departures` (`tour_id`,`start_date`);--> statement-breakpoint
CREATE INDEX `tour_departures_start_idx` ON `tour_departures` (`start_date`,`status`);--> statement-breakpoint
CREATE TABLE `tour_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tour_id` integer NOT NULL,
	`kind` text NOT NULL,
	`r2_key` text,
	`r2_key_small` text,
	`external_url` text,
	`alt_text` text DEFAULT '' NOT NULL,
	`width` integer,
	`height` integer,
	`content_type` text,
	`size_bytes` integer,
	`is_placeholder` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`tour_id`) REFERENCES `tours`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tour_images_source_check" CHECK("tour_images"."r2_key" IS NOT NULL OR "tour_images"."external_url" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `tour_images_tour_idx` ON `tour_images` (`tour_id`,`kind`,`sort_order`);--> statement-breakpoint
CREATE TABLE `tour_list_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tour_id` integer NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`tour_id`) REFERENCES `tours`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tour_list_items_tour_idx` ON `tour_list_items` (`tour_id`,`kind`,`sort_order`);--> statement-breakpoint
CREATE TABLE `tour_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tour_id` integer,
	`author_name` text NOT NULL,
	`author_location` text,
	`rating` integer NOT NULL,
	`title` text,
	`body` text NOT NULL,
	`is_published` integer DEFAULT false NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`tour_id`) REFERENCES `tours`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tour_reviews_rating_check" CHECK("tour_reviews"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE INDEX `tour_reviews_tour_idx` ON `tour_reviews` (`tour_id`,`is_published`);--> statement-breakpoint
CREATE TABLE `tours` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`short_description` text,
	`description` text,
	`category_id` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`is_popular` integer DEFAULT false NOT NULL,
	`destination` text NOT NULL,
	`country` text DEFAULT 'Rwanda' NOT NULL,
	`district_province` text,
	`location` text,
	`map_url` text,
	`latitude` real,
	`longitude` real,
	`operator_name` text DEFAULT 'Her Journey Tours and Travels' NOT NULL,
	`duration_text` text,
	`duration_days` integer,
	`departure_time` text,
	`return_time` text,
	`pickup_location` text,
	`meeting_point` text,
	`currency` text DEFAULT 'RWF' NOT NULL,
	`pricing_basis` text DEFAULT 'per_person' NOT NULL,
	`adult_price` integer NOT NULL,
	`child_price` integer,
	`discount_price` integer,
	`discount_percentage` integer,
	`additional_fees` integer DEFAULT 0 NOT NULL,
	`additional_fees_basis` text DEFAULT 'per_booking' NOT NULL,
	`additional_fees_note` text,
	`meals` text,
	`transportation` text,
	`entrance_fees` text,
	`guide_info` text,
	`special_requirements` text,
	`accommodation` text,
	`accessibility` text,
	`safety_instructions` text,
	`difficulty_level` text,
	`min_age` integer,
	`max_age` integer,
	`video_url` text,
	`booking_phone` text,
	`alternative_phone` text,
	`booking_email` text,
	`whatsapp_number` text,
	`max_group_size` integer,
	`min_participants` integer,
	`booking_open` integer DEFAULT true NOT NULL,
	`cancellation_policy` text,
	`terms` text,
	`seo_title` text,
	`seo_description` text,
	`published_at` text,
	`created_by` integer,
	`updated_by` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `tour_categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "tours_adult_price_check" CHECK("tours"."adult_price" >= 0),
	CONSTRAINT "tours_discount_pct_check" CHECK("tours"."discount_percentage" IS NULL OR ("tours"."discount_percentage" BETWEEN 0 AND 100))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tours_slug_unique` ON `tours` (`slug`);--> statement-breakpoint
CREATE INDEX `tours_status_idx` ON `tours` (`status`);--> statement-breakpoint
CREATE INDEX `tours_category_idx` ON `tours` (`category_id`);--> statement-breakpoint
CREATE INDEX `tours_country_idx` ON `tours` (`country`);