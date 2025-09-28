ALTER TABLE `user_post_relations` RENAME TO `user_to_tweet`;--> statement-breakpoint
CREATE TABLE `replicache_client_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `replicache_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`client_group_id` text,
	`last_mutation_id` integer DEFAULT 0 NOT NULL,
	`last_modified_version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`client_group_id`) REFERENCES `replicache_client_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_to_tweet` (
	`user_id` text NOT NULL,
	`tweet_id` text NOT NULL,
	`mark` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `tweet_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tweet_id`) REFERENCES `tweets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_user_to_tweet`("user_id", "tweet_id", "mark", "created_at", "deleted", "updated_at") SELECT "user_id", "tweet_id", "mark", "created_at", "deleted", "updated_at" FROM `user_to_tweet`;--> statement-breakpoint
DROP TABLE `user_to_tweet`;--> statement-breakpoint
ALTER TABLE `__new_user_to_tweet` RENAME TO `user_to_tweet`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `users` ADD `version` integer NOT NULL;--> statement-breakpoint
CREATE INDEX `timestamp_idx` ON `tweets` (`timestamp`);