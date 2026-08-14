CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`source_name` text NOT NULL,
	`source_category` text NOT NULL,
	`credibility` integer NOT NULL,
	`relevance` integer NOT NULL,
	`stance` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`published_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_evidence_owner_created` ON `evidence` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `evidence_links` (
	`evidence_id` text NOT NULL,
	`record_id` text NOT NULL,
	`relation` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`evidence_id`, `record_id`, `relation`),
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_evidence_links_record` ON `evidence_links` (`record_id`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`file_hash` text NOT NULL,
	`counts_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_import_batches_owner_hash` ON `import_batches` (`owner_id`,`file_hash`);--> statement-breakpoint
CREATE TABLE `inbox_items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`source_id` text NOT NULL,
	`guid` text,
	`canonical_url` text,
	`content_hash` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`author` text,
	`published_at` text,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`reviewed_at` text,
	`record_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_inbox_owner_source_dedupe` ON `inbox_items` (`owner_id`,`source_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_inbox_owner_review_created` ON `inbox_items` (`owner_id`,`review_status`,`created_at`);--> statement-breakpoint
CREATE TABLE `record_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`change_reason` text,
	`changed_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_record_revisions_record_revision` ON `record_revisions` (`record_id`,`revision`);--> statement-breakpoint
CREATE INDEX `idx_record_revisions_owner_created` ON `record_revisions` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_records_owner_kind_status` ON `records` (`owner_id`,`kind`,`status`);--> statement-breakpoint
CREATE INDEX `idx_records_owner_updated` ON `records` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`owner_id` text NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `key`)
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`page_url` text,
	`feed_url` text,
	`source_type` text DEFAULT 'rss' NOT NULL,
	`source_category` text DEFAULT 'industry_media' NOT NULL,
	`default_credibility` integer DEFAULT 3 NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`etag` text,
	`last_modified` text,
	`last_fetch_at` text,
	`last_success_at` text,
	`last_error` text,
	`last_duration_ms` integer,
	`last_new_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sources_owner_feed_url` ON `sources` (`owner_id`,`feed_url`);--> statement-breakpoint
CREATE INDEX `idx_sources_owner_enabled` ON `sources` (`owner_id`,`enabled`);--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`source_id` text NOT NULL,
	`status` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`new_count` integer DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` text NOT NULL,
	`finished_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sync_runs_source_started` ON `sync_runs` (`source_id`,`started_at`);