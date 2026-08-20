CREATE TABLE `pipeline_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`slot_key` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text DEFAULT 'running' NOT NULL,
	`source_count` integer DEFAULT 0 NOT NULL,
	`source_success_count` integer DEFAULT 0 NOT NULL,
	`source_failure_count` integer DEFAULT 0 NOT NULL,
	`new_count` integer DEFAULT 0 NOT NULL,
	`ai_status` text DEFAULT 'not_started' NOT NULL,
	`ai_processed_count` integer DEFAULT 0 NOT NULL,
	`ai_failure_count` integer DEFAULT 0 NOT NULL,
	`error` text,
	`metrics_json` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pipeline_runs_slot_key` ON `pipeline_runs` (`slot_key`);--> statement-breakpoint
CREATE INDEX `idx_pipeline_runs_scheduled` ON `pipeline_runs` (`scheduled_at`);--> statement-breakpoint
ALTER TABLE `inbox_items` ADD `ai_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `inbox_items` ADD `ai_summary` text;--> statement-breakpoint
ALTER TABLE `inbox_items` ADD `ai_quadrant` text;--> statement-breakpoint
ALTER TABLE `inbox_items` ADD `ai_relevance` integer;--> statement-breakpoint
ALTER TABLE `inbox_items` ADD `ai_stance_suggestion` text;--> statement-breakpoint
ALTER TABLE `inbox_items` ADD `ai_tags_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `inbox_items` ADD `ai_hypothesis_links_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `inbox_items` ADD `ai_model` text;--> statement-breakpoint
ALTER TABLE `inbox_items` ADD `ai_prompt_version` text;--> statement-breakpoint
ALTER TABLE `inbox_items` ADD `ai_attempt_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `inbox_items` ADD `ai_started_at` text;--> statement-breakpoint
ALTER TABLE `inbox_items` ADD `ai_processed_at` text;--> statement-breakpoint
ALTER TABLE `inbox_items` ADD `ai_error` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `adapter_type` text DEFAULT 'rss' NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `adapter_config_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `cadence` text DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `next_fetch_at` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `max_items_per_run` integer DEFAULT 30 NOT NULL;