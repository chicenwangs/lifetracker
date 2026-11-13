CREATE TABLE `page_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`parent_block_id` text,
	`block_type` text NOT NULL,
	`position` real NOT NULL,
	`content_json` text NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "page_blocks_json" CHECK(json_valid(content_json))
);
--> statement-breakpoint
CREATE INDEX `page_blocks_page` ON `page_blocks` (`page_id`,`position`);--> statement-breakpoint
CREATE TABLE `page_links` (
	`id` text PRIMARY KEY NOT NULL,
	`source_page_id` text NOT NULL,
	`target_page_id` text NOT NULL,
	`source_block_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `page_links_unique` ON `page_links` (`source_block_id`,`target_page_id`);--> statement-breakpoint
CREATE INDEX `page_links_target` ON `page_links` (`target_page_id`);--> statement-breakpoint
CREATE INDEX `page_links_source` ON `page_links` (`source_page_id`);--> statement-breakpoint
CREATE TABLE `page_shortcuts` (
	`user_id` text NOT NULL,
	`page_id` text NOT NULL,
	`slot` integer NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `page_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "page_shortcuts_slot_range" CHECK(slot BETWEEN 0 AND 2)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `page_shortcuts_slot` ON `page_shortcuts` (`user_id`,`slot`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`parent_page_id` text,
	`title` text DEFAULT '' NOT NULL,
	`icon` text,
	`position` real NOT NULL,
	`archived_at` text,
	`archived_batch` text,
	`last_opened_at` text,
	`deleted_at` text,
	`deleted_batch` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text,
	`updated_by` text,
	`revision` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "pages_title_len" CHECK(length(title) <= 300)
);
--> statement-breakpoint
CREATE INDEX `pages_tree` ON `pages` (`owner_id`,`parent_page_id`,`position`);--> statement-breakpoint
CREATE INDEX `pages_archived` ON `pages` (`owner_id`,`archived_at`);--> statement-breakpoint
CREATE INDEX `pages_opened` ON `pages` (`owner_id`,`last_opened_at`);--> statement-breakpoint
-- hand-written (v2 P3, DESIGN §9): one FTS index for Keep + Pages. Replaces the never-wired search_fts (import-only).
-- archived = 1 rows are hidden unless asked for. Index ≠ permission: results are re-checked against owner_id.
DROP TABLE IF EXISTS `search_fts`;--> statement-breakpoint
CREATE VIRTUAL TABLE `content_search` USING fts5(owner_id UNINDEXED, kind UNINDEXED, ref_id UNINDEXED, archived UNINDEXED, title, body, tokenize='unicode61 remove_diacritics 2');
