CREATE TABLE `keep_note_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`grantee_id` text NOT NULL,
	`permission` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `keep_notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grantee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "keep_note_shares_permission" CHECK(permission IN ('view','edit'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `keep_note_shares_unique` ON `keep_note_shares` (`note_id`,`grantee_id`);--> statement-breakpoint
CREATE INDEX `keep_note_shares_grantee` ON `keep_note_shares` (`grantee_id`);--> statement-breakpoint
CREATE TABLE `page_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`grantee_id` text NOT NULL,
	`permission` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grantee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "page_shares_permission" CHECK(permission IN ('view','edit'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `page_shares_unique` ON `page_shares` (`page_id`,`grantee_id`);--> statement-breakpoint
CREATE INDEX `page_shares_grantee` ON `page_shares` (`grantee_id`);