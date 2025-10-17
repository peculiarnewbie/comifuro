DROP TABLE `replicache_client_groups`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_replicache_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`last_mutation_id` integer DEFAULT 0 NOT NULL,
	`last_modified_version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_replicache_clients`("id", "last_mutation_id", "last_modified_version") SELECT "id", "last_mutation_id", "last_modified_version" FROM `replicache_clients`;--> statement-breakpoint
DROP TABLE `replicache_clients`;--> statement-breakpoint
ALTER TABLE `__new_replicache_clients` RENAME TO `replicache_clients`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `user_with_version_idx` ON `user_to_tweet` (`user_id`,`last_modified_version`);