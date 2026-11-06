-- Hand patched (drizzle-kit cannot express): items_cal_range COALESCE expr, users.username COLLATE NOCASE.
CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `blocks` (
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
	CONSTRAINT "blocks_type" CHECK(type IS NULL OR type IN ('Work','Exam','Event','Hobby','Dating')),
	CONSTRAINT "blocks_status" CHECK(status IN ('todo','doing','done')),
	CONSTRAINT "blocks_start_z" CHECK(start_at LIKE '%Z'),
	CONSTRAINT "blocks_end_z" CHECK(end_at LIKE '%Z'),
	CONSTRAINT "blocks_range" CHECK(end_at > start_at),
	CONSTRAINT "blocks_exdates_json" CHECK(exdates IS NULL OR json_valid(exdates))
);
--> statement-breakpoint
CREATE INDEX `blocks_cal_start` ON `blocks` (`calendar_id`,`start_at`);--> statement-breakpoint
CREATE INDEX `blocks_item` ON `blocks` (`item_id`);--> statement-breakpoint
CREATE TABLE `calendars` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendars_one_default` ON `calendars` (`owner_id`) WHERE is_default = 1;--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`source_ref` text,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "courses_aliases_json" CHECK(json_valid(aliases))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `courses_owner_code` ON `courses` (`owner_id`,`code`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`period` text NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "goals_period" CHECK(period GLOB '[0-9][0-9][0-9][0-9]-Q[1-4]')
);
--> statement-breakpoint
CREATE INDEX `goals_owner` ON `goals` (`owner_id`,`period`);--> statement-breakpoint
CREATE TABLE `grants` (
	`id` text PRIMARY KEY NOT NULL,
	`calendar_id` text NOT NULL,
	`grantee_id` text NOT NULL,
	`permission` text NOT NULL,
	`visible_types` text NOT NULL,
	`hidden_as` text NOT NULL,
	`in_overlap` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grantee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "grants_perm" CHECK(permission IN ('view','edit')),
	CONSTRAINT "grants_types_json" CHECK(json_valid(visible_types)),
	CONSTRAINT "grants_hidden" CHECK(hidden_as IN ('busy','none'))
);
--> statement-breakpoint
CREATE INDEX `grants_grantee` ON `grants` (`grantee_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `grants_cal_grantee` ON `grants` (`calendar_id`,`grantee_id`);--> statement-breakpoint
CREATE TABLE `ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`channel` text NOT NULL,
	`stage` text DEFAULT 'idea' NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ideas_stage" CHECK(stage IN ('idea','filmed','edited','posted'))
);
--> statement-breakpoint
CREATE INDEX `ideas_owner` ON `ideas` (`owner_id`,`stage`,`sort`);--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`label` text,
	`created_by` text,
	`expires_at` text NOT NULL,
	`used_by` text,
	`used_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`used_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_code_hash_unique` ON `invites` (`code_hash`);--> statement-breakpoint
CREATE TABLE `items` (
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
	CONSTRAINT "items_type" CHECK(type IS NULL OR type IN ('Work','Exam','Event','Hobby','Dating')),
	CONSTRAINT "items_status" CHECK(status IN ('todo','doing','done')),
	CONSTRAINT "items_date_fmt" CHECK(date IS NULL OR date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "items_time_fmt" CHECK(time IS NULL OR time GLOB '[0-2][0-9]:[0-5][0-9]'),
	CONSTRAINT "items_end_date" CHECK(end_date IS NULL OR (date IS NOT NULL AND end_date >= date)),
	CONSTRAINT "items_exdates_json" CHECK(exdates IS NULL OR json_valid(exdates)),
	CONSTRAINT "items_source" CHECK(source IS NULL OR source = 'notion')
);
--> statement-breakpoint
CREATE INDEX `items_cal_range` ON `items` (`calendar_id`,`date`,COALESCE(`end_date`, `date`));--> statement-breakpoint
CREATE INDEX `items_parent` ON `items` (`parent_id`);--> statement-breakpoint
CREATE INDEX `items_course` ON `items` (`course_id`);--> statement-breakpoint
CREATE TABLE `list_items` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`note` text,
	`link` text,
	`item_id` text,
	`created_at` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `list_items_list` ON `list_items` (`list_id`,`sort`);--> statement-breakpoint
CREATE TABLE `lists` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lists_owner` ON `lists` (`owner_id`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "people_aliases_json" CHECK(json_valid(aliases))
);
--> statement-breakpoint
CREATE INDEX `people_owner` ON `people` (`owner_id`);--> statement-breakpoint
CREATE TABLE `person_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`category` text NOT NULL,
	`text` text NOT NULL,
	`detail` text,
	`item_id` text,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "facts_category" CHECK(category IN ('likes','info','hates','wants','bucket_list','misc'))
);
--> statement-breakpoint
CREATE INDEX `facts_person` ON `person_facts` (`person_id`,`category`);--> statement-breakpoint
CREATE TABLE `places` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`city` text NOT NULL,
	`areas` text DEFAULT '[]' NOT NULL,
	`cuisines` text DEFAULT '[]' NOT NULL,
	`open_when` text DEFAULT '[]' NOT NULL,
	`closed_on` text DEFAULT '[]' NOT NULL,
	`halal` integer DEFAULT false NOT NULL,
	`visited` integer DEFAULT false NOT NULL,
	`approved` integer DEFAULT false NOT NULL,
	`rating` integer,
	`notes` text,
	`last_visited` text,
	`deleted_at` text,
	`deleted_batch` text,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "places_areas_json" CHECK(json_valid(areas)),
	CONSTRAINT "places_cuisines_json" CHECK(json_valid(cuisines)),
	CONSTRAINT "places_open_json" CHECK(json_valid(open_when)),
	CONSTRAINT "places_closed_json" CHECK(json_valid(closed_on)),
	CONSTRAINT "places_rating" CHECK(rating IS NULL OR rating BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE INDEX `places_owner` ON `places` (`owner_id`,`city`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`window_start` text NOT NULL,
	`locked_until` text
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`remember` integer NOT NULL,
	`expires_at` text NOT NULL,
	`absolute_expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`user_agent` text,
	`ip` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `share_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`calendar_id` text NOT NULL,
	`created_by` text,
	`key_hash` text NOT NULL,
	`permission` text NOT NULL,
	`visible_types` text NOT NULL,
	`hidden_as` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_by` text,
	`used_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`used_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "share_keys_perm" CHECK(permission IN ('view','edit')),
	CONSTRAINT "share_keys_types_json" CHECK(json_valid(visible_types)),
	CONSTRAINT "share_keys_hidden" CHECK(hidden_as IN ('busy','none'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_keys_key_hash_unique` ON `share_keys` (`key_hash`);--> statement-breakpoint
CREATE TABLE `step_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`steps` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "step_templates_json" CHECK(json_valid(steps))
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL COLLATE NOCASE,
	`display_name` text NOT NULL,
	`password_hash` text,
	`role` text DEFAULT 'member' NOT NULL,
	`color` text DEFAULT '#1C1917' NOT NULL,
	`timezone` text DEFAULT 'Asia/Kuala_Lumpur' NOT NULL,
	`overlap_on` integer DEFAULT true NOT NULL,
	`ics_token_hash` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')) NOT NULL,
	CONSTRAINT "users_role" CHECK(role IN ('admin','member'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `workout_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`date` text NOT NULL,
	`exercise` text NOT NULL,
	`weight_kg` real,
	`effort` text,
	`sets` integer,
	`reps` integer,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "wlogs_effort" CHECK(effort IS NULL OR effort IN ('light','moderate','heavy'))
);
--> statement-breakpoint
CREATE INDEX `wlogs_owner_date` ON `workout_logs` (`owner_id`,`date`);--> statement-breakpoint
CREATE TABLE `workout_split` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`exercise` text NOT NULL,
	`sort` integer NOT NULL,
	`current_kg` real,
	`current_effort` text,
	`legacy_weeks` text,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "wsplit_weekday" CHECK(weekday BETWEEN 1 AND 7),
	CONSTRAINT "wsplit_effort" CHECK(current_effort IS NULL OR current_effort IN ('light','moderate','heavy')),
	CONSTRAINT "wsplit_legacy_json" CHECK(legacy_weeks IS NULL OR json_valid(legacy_weeks))
);
--> statement-breakpoint
CREATE INDEX `wsplit_owner` ON `workout_split` (`owner_id`,`weekday`);