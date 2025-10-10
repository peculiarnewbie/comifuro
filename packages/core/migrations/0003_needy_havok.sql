DROP INDEX `timestamp_idx`;--> statement-breakpoint
ALTER TABLE `tweets` ADD `updated_at` integer;--> statement-breakpoint
ALTER TABLE `tweets` ADD `deleted` integer;--> statement-breakpoint
CREATE INDEX `deleted_idx` ON `tweets` (`deleted`);--> statement-breakpoint
CREATE INDEX `updated_at_idx` ON `tweets` (`updated_at`);