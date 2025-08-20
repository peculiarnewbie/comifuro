CREATE TABLE `tweets` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`timestamp` integer NOT NULL,
	`text` text NOT NULL,
	`image_mask` integer DEFAULT 0 NOT NULL
);
