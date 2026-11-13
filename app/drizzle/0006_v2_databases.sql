CREATE TABLE `database_properties` (
	`id` text PRIMARY KEY NOT NULL,
	`database_id` text NOT NULL,
	`name` text NOT NULL,
	`property_type` text NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`position` real NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`database_id`) REFERENCES `page_databases`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "db_props_type" CHECK(property_type IN ('title','text','number','date','checkbox','select','multi_select','url')),
	CONSTRAINT "db_props_config" CHECK(json_valid(config_json))
);
--> statement-breakpoint
CREATE INDEX `db_props_db` ON `database_properties` (`database_id`,`position`);--> statement-breakpoint
CREATE TABLE `database_records` (
	`id` text PRIMARY KEY NOT NULL,
	`database_id` text NOT NULL,
	`page_id` text,
	`position` real NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`database_id`) REFERENCES `page_databases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `db_records_db` ON `database_records` (`database_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `db_records_page` ON `database_records` (`page_id`);--> statement-breakpoint
CREATE TABLE `database_values` (
	`record_id` text NOT NULL,
	`property_id` text NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`record_id`, `property_id`),
	FOREIGN KEY (`record_id`) REFERENCES `database_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`property_id`) REFERENCES `database_properties`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "db_values_json" CHECK(json_valid(value_json))
);
--> statement-breakpoint
CREATE TABLE `database_views` (
	`id` text PRIMARY KEY NOT NULL,
	`database_id` text NOT NULL,
	`name` text NOT NULL,
	`view_type` text DEFAULT 'table' NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`position` real NOT NULL,
	FOREIGN KEY (`database_id`) REFERENCES `page_databases`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "db_views_config" CHECK(json_valid(config_json))
);
--> statement-breakpoint
CREATE INDEX `db_views_db` ON `database_views` (`database_id`,`position`);--> statement-breakpoint
CREATE TABLE `page_databases` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`page_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `page_databases_owner` ON `page_databases` (`owner_id`);--> statement-breakpoint
CREATE INDEX `page_databases_page` ON `page_databases` (`page_id`);