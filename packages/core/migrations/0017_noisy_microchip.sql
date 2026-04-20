PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text,
	`email` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "username", "email", "created_at", "updated_at", "version", "is_admin") SELECT "id", "username", "email", "created_at", "updated_at", "version", "is_admin" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `tweet_media` ADD `thumbnail_r2_key` text;--> statement-breakpoint
ALTER TABLE `tweets` ADD `event_id` text DEFAULT 'cf21' NOT NULL;--> statement-breakpoint
ALTER TABLE `tweets` ADD `inferred_fandoms` text;--> statement-breakpoint
ALTER TABLE `tweets` ADD `inferred_booth_id` text;--> statement-breakpoint
ALTER TABLE `tweets` ADD `root_tweet_id` text;--> statement-breakpoint
ALTER TABLE `tweets` ADD `parent_tweet_id` text;--> statement-breakpoint
ALTER TABLE `tweets` ADD `thread_position` integer;--> statement-breakpoint
CREATE INDEX `event_id_idx` ON `tweets` (`event_id`);--> statement-breakpoint
CREATE INDEX `event_root_tweet_idx` ON `tweets` (`event_id`,`root_tweet_id`);--> statement-breakpoint
CREATE INDEX `event_root_thread_position_idx` ON `tweets` (`event_id`,`root_tweet_id`,`thread_position`,`id`);--> statement-breakpoint
CREATE INDEX `parent_tweet_idx` ON `tweets` (`parent_tweet_id`);--> statement-breakpoint
CREATE INDEX `event_updated_id_idx` ON `tweets` (`event_id`,`updated_at`,`id`);