CREATE TABLE `pipeline_locks` (
	`lock_key` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`acquired_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pipeline_locks_expires` ON `pipeline_locks` (`expires_at`);--> statement-breakpoint
ALTER TABLE `pipeline_runs` ADD `trigger_type` text DEFAULT 'scheduled' NOT NULL;--> statement-breakpoint
ALTER TABLE `pipeline_runs` ADD `requested_by` text;