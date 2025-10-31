PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_replicache_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`client_group_id` text NOT NULL,
	`last_mutation_id` integer DEFAULT 0 NOT NULL,
	`last_modified_version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`client_group_id`) REFERENCES `replicache_client_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_replicache_clients`("id", "client_group_id", "last_mutation_id", "last_modified_version") SELECT "id", "client_group_id", "last_mutation_id", "last_modified_version" FROM `replicache_clients`;--> statement-breakpoint
DROP TABLE `replicache_clients`;--> statement-breakpoint
ALTER TABLE `__new_replicache_clients` RENAME TO `replicache_clients`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `user_with_mutation_idx` ON `replicache_clients` (`client_group_id`,`last_mutation_id`);