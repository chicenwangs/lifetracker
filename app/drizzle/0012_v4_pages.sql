-- v4.0 M2, PR 15: page templates + covers, and reminders may now come from a page to-do (page_todo).
-- Reminders: rebuilt in one file so the CHECK gains 'page_todo'; every row is copied with its id and status.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_reminders` (
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
INSERT INTO `__new_reminders`("id", "owner_id", "source_type", "source_id", "rule_kind", "rel_value", "rel_unit", "at_time", "due_at", "status", "attempts", "last_error", "claimed_at", "sent_at", "seen_at", "created_at", "updated_at") SELECT "id", "owner_id", "source_type", "source_id", "rule_kind", "rel_value", "rel_unit", "at_time", "due_at", "status", "attempts", "last_error", "claimed_at", "sent_at", "seen_at", "created_at", "updated_at" FROM `reminders`;--> statement-breakpoint
DROP TABLE `reminders`;--> statement-breakpoint
ALTER TABLE `__new_reminders` RENAME TO `reminders`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `reminders_due` ON `reminders` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `reminders_source` ON `reminders` (`source_type`,`source_id`);--> statement-breakpoint
ALTER TABLE `pages` ADD `is_template` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- SQLite keeps the FK action only when it is part of the ADD COLUMN clause; drizzle drops it, so it is written here.
ALTER TABLE `pages` ADD `cover_attachment_id` text REFERENCES attachments(id) ON DELETE SET NULL;
