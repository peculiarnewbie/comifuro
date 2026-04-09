ALTER TABLE `tweets` ADD `root_tweet_id` text;
--> statement-breakpoint
ALTER TABLE `tweets` ADD `parent_tweet_id` text;
--> statement-breakpoint
ALTER TABLE `tweets` ADD `thread_position` integer;
--> statement-breakpoint
CREATE INDEX `event_root_tweet_idx` ON `tweets` (`event_id`,`root_tweet_id`);
--> statement-breakpoint
CREATE INDEX `event_root_thread_position_idx` ON `tweets` (`event_id`,`root_tweet_id`,`thread_position`,`id`);
--> statement-breakpoint
CREATE INDEX `parent_tweet_idx` ON `tweets` (`parent_tweet_id`);
