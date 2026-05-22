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
	CONSTRAINT `booths_pk` PRIMARY KEY(`event_id`, `id`),
	CONSTRAINT `fk_booths_primary_tweet_id_tweets_id_fk` FOREIGN KEY (`primary_tweet_id`) REFERENCES `tweets`(`id`)
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`event_id` text NOT NULL,
	`user` text NOT NULL,
	`source_tweet_id` text NOT NULL,
	`type` text NOT NULL,
	`price` text,
	`fandom` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_items_source_tweet_id_tweets_id_fk` FOREIGN KEY (`source_tweet_id`) REFERENCES `tweets`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `replicache_client_groups` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	CONSTRAINT `fk_replicache_client_groups_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `replicache_clients` (
	`id` text PRIMARY KEY,
	`client_group_id` text NOT NULL,
	`last_mutation_id` integer DEFAULT 0 NOT NULL,
	`last_modified_version` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_replicache_clients_client_group_id_replicache_client_groups_id_fk` FOREIGN KEY (`client_group_id`) REFERENCES `replicache_client_groups`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `scraper_state` (
	`id` text PRIMARY KEY,
	`last_seen_tweet_id` text,
	`last_run_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tweet_media` (
	`tweet_id` text NOT NULL,
	`media_index` integer NOT NULL,
	`r2_key` text NOT NULL,
	`thumbnail_r2_key` text,
	`source_url` text NOT NULL,
	`content_type` text,
	`width` integer,
	`height` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `tweet_media_pk` PRIMARY KEY(`tweet_id`, `media_index`),
	CONSTRAINT `fk_tweet_media_tweet_id_tweets_id_fk` FOREIGN KEY (`tweet_id`) REFERENCES `tweets`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `tweets` (
	`id` text PRIMARY KEY,
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
	`inferred_item_types` text,
	`root_tweet_id` text,
	`parent_tweet_id` text,
	`thread_position` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted` integer
);
--> statement-breakpoint
CREATE TABLE `user_event_meta` (
	`user` text NOT NULL,
	`event_id` text NOT NULL,
	`booth_id` text,
	`preorder_deadline` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `user_event_meta_pk` PRIMARY KEY(`user`, `event_id`)
);
--> statement-breakpoint
CREATE TABLE `user_to_tweet` (
	`user_id` text NOT NULL,
	`tweet_id` text NOT NULL,
	`mark` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	`last_modified_version` integer DEFAULT 0 NOT NULL,
	`tags` text,
	CONSTRAINT `user_to_tweet_pk` PRIMARY KEY(`user_id`, `tweet_id`),
	CONSTRAINT `fk_user_to_tweet_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_user_to_tweet_tweet_id_tweets_id_fk` FOREIGN KEY (`tweet_id`) REFERENCES `tweets`(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY,
	`username` text UNIQUE,
	`email` text UNIQUE,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `booths_event_id_idx` ON `booths` (`event_id`);--> statement-breakpoint
CREATE INDEX `booths_status_idx` ON `booths` (`status`);--> statement-breakpoint
CREATE INDEX `booths_primary_tweet_idx` ON `booths` (`primary_tweet_id`);--> statement-breakpoint
CREATE INDEX `items_event_user_idx` ON `items` (`event_id`,`user`);--> statement-breakpoint
CREATE INDEX `items_source_tweet_idx` ON `items` (`source_tweet_id`);--> statement-breakpoint
CREATE INDEX `user_client_group_idx` ON `replicache_client_groups` (`user_id`);--> statement-breakpoint
CREATE INDEX `group_with_mutation_idx` ON `replicache_clients` (`client_group_id`,`last_mutation_id`);--> statement-breakpoint
CREATE INDEX `tweet_media_key_idx` ON `tweet_media` (`r2_key`);--> statement-breakpoint
CREATE INDEX `user_idx` ON `tweets` (`user`);--> statement-breakpoint
CREATE INDEX `deleted_idx` ON `tweets` (`deleted`);--> statement-breakpoint
CREATE INDEX `updated_at_idx` ON `tweets` (`updated_at`);--> statement-breakpoint
CREATE INDEX `classification_idx` ON `tweets` (`classification`);--> statement-breakpoint
CREATE INDEX `timestamp_idx` ON `tweets` (`timestamp`);--> statement-breakpoint
CREATE INDEX `event_id_idx` ON `tweets` (`event_id`);--> statement-breakpoint
CREATE INDEX `event_root_tweet_idx` ON `tweets` (`event_id`,`root_tweet_id`);--> statement-breakpoint
CREATE INDEX `event_root_thread_position_idx` ON `tweets` (`event_id`,`root_tweet_id`,`thread_position`,`id`);--> statement-breakpoint
CREATE INDEX `parent_tweet_idx` ON `tweets` (`parent_tweet_id`);--> statement-breakpoint
CREATE INDEX `event_updated_id_idx` ON `tweets` (`event_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `user_meta_event_idx` ON `user_event_meta` (`event_id`);--> statement-breakpoint
CREATE INDEX `user_with_version_idx` ON `user_to_tweet` (`user_id`,`last_modified_version`);