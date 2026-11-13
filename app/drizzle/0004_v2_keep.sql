CREATE TABLE `keep_binders` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`position` real NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `keep_binders_owner` ON `keep_binders` (`owner_id`,`position`);--> statement-breakpoint
CREATE TABLE `keep_checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`parent_item_id` text,
	`text` text DEFAULT '' NOT NULL,
	`checked` integer DEFAULT false NOT NULL,
	`position` real NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `keep_notes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "keep_items_text_len" CHECK(length(text) <= 1000)
);
--> statement-breakpoint
CREATE INDEX `keep_items_note` ON `keep_checklist_items` (`note_id`,`position`);--> statement-breakpoint
CREATE TABLE `keep_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`position` real NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `keep_labels_owner_name` ON `keep_labels` (`owner_id`,name COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `keep_note_binders` (
	`note_id` text NOT NULL,
	`binder_id` text NOT NULL,
	`position` real NOT NULL,
	PRIMARY KEY(`note_id`, `binder_id`),
	FOREIGN KEY (`note_id`) REFERENCES `keep_notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`binder_id`) REFERENCES `keep_binders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `keep_nb_binder` ON `keep_note_binders` (`binder_id`,`position`);--> statement-breakpoint
CREATE TABLE `keep_note_labels` (
	`note_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`note_id`, `label_id`),
	FOREIGN KEY (`note_id`) REFERENCES `keep_notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `keep_labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `keep_nl_label` ON `keep_note_labels` (`label_id`);--> statement-breakpoint
CREATE TABLE `keep_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`note_type` text DEFAULT 'text' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`color` text,
	`pinned` integer DEFAULT false NOT NULL,
	`position` real NOT NULL,
	`archived_at` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "keep_notes_type" CHECK(note_type IN ('text','checklist')),
	CONSTRAINT "keep_notes_title_len" CHECK(length(title) <= 300),
	CONSTRAINT "keep_notes_body_len" CHECK(length(body) <= 20000)
);
--> statement-breakpoint
CREATE INDEX `keep_notes_list` ON `keep_notes` (`owner_id`,`deleted_at`,`archived_at`,`pinned`,`position`);