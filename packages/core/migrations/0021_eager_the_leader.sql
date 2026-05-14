CREATE TABLE `booths` (
	`event_id` text NOT NULL,
	`id` text NOT NULL,
	`section` text NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`exhibitor_user` text,
	`exhibitor_display_name` text,
	`primary_tweet_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`event_id`, `id`),
	FOREIGN KEY (`primary_tweet_id`) REFERENCES `tweets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `booths_event_id_idx` ON `booths` (`event_id`);--> statement-breakpoint
CREATE INDEX `booths_status_idx` ON `booths` (`status`);--> statement-breakpoint
CREATE INDEX `booths_primary_tweet_idx` ON `booths` (`primary_tweet_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tweets` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text DEFAULT 'cf21' NOT NULL,
	`user` text NOT NULL,
	`display_name` text,
	`timestamp` integer NOT NULL,
	`text` text NOT NULL,
	`tweet_url` text NOT NULL,
	`search_query` text,
	`matched_tags` text,
	`image_mask` integer DEFAULT 0 NOT NULL,
	`classification` text DEFAULT 'unknown' NOT NULL,
	`classification_reason` text,
	`classifier_prompt_version` text,
	`inferred_fandoms` text,
	`inferred_fandoms_confidence` text,
	`inferred_booth_id` text,
	`inferred_booth_id_confidence` text,
	`root_tweet_id` text,
	`parent_tweet_id` text,
	`thread_position` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted` integer
);
--> statement-breakpoint
INSERT INTO `__new_tweets`("id", "event_id", "user", "display_name", "timestamp", "text", "tweet_url", "search_query", "matched_tags", "image_mask", "classification", "classification_reason", "classifier_prompt_version", "inferred_fandoms", "inferred_fandoms_confidence", "inferred_booth_id", "inferred_booth_id_confidence", "root_tweet_id", "parent_tweet_id", "thread_position", "created_at", "updated_at", "deleted") SELECT "id", "event_id", "user", "display_name", "timestamp", "text", "tweet_url", "search_query", "matched_tags", "image_mask", "classification", "classification_reason", "classifier_prompt_version", "inferred_fandoms", "inferred_fandoms_confidence", "inferred_booth_id", "inferred_booth_id_confidence", "root_tweet_id", "parent_tweet_id", "thread_position", "created_at", "updated_at", "deleted" FROM `tweets`;--> statement-breakpoint
DROP TABLE `tweets`;--> statement-breakpoint
ALTER TABLE `__new_tweets` RENAME TO `tweets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `user_idx` ON `tweets` (`user`);--> statement-breakpoint
CREATE INDEX `deleted_idx` ON `tweets` (`deleted`);--> statement-breakpoint
CREATE INDEX `updated_at_idx` ON `tweets` (`updated_at`);--> statement-breakpoint
CREATE INDEX `classification_idx` ON `tweets` (`classification`);--> statement-breakpoint
CREATE INDEX `timestamp_idx` ON `tweets` (`timestamp`);--> statement-breakpoint
CREATE INDEX `event_id_idx` ON `tweets` (`event_id`);--> statement-breakpoint
CREATE INDEX `event_root_tweet_idx` ON `tweets` (`event_id`,`root_tweet_id`);--> statement-breakpoint
CREATE INDEX `event_root_thread_position_idx` ON `tweets` (`event_id`,`root_tweet_id`,`thread_position`,`id`);--> statement-breakpoint
CREATE INDEX `parent_tweet_idx` ON `tweets` (`parent_tweet_id`);--> statement-breakpoint
CREATE INDEX `event_updated_id_idx` ON `tweets` (`event_id`,`updated_at`,`id`);