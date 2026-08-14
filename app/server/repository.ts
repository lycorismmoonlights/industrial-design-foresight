import { getD1 } from "../../db";
import { isResearchStore, type ResearchStore } from "../model";
import {
  RECORD_KINDS,
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
  };
}

async function allRows(statement: D1PreparedStatement): Promise<Row[]> {
  const result = await statement.all<Row>();
  return result.results ?? [];
}

export async function bootstrap(ownerId: string, user: BootstrapDto["user"]): Promise<BootstrapDto> {
  const db = getD1();
  const [recordRows, sourceRows, inboxRows, evidenceRows, settingRows] = await Promise.all([
    allRows(db.prepare("SELECT * FROM records WHERE owner_id = ? ORDER BY updated_at DESC").bind(ownerId)),
    allRows(db.prepare("SELECT * FROM sources WHERE owner_id = ? ORDER BY name ASC").bind(ownerId)),
    allRows(db.prepare("SELECT * FROM inbox_items WHERE owner_id = ? ORDER BY created_at DESC LIMIT 200").bind(ownerId)),
    allRows(db.prepare("SELECT * FROM evidence WHERE owner_id = ? ORDER BY created_at DESC").bind(ownerId)),
    allRows(db.prepare("SELECT key, value_json FROM settings WHERE owner_id = ?").bind(ownerId)),
  ]);
  const inboxItems = inboxRows.map(inboxFromRow);
  return {
    user,
    records: recordRows.map(recordFromRow),
    sources: sourceRows.map(sourceFromRow),
    inboxStats: {
      pending: inboxItems.filter((item) => item.reviewStatus === "pending").length,
      reviewed: inboxItems.filter((item) => item.reviewStatus !== "pending").length,
    },
    inboxItems,
    evidence: evidenceRows.map(evidenceFromRow),
    settings: Object.fromEntries(settingRows.map((row) => [String(row.key), parseJson(row.value_json, null)])),
  };
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
  const item: RecordDto = {
    id: uuid(), kind: input.kind, status, title: input.title.trim(), summary: input.summary?.trim() ?? "",
    payload: input.payload ?? {}, revision: 1, createdAt: timestamp, updatedAt: timestamp,
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
  const timestamp = now();
  const status = patch.status ?? current.status;
  const next: RecordDto = {
    ...current,
    status,
    title: patch.title?.trim() ?? current.title,
    summary: patch.summary?.trim() ?? current.summary,
    payload: patch.payload ?? current.payload,
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
