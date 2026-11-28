-- v4.0 migration 0012 (D-V4-09): pages template flag + cover attachment, and one rebuild of `reminders`
-- so its source_type CHECK also accepts page todos. ADD COLUMN only on pages, so its indexes and
-- pages_title_len CHECK are untouched; the rebuild copies every row as-is (same order, same ids).
ALTER TABLE `pages` ADD `is_template` INTEGER NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `pages` ADD `cover_attachment_id` TEXT REFERENCES attachments(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE TABLE `reminders_new` (
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
	CONSTRAINT "reminders_source_type" CHECK(source_type IN ('planner_item','planner_block','keep_note','database_record','page_todo')),
	CONSTRAINT "reminders_rule" CHECK(rule_kind IN ('relative','absolute')),
	CONSTRAINT "reminders_status" CHECK(status IN ('scheduled','processing','sent','failed','cancelled','missed'))
);
--> statement-breakpoint
INSERT INTO reminders_new SELECT * FROM reminders;--> statement-breakpoint
DROP TABLE `reminders`;--> statement-breakpoint
ALTER TABLE `reminders_new` RENAME TO `reminders`;--> statement-breakpoint
CREATE INDEX `reminders_due` ON `reminders` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `reminders_source` ON `reminders` (`source_type`,`source_id`);
