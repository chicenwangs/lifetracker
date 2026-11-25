-- v3.3 / v4.0 M1, PR 8: four new flags/ids, ADD COLUMN only (no table rebuild). All defaults keep the old behaviour.
ALTER TABLE `item_types` ADD `on_calendar` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `repeat_from_completion` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `ics_uid` text;--> statement-breakpoint
CREATE INDEX `items_cal_ics` ON `items` (`calendar_id`,`ics_uid`);--> statement-breakpoint
-- NULL = off; an unset digest keeps the v3.2 behaviour
ALTER TABLE `users` ADD `digest_time` text CHECK(digest_time IS NULL OR digest_time GLOB '[0-2][0-9]:[0-5][0-9]');
