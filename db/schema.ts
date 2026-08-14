import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const records = sqliteTable(
  "records",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("published"),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    payloadJson: text("payload_json").notNull().default("{}"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    archivedAt: text("archived_at"),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("idx_records_owner_kind_status").on(table.ownerId, table.kind, table.status),
    index("idx_records_owner_updated").on(table.ownerId, table.updatedAt),
  ],
);

export const recordRevisions = sqliteTable(
  "record_revisions",
  {
    id: text("id").primaryKey(),
    recordId: text("record_id").notNull().references(() => records.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    revision: integer("revision").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    changeReason: text("change_reason"),
    changedBy: text("changed_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_record_revisions_record_revision").on(table.recordId, table.revision),
    index("idx_record_revisions_owner_created").on(table.ownerId, table.createdAt),
  ],
);

export const sources = sqliteTable(
  "sources",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    pageUrl: text("page_url"),
    feedUrl: text("feed_url"),
    sourceType: text("source_type").notNull().default("rss"),
    sourceCategory: text("source_category").notNull().default("industry_media"),
    defaultCredibility: integer("default_credibility").notNull().default(3),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    etag: text("etag"),
    lastModified: text("last_modified"),
    lastFetchAt: text("last_fetch_at"),
    lastSuccessAt: text("last_success_at"),
    lastError: text("last_error"),
    lastDurationMs: integer("last_duration_ms"),
    lastNewCount: integer("last_new_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_sources_owner_feed_url").on(table.ownerId, table.feedUrl),
    index("idx_sources_owner_enabled").on(table.ownerId, table.enabled),
  ],
);

export const inboxItems = sqliteTable(
  "inbox_items",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    sourceId: text("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
    guid: text("guid"),
    canonicalUrl: text("canonical_url"),
    contentHash: text("content_hash").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    author: text("author"),
    publishedAt: text("published_at"),
    reviewStatus: text("review_status").notNull().default("pending"),
    reviewedAt: text("reviewed_at"),
    recordId: text("record_id").references(() => records.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_inbox_owner_source_dedupe").on(table.ownerId, table.sourceId, table.dedupeKey),
    index("idx_inbox_owner_review_created").on(table.ownerId, table.reviewStatus, table.createdAt),
  ],
);

export const evidence = sqliteTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    sourceName: text("source_name").notNull(),
    sourceCategory: text("source_category").notNull(),
    credibility: integer("credibility").notNull(),
    relevance: integer("relevance").notNull(),
    stance: text("stance").notNull(),
    note: text("note").notNull().default(""),
    publishedAt: text("published_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_evidence_owner_created").on(table.ownerId, table.createdAt)],
);

export const evidenceLinks = sqliteTable(
  "evidence_links",
  {
    evidenceId: text("evidence_id").notNull().references(() => evidence.id, { onDelete: "cascade" }),
    recordId: text("record_id").notNull().references(() => records.id, { onDelete: "cascade" }),
    relation: text("relation").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.evidenceId, table.recordId, table.relation] }),
    index("idx_evidence_links_record").on(table.recordId),
  ],
);

export const settings = sqliteTable(
  "settings",
  {
    ownerId: text("owner_id").notNull(),
    key: text("key").notNull(),
    valueJson: text("value_json").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.ownerId, table.key] })],
);

export const importBatches = sqliteTable(
  "import_batches",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    fileHash: text("file_hash").notNull(),
    countsJson: text("counts_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("idx_import_batches_owner_hash").on(table.ownerId, table.fileHash)],
);

export const syncRuns = sqliteTable(
  "sync_runs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    sourceId: text("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    durationMs: integer("duration_ms").notNull(),
    newCount: integer("new_count").notNull().default(0),
    error: text("error"),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at").notNull(),
  },
  (table) => [index("idx_sync_runs_source_started").on(table.sourceId, table.startedAt)],
);
