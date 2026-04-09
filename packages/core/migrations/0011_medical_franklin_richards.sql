CREATE TABLE `scraper_state` (
	`id` text PRIMARY KEY NOT NULL,
	`last_seen_tweet_id` text,
	`last_run_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tweet_media` (
	`tweet_id` text NOT NULL,
	`media_index` integer NOT NULL,
	`r2_key` text NOT NULL,
	`source_url` text NOT NULL,
	`content_type` text,
	`width` integer,
	`height` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`tweet_id`, `media_index`),
	FOREIGN KEY (`tweet_id`) REFERENCES `tweets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tweet_media_key_idx` ON `tweet_media` (`r2_key`);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_tweets` (
	`id` text PRIMARY KEY NOT NULL,
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
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted` integer
);
--> statement-breakpoint
INSERT INTO `__new_tweets`(
	"id",
	"user",
	"display_name",
	"timestamp",
	"text",
	"tweet_url",
	"search_query",
	"matched_tags",
	"image_mask",
	"classification",
	"classification_reason",
	"classifier_prompt_version",
	"created_at",
	"updated_at",
	"deleted"
)
SELECT
	"id",
	"user",
	NULL,
	"timestamp",
	"text",
	'https://x.com/i/web/status/' || "id",
	NULL,
	NULL,
	"image_mask",
	CASE WHEN "image_mask" > 0 THEN 'catalogue' ELSE 'unknown' END,
	NULL,
	NULL,
	COALESCE("updated_at", "timestamp"),
	"updated_at",
	"deleted"
FROM `tweets`;
--> statement-breakpoint
DROP TABLE `tweets`;
--> statement-breakpoint
ALTER TABLE `__new_tweets` RENAME TO `tweets`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
CREATE INDEX `user_idx` ON `tweets` (`user`);
--> statement-breakpoint
CREATE INDEX `deleted_idx` ON `tweets` (`deleted`);
--> statement-breakpoint
CREATE INDEX `updated_at_idx` ON `tweets` (`updated_at`);
--> statement-breakpoint
CREATE INDEX `classification_idx` ON `tweets` (`classification`);
--> statement-breakpoint
CREATE INDEX `timestamp_idx` ON `tweets` (`timestamp`);
