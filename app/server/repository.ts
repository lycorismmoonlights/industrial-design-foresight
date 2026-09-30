import { getD1 } from "../../db";
import { isResearchStore, type ResearchStore } from "../model";
import {
  canonicalPayloadForRecord,
  RECORD_KINDS,
  summaryForV1,
  titleForV1,
  v1Collections,
  type BootstrapDto,
  type EvidenceDto,
  type InboxItemDto,
  type RecordDto,
  type RecordKind,
  type RecordStatus,
  type RevisionDto,
  type SourceDto,
} from "../v2-model";
import { AppError } from "./errors";

type Row = Record<string, unknown>;
const ALLOWED_STATUSES = new Set<RecordStatus>(["draft", "published", "archived"]);

function now() {
  return new Date().toISOString();
}

function uuid() {
  return crypto.randomUUID();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function recordFromRow(row: Row): RecordDto {
  return {
    id: String(row.id),
    kind: String(row.kind) as RecordKind,
    status: String(row.status) as RecordStatus,
    title: String(row.title),
    summary: String(row.summary ?? ""),
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    revision: Number(row.revision),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
  };
}

function sourceFromRow(row: Row): SourceDto {
  return {
    id: String(row.id),
    name: String(row.name),
    pageUrl: row.page_url ? String(row.page_url) : null,
    feedUrl: row.feed_url ? String(row.feed_url) : null,
    sourceType: String(row.source_type) as SourceDto["sourceType"],
    adapterType: String(row.adapter_type ?? "rss") as SourceDto["adapterType"],
    adapterConfig: parseJson<Record<string, unknown>>(row.adapter_config_json, {}),
    cadence: String(row.cadence ?? "daily") as SourceDto["cadence"],
    nextFetchAt: row.next_fetch_at ? String(row.next_fetch_at) : null,
    maxItemsPerRun: Number(row.max_items_per_run ?? 30),
    sourceCategory: String(row.source_category),
    defaultCredibility: Number(row.default_credibility),
    enabled: Boolean(row.enabled),
    lastFetchAt: row.last_fetch_at ? String(row.last_fetch_at) : null,
    lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    lastDurationMs: row.last_duration_ms === null || row.last_duration_ms === undefined ? null : Number(row.last_duration_ms),
    lastNewCount: Number(row.last_new_count ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function inboxFromRow(row: Row): InboxItemDto {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    title: String(row.title),
    summary: String(row.summary ?? ""),
    author: row.author ? String(row.author) : null,
    canonicalUrl: row.canonical_url ? String(row.canonical_url) : null,
    publishedAt: row.published_at ? String(row.published_at) : null,
    reviewStatus: String(row.review_status) as InboxItemDto["reviewStatus"],
    recordId: row.record_id ? String(row.record_id) : null,
    aiStatus: String(row.ai_status ?? "pending") as InboxItemDto["aiStatus"],
    aiSummary: row.ai_summary ? String(row.ai_summary) : null,
    aiQuadrant: row.ai_quadrant ? String(row.ai_quadrant) : null,
    aiRelevance: row.ai_relevance === null || row.ai_relevance === undefined ? null : Number(row.ai_relevance),
    aiStanceSuggestion: row.ai_stance_suggestion ? String(row.ai_stance_suggestion) as InboxItemDto["aiStanceSuggestion"] : null,
    aiTags: parseJson<string[]>(row.ai_tags_json, []),
    aiHypothesisLinks: parseJson<string[]>(row.ai_hypothesis_links_json, []),
    aiModel: row.ai_model ? String(row.ai_model) : null,
    aiProcessedAt: row.ai_processed_at ? String(row.ai_processed_at) : null,
    aiError: row.ai_error ? String(row.ai_error) : null,
    createdAt: String(row.created_at),
  };
}

function evidenceFromRow(row: Row): EvidenceDto {
  return {
    id: String(row.id),
    title: String(row.title),
    url: row.url ? String(row.url) : null,
    sourceName: String(row.source_name),
    sourceCategory: String(row.source_category),
    credibility: Number(row.credibility),
    relevance: Number(row.relevance),
    stance: String(row.stance) as EvidenceDto["stance"],
    note: String(row.note ?? ""),
    publishedAt: row.published_at ? String(row.published_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    links: [],
  };
}

async function allRows(statement: D1PreparedStatement): Promise<Row[]> {
  const result = await statement.all<Row>();
  return result.results ?? [];
}

export async function bootstrap(ownerId: string, user: BootstrapDto["user"]): Promise<BootstrapDto> {
  const db = getD1();
  const initializedAt = now();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO settings (owner_id, key, value_json, updated_at) VALUES (?, 'timezone', ?, ?)").bind(ownerId, JSON.stringify("Asia/Shanghai"), initializedAt),
    db.prepare("INSERT OR IGNORE INTO settings (owner_id, key, value_json, updated_at) VALUES (?, 'reviewCadence', ?, ?)").bind(ownerId, JSON.stringify("weekly"), initializedAt),
    db.prepare("INSERT OR IGNORE INTO settings (owner_id, key, value_json, updated_at) VALUES (?, 'reviewDay', ?, ?)").bind(ownerId, JSON.stringify(0), initializedAt),
    db.prepare("INSERT OR IGNORE INTO settings (owner_id, key, value_json, updated_at) VALUES (?, 'reviewMinutes', ?, ?)").bind(ownerId, JSON.stringify(30), initializedAt),
  ]);
  const [recordRows, sourceRows, inboxRows, inboxCountRow, evidenceRows, evidenceLinkRows, settingRows] = await Promise.all([
    allRows(db.prepare("SELECT * FROM records WHERE owner_id = ? ORDER BY updated_at DESC").bind(ownerId)),
    allRows(db.prepare("SELECT * FROM sources WHERE owner_id = ? ORDER BY name ASC").bind(ownerId)),
    allRows(db.prepare("SELECT * FROM inbox_items WHERE owner_id = ? ORDER BY created_at DESC LIMIT 200").bind(ownerId)),
    db.prepare("SELECT SUM(CASE WHEN review_status = 'pending' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN review_status != 'pending' THEN 1 ELSE 0 END) AS reviewed FROM inbox_items WHERE owner_id = ?").bind(ownerId).first<Row>(),
    allRows(db.prepare("SELECT * FROM evidence WHERE owner_id = ? ORDER BY created_at DESC").bind(ownerId)),
    allRows(db.prepare("SELECT link.evidence_id, link.record_id, link.relation FROM evidence_links AS link JOIN evidence AS evidence ON evidence.id = link.evidence_id WHERE evidence.owner_id = ?").bind(ownerId)),
    allRows(db.prepare("SELECT key, value_json FROM settings WHERE owner_id = ?").bind(ownerId)),
  ]);
  const inboxItems = inboxRows.map(inboxFromRow);
  return {
    user,
    records: recordRows.map(recordFromRow),
    sources: sourceRows.map(sourceFromRow),
    inboxStats: {
      pending: Number(inboxCountRow?.pending ?? 0),
      reviewed: Number(inboxCountRow?.reviewed ?? 0),
    },
    inboxItems,
    evidence: evidenceRows.map((row) => ({
      ...evidenceFromRow(row),
      links: evidenceLinkRows.filter((link) => link.evidence_id === row.id).map((link) => ({
        recordId: String(link.record_id),
        relation: String(link.relation) as EvidenceDto["links"][number]["relation"],
      })),
    })),
    settings: Object.fromEntries(settingRows.map((row) => [String(row.key), parseJson(row.value_json, null)])),
  };
}

export async function updateSettings(ownerId: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const allowed = new Set(["timezone", "reviewCadence", "reviewDay", "reviewMinutes"]);
  const entries = Object.entries(patch).filter(([key]) => allowed.has(key));
  if (!entries.length) throw new AppError(400, "SETTINGS_PATCH_REQUIRED", "没有可更新的个人设置。");
  if (patch.timezone !== undefined) {
    if (typeof patch.timezone !== "string") throw new AppError(400, "INVALID_TIMEZONE", "时区必须是 IANA 时区名称。");
    try { new Intl.DateTimeFormat("zh-CN", { timeZone: patch.timezone }).format(); } catch { throw new AppError(400, "INVALID_TIMEZONE", "时区必须是有效的 IANA 时区名称。"); }
  }
  if (patch.reviewCadence !== undefined && patch.reviewCadence !== "weekly") throw new AppError(400, "INVALID_REVIEW_CADENCE", "v0.3 仅支持每周复盘节奏。");
  if (patch.reviewDay !== undefined && (!Number.isInteger(patch.reviewDay) || Number(patch.reviewDay) < 0 || Number(patch.reviewDay) > 6)) throw new AppError(400, "INVALID_REVIEW_DAY", "复盘日必须在 0–6 之间。");
  if (patch.reviewMinutes !== undefined && (!Number.isInteger(patch.reviewMinutes) || Number(patch.reviewMinutes) < 15 || Number(patch.reviewMinutes) > 120)) throw new AppError(400, "INVALID_REVIEW_MINUTES", "复盘时长必须在 15–120 分钟之间。");
  const timestamp = now();
  const db = getD1();
  await db.batch(entries.map(([key, value]) => db.prepare("INSERT INTO settings (owner_id, key, value_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(owner_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at")
    .bind(ownerId, key, JSON.stringify(value), timestamp)));
  const rows = await allRows(db.prepare("SELECT key, value_json FROM settings WHERE owner_id = ?").bind(ownerId));
  return Object.fromEntries(rows.map((row) => [String(row.key), parseJson(row.value_json, null)]));
}

export async function createRecord(ownerId: string, actorEmail: string, input: {
  kind: RecordKind;
  status?: RecordStatus;
  title: string;
  summary?: string;
  payload?: Record<string, unknown>;
  changeReason?: string;
}): Promise<RecordDto> {
  if (!RECORD_KINDS.includes(input.kind)) throw new AppError(400, "INVALID_KIND", "未知记录类型。");
  const status = input.status ?? "published";
  if (!ALLOWED_STATUSES.has(status)) throw new AppError(400, "INVALID_STATUS", "未知记录状态。");
  if (!input.title.trim()) throw new AppError(400, "VALIDATION_ERROR", "标题不能为空。");
  if (input.kind === "hypothesis" && !input.changeReason?.trim()) {
    throw new AppError(400, "CHANGE_REASON_REQUIRED", "新建研究假设必须填写理由。");
  }
  const timestamp = now();
  const title = input.title.trim();
  const summary = input.summary === undefined ? summaryForV1(input.kind, input.payload ?? {}).trim() : input.summary.trim();
  const item: RecordDto = {
    id: uuid(), kind: input.kind, status, title, summary,
    payload: canonicalPayloadForRecord(input.kind, title, summary, input.payload ?? {}), revision: 1, createdAt: timestamp, updatedAt: timestamp,
    archivedAt: status === "archived" ? timestamp : null, deletedAt: null,
  };
  const db = getD1();
  await db.batch([
    db.prepare("INSERT INTO records (id, owner_id, kind, status, title, summary, payload_json, revision, created_at, updated_at, archived_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, NULL)")
      .bind(item.id, ownerId, item.kind, item.status, item.title, item.summary, JSON.stringify(item.payload), timestamp, timestamp, item.archivedAt),
    db.prepare("INSERT INTO record_revisions (id, record_id, owner_id, revision, snapshot_json, change_reason, changed_by, created_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)")
      .bind(uuid(), item.id, ownerId, JSON.stringify(item), input.changeReason?.trim() ?? "新建记录", actorEmail, timestamp),
  ]);
  return item;
}

async function ownedRecord(ownerId: string, id: string): Promise<RecordDto> {
  const row = await getD1().prepare("SELECT * FROM records WHERE id = ? AND owner_id = ?").bind(id, ownerId).first<Row>();
  if (!row) throw new AppError(404, "RECORD_NOT_FOUND", "记录不存在或不属于当前所有者。");
  return recordFromRow(row);
}

function hypothesisReasonRequired(current: RecordDto, patch: Partial<RecordDto>): boolean {
  if (current.kind !== "hypothesis") return false;
  const nextPayload = patch.payload ?? current.payload;
  return patch.title !== undefined && patch.title !== current.title
    || nextPayload.statement !== current.payload.statement
    || nextPayload.confidence !== current.payload.confidence
    || nextPayload.falsifier !== current.payload.falsifier;
}

export async function updateRecord(ownerId: string, actorEmail: string, id: string, expectedRevision: number, patch: {
  status?: RecordStatus;
  title?: string;
  summary?: string;
  payload?: Record<string, unknown>;
}, changeReason?: string): Promise<RecordDto> {
  const current = await ownedRecord(ownerId, id);
  if (current.revision !== expectedRevision) {
    throw new AppError(409, "REVISION_CONFLICT", "记录已在另一处更新，请刷新后重试。", { current });
  }
  if (patch.status && !ALLOWED_STATUSES.has(patch.status)) throw new AppError(400, "INVALID_STATUS", "未知记录状态。");
  if (patch.title !== undefined && !patch.title.trim()) throw new AppError(400, "VALIDATION_ERROR", "标题不能为空。");
  if (hypothesisReasonRequired(current, patch as Partial<RecordDto>) && !changeReason?.trim()) {
    throw new AppError(400, "CHANGE_REASON_REQUIRED", "修改假设、置信度或证伪条件时必须填写变更理由。");
  }
  const nextStatus = patch.status ?? current.status;
  if (current.kind === "signal" && current.status !== "published" && nextStatus === "published") {
    const nextPayload = patch.payload ?? current.payload;
    const allowedQuadrants = new Set(["需求与商业", "技术与工具", "制造与材料", "社会与规则"]);
    if (!allowedQuadrants.has(String(nextPayload.quadrant ?? ""))) {
      throw new AppError(400, "SIGNAL_QUADRANT_REQUIRED", "发布信号前必须选择有效象限。");
    }
    const link = await getD1().prepare("SELECT 1 AS linked FROM evidence_links AS link JOIN evidence AS evidence ON evidence.id = link.evidence_id WHERE link.record_id = ? AND evidence.owner_id = ? LIMIT 1")
      .bind(id, ownerId).first<Row>();
    if (!link) throw new AppError(400, "SIGNAL_EVIDENCE_REQUIRED", "发布信号前必须至少关联一条证据。");
  }
  const timestamp = now();
  const status = nextStatus;
  const title = patch.title?.trim() ?? current.title;
  const summary = patch.summary !== undefined
    ? patch.summary.trim()
    : patch.payload !== undefined
      ? summaryForV1(current.kind, patch.payload).trim()
      : current.summary;
  const next: RecordDto = {
    ...current,
    status,
    title,
    summary,
    payload: canonicalPayloadForRecord(current.kind, title, summary, patch.payload ?? current.payload),
    revision: current.revision + 1,
    updatedAt: timestamp,
    archivedAt: status === "archived" ? current.archivedAt ?? timestamp : null,
  };
  const db = getD1();
  const update = db.prepare("UPDATE records SET status = ?, title = ?, summary = ?, payload_json = ?, revision = ?, updated_at = ?, archived_at = ? WHERE id = ? AND owner_id = ? AND revision = ?")
    .bind(next.status, next.title, next.summary, JSON.stringify(next.payload), next.revision, timestamp, next.archivedAt, id, ownerId, expectedRevision);
  try {
    const [result] = await db.batch([
      update,
      db.prepare("INSERT INTO record_revisions (id, record_id, owner_id, revision, snapshot_json, change_reason, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(uuid(), id, ownerId, next.revision, JSON.stringify(next), changeReason?.trim() ?? "更新记录", actorEmail, timestamp),
    ]);
    if ((result.meta.changes ?? 0) !== 1) throw new AppError(409, "REVISION_CONFLICT", "记录已在另一处更新，请刷新后重试。");
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(409, "REVISION_CONFLICT", "记录已在另一处更新，请刷新后重试。");
  }
  return next;
}

export async function softDeleteRecord(ownerId: string, actorEmail: string, id: string, expectedRevision: number, restore = false, reason?: string): Promise<RecordDto> {
  const current = await ownedRecord(ownerId, id);
  if (current.revision !== expectedRevision) throw new AppError(409, "REVISION_CONFLICT", "记录版本冲突。", { current });
  const timestamp = now();
  const next: RecordDto = { ...current, revision: current.revision + 1, updatedAt: timestamp, deletedAt: restore ? null : timestamp };
  const db = getD1();
  try {
    const [result] = await db.batch([
      db.prepare("UPDATE records SET deleted_at = ?, revision = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND revision = ?")
        .bind(next.deletedAt, next.revision, timestamp, id, ownerId, expectedRevision),
      db.prepare("INSERT INTO record_revisions (id, record_id, owner_id, revision, snapshot_json, change_reason, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(uuid(), id, ownerId, next.revision, JSON.stringify(next), reason?.trim() ?? (restore ? "恢复记录" : "移入回收站"), actorEmail, timestamp),
    ]);
    if ((result.meta.changes ?? 0) !== 1) throw new AppError(409, "REVISION_CONFLICT", "记录版本冲突。");
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(409, "REVISION_CONFLICT", "记录版本冲突。");
  }
  return next;
}

export async function listRevisions(ownerId: string, recordId: string): Promise<RevisionDto[]> {
  await ownedRecord(ownerId, recordId);
  const rows = await allRows(getD1().prepare("SELECT * FROM record_revisions WHERE record_id = ? AND owner_id = ? ORDER BY revision DESC").bind(recordId, ownerId));
  return rows.map((row) => ({
    id: String(row.id), recordId: String(row.record_id), revision: Number(row.revision),
    snapshot: parseJson<RecordDto>(row.snapshot_json, {} as RecordDto),
    changeReason: row.change_reason ? String(row.change_reason) : null,
    changedBy: String(row.changed_by), createdAt: String(row.created_at),
  }));
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function importV1(ownerId: string, actorEmail: string, rawBody: string): Promise<{ batchId: string; counts: Record<string, number> }> {
  let value: unknown;
  try { value = JSON.parse(rawBody); } catch { throw new AppError(400, "INVALID_JSON", "导入文件不是有效 JSON。"); }
  if (!isResearchStore(value)) throw new AppError(400, "INVALID_V1_BACKUP", "文件不是有效的 ResearchStore v1 备份。");
  const fileHash = await sha256(rawBody);
  const db = getD1();
  const duplicate = await db.prepare("SELECT id FROM import_batches WHERE owner_id = ? AND file_hash = ?").bind(ownerId, fileHash).first<Row>();
  if (duplicate) throw new AppError(409, "IMPORT_ALREADY_APPLIED", "这个备份文件已经导入过。", { batchId: duplicate.id });

  const store = value as ResearchStore;
  const collections = v1Collections();
  const timestamp = now();
  const statements: D1PreparedStatement[] = [];
  const counts: Record<string, number> = {};
  for (const kind of RECORD_KINDS) {
    const items = store[collections[kind]] as unknown as Array<Record<string, unknown>>;
    counts[kind] = items.length;
    for (const source of items) {
      const id = uuid();
      const payload = { ...source };
      delete payload.id;
      const title = titleForV1(kind, source);
      const summary = String(source.summary ?? source.statement ?? source.note ?? source.body ?? "");
      const record: RecordDto = { id, kind, status: "published", title, summary, payload, revision: 1, createdAt: timestamp, updatedAt: timestamp, archivedAt: null, deletedAt: null };
      statements.push(
        db.prepare("INSERT INTO records (id, owner_id, kind, status, title, summary, payload_json, revision, created_at, updated_at) VALUES (?, ?, ?, 'published', ?, ?, ?, 1, ?, ?)")
          .bind(id, ownerId, kind, title, summary, JSON.stringify(payload), timestamp, timestamp),
        db.prepare("INSERT INTO record_revisions (id, record_id, owner_id, revision, snapshot_json, change_reason, changed_by, created_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)")
          .bind(uuid(), id, ownerId, JSON.stringify(record), "从 ResearchStore v1 导入", actorEmail, timestamp),
      );
    }
  }
  const batchId = uuid();
  statements.push(db.prepare("INSERT INTO import_batches (id, owner_id, file_hash, counts_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(batchId, ownerId, fileHash, JSON.stringify(counts), timestamp));
  await db.batch(statements);
  return { batchId, counts };
}

const V2_BACKUP_TABLES = [
  "records",
  "record_revisions",
  "sources",
  "inbox_items",
  "evidence",
  "settings",
  "import_batches",
  "sync_runs",
  "evidence_links",
] as const;

type V2BackupTable = (typeof V2_BACKUP_TABLES)[number];
type V2BackupData = Record<V2BackupTable, Row[]>;

function v2BackupData(rawBody: string): V2BackupData {
  let value: unknown;
  try { value = JSON.parse(rawBody); } catch { throw new AppError(400, "INVALID_JSON", "导入文件不是有效 JSON。"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError(400, "INVALID_V2_BACKUP", "文件不是有效的 v2 完整备份。");
  }
  const backup = value as { version?: unknown; data?: unknown };
  if (backup.version !== 2 || !backup.data || typeof backup.data !== "object" || Array.isArray(backup.data)) {
    throw new AppError(400, "INVALID_V2_BACKUP", "文件不是有效的 v2 完整备份。");
  }
  const source = backup.data as Record<string, unknown>;
  const data = {} as V2BackupData;
  let totalRows = 0;
  for (const table of V2_BACKUP_TABLES) {
    const rows = source[table];
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
      throw new AppError(400, "INVALID_V2_BACKUP", `v2 备份缺少有效的 ${table} 数据。`);
    }
    data[table] = rows as Row[];
    totalRows += rows.length;
  }
  if (totalRows > 20_000) throw new AppError(413, "IMPORT_TOO_LARGE", "v2 备份最多包含 20,000 行数据。");
  return data;
}

function requiredBackupString(row: Row, field: string, table: string): string {
  if (typeof row[field] !== "string" || !String(row[field]).trim()) {
    throw new AppError(400, "INVALID_V2_BACKUP", `${table}.${field} 缺失或无效。`);
  }
  return String(row[field]);
}

function backupIdMap(rows: Row[], table: string): Map<string, string> {
  const mapped = new Map<string, string>();
  for (const row of rows) {
    const id = requiredBackupString(row, "id", table);
    if (mapped.has(id)) throw new AppError(400, "INVALID_V2_BACKUP", `${table} 包含重复 ID。`);
    mapped.set(id, uuid());
  }
  return mapped;
}

function mappedBackupId(map: Map<string, string>, value: unknown, field: string): string {
  const mapped = typeof value === "string" ? map.get(value) : undefined;
  if (!mapped) throw new AppError(400, "INVALID_V2_BACKUP", `${field} 引用了备份中不存在的数据。`);
  return mapped;
}

function nullableBackupValue(value: unknown): unknown {
  return value === undefined ? null : value;
}

export async function importV2(ownerId: string, rawBody: string): Promise<{ counts: Record<V2BackupTable, number> }> {
  const data = v2BackupData(rawBody);
  const db = getD1();
  const existing = await db.prepare("SELECT (SELECT COUNT(*) FROM records WHERE owner_id = ?) + (SELECT COUNT(*) FROM sources WHERE owner_id = ?) + (SELECT COUNT(*) FROM inbox_items WHERE owner_id = ?) + (SELECT COUNT(*) FROM evidence WHERE owner_id = ?) AS count")
    .bind(ownerId, ownerId, ownerId, ownerId).first<{ count: number }>();
  if (Number(existing?.count ?? 0) > 0) {
    throw new AppError(409, "RESTORE_REQUIRES_EMPTY_DATABASE", "完整恢复仅允许写入空研究库，请先在独立空库中恢复。");
  }

  const recordIds = backupIdMap(data.records, "records");
  const revisionIds = backupIdMap(data.record_revisions, "record_revisions");
  const sourceIds = backupIdMap(data.sources, "sources");
  const inboxIds = backupIdMap(data.inbox_items, "inbox_items");
  const evidenceIds = backupIdMap(data.evidence, "evidence");
  const importBatchIds = backupIdMap(data.import_batches, "import_batches");
  const syncRunIds = backupIdMap(data.sync_runs, "sync_runs");
  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM settings WHERE owner_id = ?").bind(ownerId),
    db.prepare("DELETE FROM import_batches WHERE owner_id = ?").bind(ownerId),
  ];

  for (const row of data.records) {
    const kind = requiredBackupString(row, "kind", "records") as RecordKind;
    const status = requiredBackupString(row, "status", "records") as RecordStatus;
    if (!RECORD_KINDS.includes(kind) || !ALLOWED_STATUSES.has(status)) throw new AppError(400, "INVALID_V2_BACKUP", "records 包含未知类型或状态。");
    statements.push(db.prepare("INSERT INTO records (id, owner_id, kind, status, title, summary, payload_json, revision, created_at, updated_at, archived_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(mappedBackupId(recordIds, row.id, "records.id"), ownerId, kind, status, requiredBackupString(row, "title", "records"), String(row.summary ?? ""), String(row.payload_json ?? "{}"), Number(row.revision ?? 1), requiredBackupString(row, "created_at", "records"), requiredBackupString(row, "updated_at", "records"), nullableBackupValue(row.archived_at), nullableBackupValue(row.deleted_at)));
  }
  for (const row of data.record_revisions) {
    const recordId = mappedBackupId(recordIds, row.record_id, "record_revisions.record_id");
    let snapshot = parseJson<Record<string, unknown>>(row.snapshot_json, {});
    snapshot = { ...snapshot, id: recordId };
    statements.push(db.prepare("INSERT INTO record_revisions (id, record_id, owner_id, revision, snapshot_json, change_reason, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(mappedBackupId(revisionIds, row.id, "record_revisions.id"), recordId, ownerId, Number(row.revision ?? 1), JSON.stringify(snapshot), nullableBackupValue(row.change_reason), String(row.changed_by ?? "backup"), requiredBackupString(row, "created_at", "record_revisions")));
  }
  for (const row of data.sources) {
    statements.push(db.prepare("INSERT INTO sources (id, owner_id, name, page_url, feed_url, source_type, adapter_type, adapter_config_json, cadence, next_fetch_at, max_items_per_run, source_category, default_credibility, enabled, etag, last_modified, last_fetch_at, last_success_at, last_error, last_duration_ms, last_new_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(mappedBackupId(sourceIds, row.id, "sources.id"), ownerId, requiredBackupString(row, "name", "sources"), nullableBackupValue(row.page_url), nullableBackupValue(row.feed_url), String(row.source_type ?? "rss"), String(row.adapter_type ?? "rss"), String(row.adapter_config_json ?? "{}"), String(row.cadence ?? "daily"), nullableBackupValue(row.next_fetch_at), Number(row.max_items_per_run ?? 30), String(row.source_category ?? "industry_media"), Number(row.default_credibility ?? 3), Number(row.enabled ?? 0), nullableBackupValue(row.etag), nullableBackupValue(row.last_modified), nullableBackupValue(row.last_fetch_at), nullableBackupValue(row.last_success_at), nullableBackupValue(row.last_error), nullableBackupValue(row.last_duration_ms), Number(row.last_new_count ?? 0), requiredBackupString(row, "created_at", "sources"), requiredBackupString(row, "updated_at", "sources")));
  }
  for (const row of data.inbox_items) {
    const recordId = row.record_id == null ? null : mappedBackupId(recordIds, row.record_id, "inbox_items.record_id");
    const hypothesisLinks = parseJson<unknown[]>(row.ai_hypothesis_links_json, []).map((recordIdValue) => mappedBackupId(recordIds, recordIdValue, "inbox_items.ai_hypothesis_links_json"));
    statements.push(db.prepare("INSERT INTO inbox_items (id, owner_id, source_id, guid, canonical_url, content_hash, dedupe_key, title, summary, author, published_at, review_status, reviewed_at, record_id, ai_status, ai_summary, ai_quadrant, ai_relevance, ai_stance_suggestion, ai_tags_json, ai_hypothesis_links_json, ai_model, ai_prompt_version, ai_attempt_count, ai_started_at, ai_processed_at, ai_error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(mappedBackupId(inboxIds, row.id, "inbox_items.id"), ownerId, mappedBackupId(sourceIds, row.source_id, "inbox_items.source_id"), nullableBackupValue(row.guid), nullableBackupValue(row.canonical_url), requiredBackupString(row, "content_hash", "inbox_items"), requiredBackupString(row, "dedupe_key", "inbox_items"), requiredBackupString(row, "title", "inbox_items"), String(row.summary ?? ""), nullableBackupValue(row.author), nullableBackupValue(row.published_at), String(row.review_status ?? "pending"), nullableBackupValue(row.reviewed_at), recordId, String(row.ai_status ?? "pending"), nullableBackupValue(row.ai_summary), nullableBackupValue(row.ai_quadrant), nullableBackupValue(row.ai_relevance), nullableBackupValue(row.ai_stance_suggestion), String(row.ai_tags_json ?? "[]"), JSON.stringify(hypothesisLinks), nullableBackupValue(row.ai_model), nullableBackupValue(row.ai_prompt_version), Number(row.ai_attempt_count ?? 0), nullableBackupValue(row.ai_started_at), nullableBackupValue(row.ai_processed_at), nullableBackupValue(row.ai_error), requiredBackupString(row, "created_at", "inbox_items")));
  }
  for (const row of data.evidence) {
    statements.push(db.prepare("INSERT INTO evidence (id, owner_id, title, url, source_name, source_category, credibility, relevance, stance, note, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(mappedBackupId(evidenceIds, row.id, "evidence.id"), ownerId, requiredBackupString(row, "title", "evidence"), nullableBackupValue(row.url), requiredBackupString(row, "source_name", "evidence"), requiredBackupString(row, "source_category", "evidence"), Number(row.credibility), Number(row.relevance), requiredBackupString(row, "stance", "evidence"), String(row.note ?? ""), nullableBackupValue(row.published_at), requiredBackupString(row, "created_at", "evidence"), requiredBackupString(row, "updated_at", "evidence")));
  }
  for (const row of data.evidence_links) {
    statements.push(db.prepare("INSERT INTO evidence_links (evidence_id, record_id, relation, created_at) VALUES (?, ?, ?, ?)")
      .bind(mappedBackupId(evidenceIds, row.evidence_id, "evidence_links.evidence_id"), mappedBackupId(recordIds, row.record_id, "evidence_links.record_id"), requiredBackupString(row, "relation", "evidence_links"), requiredBackupString(row, "created_at", "evidence_links")));
  }
  for (const row of data.settings) {
    statements.push(db.prepare("INSERT INTO settings (owner_id, key, value_json, updated_at) VALUES (?, ?, ?, ?)")
      .bind(ownerId, requiredBackupString(row, "key", "settings"), requiredBackupString(row, "value_json", "settings"), requiredBackupString(row, "updated_at", "settings")));
  }
  for (const row of data.import_batches) {
    statements.push(db.prepare("INSERT INTO import_batches (id, owner_id, file_hash, counts_json, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(mappedBackupId(importBatchIds, row.id, "import_batches.id"), ownerId, requiredBackupString(row, "file_hash", "import_batches"), String(row.counts_json ?? "{}"), requiredBackupString(row, "created_at", "import_batches")));
  }
  for (const row of data.sync_runs) {
    statements.push(db.prepare("INSERT INTO sync_runs (id, owner_id, source_id, status, duration_ms, new_count, error, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(mappedBackupId(syncRunIds, row.id, "sync_runs.id"), ownerId, mappedBackupId(sourceIds, row.source_id, "sync_runs.source_id"), requiredBackupString(row, "status", "sync_runs"), Number(row.duration_ms ?? 0), Number(row.new_count ?? 0), nullableBackupValue(row.error), requiredBackupString(row, "started_at", "sync_runs"), requiredBackupString(row, "finished_at", "sync_runs")));
  }
  await db.batch(statements);
  return { counts: Object.fromEntries(V2_BACKUP_TABLES.map((table) => [table, data[table].length])) as Record<V2BackupTable, number> };
}

export async function exportAll(ownerId: string) {
  const db = getD1();
  const tables = ["records", "record_revisions", "sources", "inbox_items", "evidence", "settings", "import_batches", "sync_runs"] as const;
  const data: Record<string, Row[]> = {};
  for (const table of tables) {
    data[table] = await allRows(db.prepare(`SELECT * FROM ${table} WHERE owner_id = ?`).bind(ownerId));
  }
  data.evidence_links = await allRows(db.prepare("SELECT link.* FROM evidence_links AS link JOIN records AS record ON record.id = link.record_id WHERE record.owner_id = ?").bind(ownerId));
  return { version: 2, exportedAt: now(), data };
}
