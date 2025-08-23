CREATE TABLE `tweets` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`timestamp` integer NOT NULL,
	`text` text NOT NULL,
	`image_mask` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_post_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tweet_id` text NOT NULL,
	`mark` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tweet_id`) REFERENCES `tweets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);