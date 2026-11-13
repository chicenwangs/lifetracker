CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint_hash` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`created_at` text NOT NULL,
	`last_success_at` text,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_hash_unique` ON `push_subscriptions` (`endpoint_hash`);--> statement-breakpoint
CREATE INDEX `push_user` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`rule_kind` text NOT NULL,
	`rel_value` integer,
	`rel_unit` text,
	`at_time` text,
	`due_at` text,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`claimed_at` text,
	`sent_at` text,
	`seen_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reminders_source_type" CHECK(source_type IN ('planner_item','planner_block','keep_note','database_record')),
	CONSTRAINT "reminders_rule" CHECK(rule_kind IN ('relative','absolute')),
	CONSTRAINT "reminders_status" CHECK(status IN ('scheduled','processing','sent','failed','cancelled','missed'))
);
--> statement-breakpoint
CREATE INDEX `reminders_due` ON `reminders` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `reminders_source` ON `reminders` (`source_type`,`source_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `notify_planner` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `notify_keep` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `notify_pages` integer DEFAULT true NOT NULL;