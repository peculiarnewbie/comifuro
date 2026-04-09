ALTER TABLE `tweets` ADD `event_id` text DEFAULT 'cf21' NOT NULL;
--> statement-breakpoint
CREATE INDEX `event_id_idx` ON `tweets` (`event_id`);
