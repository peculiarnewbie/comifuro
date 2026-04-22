CREATE TABLE `booths` (
	`event_id` text NOT NULL,
	`id` text NOT NULL,
	`section` text NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`exhibitor_user` text,
	`exhibitor_display_name` text,
	`primary_tweet_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`event_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `booths_event_id_idx` ON `booths` (`event_id`);--> statement-breakpoint
CREATE INDEX `booths_status_idx` ON `booths` (`status`);--> statement-breakpoint
CREATE INDEX `booths_primary_tweet_idx` ON `booths` (`primary_tweet_id`);
