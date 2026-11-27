-- v3.3 columns (ADD COLUMN only; no table rebuild, so users keeps COLLATE NOCASE and items keeps its CHECKs)
ALTER TABLE `items` ADD `repeat_from_completion` INTEGER NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `items` ADD `ics_uid` TEXT;--> statement-breakpoint
ALTER TABLE `item_types` ADD `on_calendar` INTEGER NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `users` ADD `digest_time` TEXT DEFAULT NULL CHECK (digest_time IS NULL OR digest_time GLOB '[0-2][0-9]:[0-5][0-9]');--> statement-breakpoint
CREATE UNIQUE INDEX `items_ics_uid` ON `items` (`calendar_id`, `ics_uid`) WHERE ics_uid IS NOT NULL AND deleted_at IS NULL;
