CREATE TABLE `attachment_refs` (
	`id` text PRIMARY KEY NOT NULL,
	`attachment_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachment_refs_unique` ON `attachment_refs` (`attachment_id`,`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `attachment_refs_source` ON `attachment_refs` (`source_type`,`source_id`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "attachments_status" CHECK(status IN ('uploading','ready','failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_storage_key_unique` ON `attachments` (`storage_key`);--> statement-breakpoint
CREATE INDEX `attachments_owner` ON `attachments` (`owner_id`);--> statement-breakpoint
CREATE TABLE `item_types` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`bg` text NOT NULL,
	`ink` text NOT NULL,
	`slug` text NOT NULL,
	`position` integer NOT NULL,
	`builtin` integer DEFAULT false NOT NULL,
	`share_default` integer DEFAULT false NOT NULL,
	`counts_down` integer DEFAULT false NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "item_types_name_len" CHECK(length(name) BETWEEN 1 AND 30),
	CONSTRAINT "item_types_slug" CHECK(slug GLOB '[a-z0-9]*' AND length(slug) BETWEEN 1 AND 20)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_types_owner_key` ON `item_types` (`owner_id`,`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `item_types_owner_slug` ON `item_types` (`owner_id`,slug COLLATE NOCASE);--> statement-breakpoint
CREATE UNIQUE INDEX `item_types_one_default` ON `item_types` (`owner_id`) WHERE is_default = 1;--> statement-breakpoint
CREATE TABLE `undo_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`rows` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`undone_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "undo_rows_json" CHECK(json_valid(rows))
);
--> statement-breakpoint
CREATE INDEX `undo_user` ON `undo_actions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `undo_expires` ON `undo_actions` (`expires_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`calendar_id` text NOT NULL,
	`item_id` text,
	`label` text NOT NULL,
	`type` text,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`rrule` text,
	`exdates` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text,
	`deleted_at` text,
	`deleted_batch` text,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "blocks_status" CHECK(status IN ('todo','doing','done')),
	CONSTRAINT "blocks_start_z" CHECK(start_at LIKE '%Z'),
	CONSTRAINT "blocks_end_z" CHECK(end_at LIKE '%Z'),
	CONSTRAINT "blocks_range" CHECK(end_at > start_at),
	CONSTRAINT "blocks_exdates_json" CHECK(exdates IS NULL OR json_valid(exdates))
);
--> statement-breakpoint
INSERT INTO `__new_blocks`("id", "calendar_id", "item_id", "label", "type", "start_at", "end_at", "status", "rrule", "exdates", "created_at", "updated_at", "updated_by", "deleted_at", "deleted_batch") SELECT "id", "calendar_id", "item_id", "label", "type", "start_at", "end_at", "status", "rrule", "exdates", "created_at", "updated_at", "updated_by", "deleted_at", "deleted_batch" FROM `blocks`;--> statement-breakpoint
DROP TABLE `blocks`;--> statement-breakpoint
ALTER TABLE `__new_blocks` RENAME TO `blocks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `blocks_cal_start` ON `blocks` (`calendar_id`,`start_at`);--> statement-breakpoint
CREATE INDEX `blocks_item` ON `blocks` (`item_id`);--> statement-breakpoint
CREATE TABLE `__new_items` (
	`id` text PRIMARY KEY NOT NULL,
	`calendar_id` text NOT NULL,
	`title` text NOT NULL,
	`type` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`date` text,
	`time` text,
	`end_date` text,
	`course_id` text,
	`parent_id` text,
	`notes` text,
	`private` integer DEFAULT false NOT NULL,
	`rrule` text,
	`exdates` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` text,
	`deleted_batch` text,
	`source` text,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "items_title_len" CHECK(length(title) BETWEEN 1 AND 300),
	CONSTRAINT "items_status" CHECK(status IN ('todo','doing','done')),
	CONSTRAINT "items_date_fmt" CHECK(date IS NULL OR date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "items_time_fmt" CHECK(time IS NULL OR time GLOB '[0-2][0-9]:[0-5][0-9]'),
	CONSTRAINT "items_end_date" CHECK(end_date IS NULL OR (date IS NOT NULL AND end_date >= date)),
	CONSTRAINT "items_exdates_json" CHECK(exdates IS NULL OR json_valid(exdates)),
	CONSTRAINT "items_source" CHECK(source IS NULL OR source = 'notion')
);
--> statement-breakpoint
INSERT INTO `__new_items`("id", "calendar_id", "title", "type", "status", "date", "time", "end_date", "course_id", "parent_id", "notes", "private", "rrule", "exdates", "started_at", "completed_at", "created_at", "updated_at", "created_by", "updated_by", "deleted_at", "deleted_batch", "source") SELECT "id", "calendar_id", "title", "type", "status", "date", "time", "end_date", "course_id", "parent_id", "notes", "private", "rrule", "exdates", "started_at", "completed_at", "created_at", "updated_at", "created_by", "updated_by", "deleted_at", "deleted_batch", "source" FROM `items`;--> statement-breakpoint
DROP TABLE `items`;--> statement-breakpoint
ALTER TABLE `__new_items` RENAME TO `items`;--> statement-breakpoint
CREATE INDEX `items_cal_range` ON `items` (`calendar_id`,`date`,COALESCE(end_date, date));--> statement-breakpoint
CREATE INDEX `items_parent` ON `items` (`parent_id`);--> statement-breakpoint
CREATE INDEX `items_course` ON `items` (`course_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `theme_mode` text DEFAULT 'auto' NOT NULL CHECK(theme_mode IN ('light','dark','auto'));--> statement-breakpoint
ALTER TABLE `users` ADD `theme_light_start` text DEFAULT '07:00' NOT NULL CHECK(theme_light_start GLOB '[0-2][0-9]:[0-5][0-9]');--> statement-breakpoint
ALTER TABLE `users` ADD `theme_dark_start` text DEFAULT '17:00' NOT NULL CHECK(theme_dark_start GLOB '[0-2][0-9]:[0-5][0-9]');--> statement-breakpoint
ALTER TABLE `users` ADD `tour_state` text DEFAULT 'new' NOT NULL CHECK(tour_state IN ('new','skipped','done'));--> statement-breakpoint
ALTER TABLE `users` ADD `region` text DEFAULT 'my' NOT NULL CHECK(region IN ('my','us'));--> statement-breakpoint
ALTER TABLE `users` ADD `qa_target` text DEFAULT 'timeline' NOT NULL CHECK(qa_target IN ('timeline','calendar'));--> statement-breakpoint
ALTER TABLE `users` ADD `block_min` integer DEFAULT 60 NOT NULL CHECK(block_min IN (15,30,45,60,90));--> statement-breakpoint
ALTER TABLE `users` ADD `visible_hours` text DEFAULT '7-24' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `hidden_types` text DEFAULT '[]' NOT NULL CHECK(json_valid(hidden_types));--> statement-breakpoint
-- hand-written (v2 P1): existing accounts keep their look, skip the tour, get the 5 built-in types.
-- Built-in keys = the v1 values already stored in items.type / blocks.type / share codes, so no data rewrite.
UPDATE `users` SET `theme_mode` = `theme`, `tour_state` = 'done';--> statement-breakpoint
INSERT INTO `item_types` (`id`, `owner_id`, `key`, `name`, `bg`, `ink`, `slug`, `position`, `builtin`, `share_default`, `counts_down`, `is_default`, `created_at`, `updated_at`)
SELECT 'ity_' || lower(hex(randomblob(8))), u.`id`, t.k, t.n, t.bg, t.ink, t.slug, t.pos, 1, t.share, t.cd, t.def,
	strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')
FROM `users` u CROSS JOIN (
	SELECT 'Work' AS k, 'Work' AS n, '#CED3EE' AS bg, '#00003D' AS ink, 'work' AS slug, 0 AS pos, 0 AS share, 0 AS cd, 0 AS def
	UNION ALL SELECT 'Exam', 'Deadline', '#B84A44', '#FFFFFF', 'deadline', 1, 0, 1, 0
	UNION ALL SELECT 'Event', 'Event', '#D3EECE', '#00003D', 'event', 2, 1, 0, 1
	UNION ALL SELECT 'Hobby', 'Hobby', '#FAEDB8', '#00003D', 'hobby', 3, 0, 0, 0
	UNION ALL SELECT 'Dating', 'Date', '#EECFD4', '#00003D', 'date', 4, 1, 0, 0
) t;
