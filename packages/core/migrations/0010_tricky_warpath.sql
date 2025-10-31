PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_replicache_client_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_replicache_client_groups`("id", "user_id") SELECT "id", "user_id" FROM `replicache_client_groups`;--> statement-breakpoint
DROP TABLE `replicache_client_groups`;--> statement-breakpoint
ALTER TABLE `__new_replicache_client_groups` RENAME TO `replicache_client_groups`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `user_client_group_idx` ON `replicache_client_groups` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_replicache_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`client_group_id` text NOT NULL,
	`last_mutation_id` integer DEFAULT 0 NOT NULL,
	`last_modified_version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`client_group_id`) REFERENCES `replicache_client_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_replicache_clients`("id", "client_group_id", "last_mutation_id", "last_modified_version") SELECT "id", "client_group_id", "last_mutation_id", "last_modified_version" FROM `replicache_clients`;--> statement-breakpoint
DROP TABLE `replicache_clients`;--> statement-breakpoint
ALTER TABLE `__new_replicache_clients` RENAME TO `replicache_clients`;--> statement-breakpoint
CREATE INDEX `group_with_mutation_idx` ON `replicache_clients` (`client_group_id`,`last_mutation_id`);--> statement-breakpoint
CREATE TABLE `__new_user_to_tweet` (
	`user_id` text NOT NULL,
	`tweet_id` text NOT NULL,
	`mark` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	`last_modified_version` integer DEFAULT 0 NOT NULL,
	`tags` text,
	PRIMARY KEY(`user_id`, `tweet_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tweet_id`) REFERENCES `tweets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_user_to_tweet`("user_id", "tweet_id", "mark", "created_at", "deleted", "updated_at", "last_modified_version", "tags") SELECT "user_id", "tweet_id", "mark", "created_at", "deleted", "updated_at", "last_modified_version", "tags" FROM `user_to_tweet`;--> statement-breakpoint
DROP TABLE `user_to_tweet`;--> statement-breakpoint
ALTER TABLE `__new_user_to_tweet` RENAME TO `user_to_tweet`;--> statement-breakpoint
CREATE INDEX `user_with_version_idx` ON `user_to_tweet` (`user_id`,`last_modified_version`);