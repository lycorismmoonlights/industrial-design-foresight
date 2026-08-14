import { getD1 } from "../../db";
import type { EvidenceDto, SourceDto } from "../v2-model";
import { AppError } from "./errors";
import { discoverFeedUrl, parseFeed } from "./feed";
import { assertPublicHttpUrl, safeFetchText } from "./network-safety";
import { createRecord } from "./repository";

type Row = Record<string, unknown>;
const SOURCE_TYPES = new Set(["rss", "atom", "manual"]);
const STANCES = new Set(["supports", "opposes", "context"]);

function now() {
  return new Date().toISOString();
}

function uuid() {
  return crypto.randomUUID();
}

function asOptionalUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return assertPublicHttpUrl(String(value)).toString();
}

function oneToFive(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 5) {
    throw new AppError(400, "VALIDATION_ERROR", `${field} 必须是 1–5 的整数。`);
  }
  return number;
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

async function ownedSource(ownerId: string, id: string): Promise<Row> {
  const row = await getD1().prepare("SELECT * FROM sources WHERE id = ? AND owner_id = ?").bind(id, ownerId).first<Row>();
  if (!row) throw new AppError(404, "SOURCE_NOT_FOUND", "来源不存在或不属于当前所有者。");
  return row;
}

export async function listSources(ownerId: string): Promise<SourceDto[]> {
  const result = await getD1().prepare("SELECT * FROM sources WHERE owner_id = ? ORDER BY name ASC").bind(ownerId).all<Row>();
  return (result.results ?? []).map(sourceFromRow);
}

export async function createSource(ownerId: string, input: {
  name: string;
  pageUrl?: string | null;
  feedUrl?: string | null;
  sourceType?: SourceDto["sourceType"];
  sourceCategory?: string;
  defaultCredibility?: number;
  enabled?: boolean;
  confirmEnable?: boolean;
}): Promise<SourceDto> {
  const name = input.name?.trim();
  if (!name) throw new AppError(400, "VALIDATION_ERROR", "来源名称不能为空。");
  let pageUrl = asOptionalUrl(input.pageUrl);
  let feedUrl = asOptionalUrl(input.feedUrl);
  if (!pageUrl && !feedUrl) throw new AppError(400, "SOURCE_URL_REQUIRED", "至少填写网页地址或订阅地址。");
  if (!feedUrl && pageUrl) {
    const { response, body, finalUrl } = await safeFetchText(pageUrl, { headers: { accept: "text/html,application/xhtml+xml" } });
    if (!response.ok) throw new AppError(502, "SOURCE_DISCOVERY_FAILED", `网页返回 HTTP ${response.status}。`);
    pageUrl = finalUrl;
    feedUrl = await discoverFeedUrl(body, finalUrl);
  }
  const sourceType = feedUrl ? (input.sourceType === "atom" ? "atom" : "rss") : "manual";
  if (!SOURCE_TYPES.has(sourceType)) throw new AppError(400, "INVALID_SOURCE_TYPE", "未知来源类型。");
  if (input.enabled && !input.confirmEnable) {
    throw new AppError(400, "SOURCE_ENABLE_CONFIRMATION_REQUIRED", "首次启用来源必须明确确认。");
  }
  const timestamp = now();
  const id = uuid();
  try {
    await getD1().prepare("INSERT INTO sources (id, owner_id, name, page_url, feed_url, source_type, source_category, default_credibility, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, ownerId, name, pageUrl, feedUrl, sourceType, input.sourceCategory?.trim() || "industry_media", oneToFive(input.defaultCredibility ?? 3, "默认可信度"), input.enabled ? 1 : 0, timestamp, timestamp).run();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(409, "SOURCE_ALREADY_EXISTS", "这个订阅地址已经存在。");
  }
  return sourceFromRow((await ownedSource(ownerId, id)));
}

export async function updateSource(ownerId: string, id: string, patch: {
  name?: string;
  pageUrl?: string | null;
  feedUrl?: string | null;
  sourceCategory?: string;
  defaultCredibility?: number;
  enabled?: boolean;
  confirmEnable?: boolean;
}): Promise<SourceDto> {
  const current = await ownedSource(ownerId, id);
  if (patch.enabled === true && !current.enabled && !patch.confirmEnable) {
    throw new AppError(400, "SOURCE_ENABLE_CONFIRMATION_REQUIRED", "首次启用来源必须明确确认。");
  }
  const name = patch.name === undefined ? String(current.name) : patch.name.trim();
  if (!name) throw new AppError(400, "VALIDATION_ERROR", "来源名称不能为空。");
  const pageUrl = patch.pageUrl === undefined ? (current.page_url ? String(current.page_url) : null) : asOptionalUrl(patch.pageUrl);
  const feedUrl = patch.feedUrl === undefined ? (current.feed_url ? String(current.feed_url) : null) : asOptionalUrl(patch.feedUrl);
  const sourceType = feedUrl ? String(current.source_type === "atom" ? "atom" : "rss") : "manual";
  const timestamp = now();
  await getD1().prepare("UPDATE sources SET name = ?, page_url = ?, feed_url = ?, source_type = ?, source_category = ?, default_credibility = ?, enabled = ?, updated_at = ? WHERE id = ? AND owner_id = ?")
    .bind(name, pageUrl, feedUrl, sourceType, patch.sourceCategory?.trim() || String(current.source_category), oneToFive(patch.defaultCredibility ?? current.default_credibility, "默认可信度"), patch.enabled === undefined ? Number(current.enabled) : patch.enabled ? 1 : 0, timestamp, id, ownerId).run();
  return sourceFromRow((await ownedSource(ownerId, id)));
}

export interface FetchSourceResult {
  sourceId: string;
  status: "success" | "not_modified" | "failed";
  newCount: number;
  durationMs: number;
  error?: string;
}

async function recordSync(ownerId: string, sourceId: string, startedAt: string, status: FetchSourceResult["status"], durationMs: number, newCount: number, error: string | null) {
  const finishedAt = now();
  const success = status !== "failed";
  await getD1().batch([
    getD1().prepare("UPDATE sources SET last_fetch_at = ?, last_success_at = CASE WHEN ? = 1 THEN ? ELSE last_success_at END, last_error = ?, last_duration_ms = ?, last_new_count = ?, updated_at = ? WHERE id = ? AND owner_id = ?")
      .bind(finishedAt, success ? 1 : 0, finishedAt, error, durationMs, newCount, finishedAt, sourceId, ownerId),
    getD1().prepare("INSERT INTO sync_runs (id, owner_id, source_id, status, duration_ms, new_count, error, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(uuid(), ownerId, sourceId, status, durationMs, newCount, error, startedAt, finishedAt),
  ]);
}

export async function fetchSource(ownerId: string, sourceId: string): Promise<FetchSourceResult> {
  const source = await ownedSource(ownerId, sourceId);
  if (!source.feed_url) throw new AppError(400, "SOURCE_HAS_NO_FEED", "这个来源没有可抓取的 RSS/Atom 地址。");
  const startedAt = now();
  const started = Date.now();
  try {
    const headers = new Headers({
      accept: "application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9",
      "user-agent": "IndustrialDesignForesight/0.2 (+private research feed reader)",
    });
    if (source.etag) headers.set("if-none-match", String(source.etag));
    if (source.last_modified) headers.set("if-modified-since", String(source.last_modified));
    const fetched = await safeFetchText(String(source.feed_url), { headers });
    const durationMs = Date.now() - started;
    if (fetched.response.status === 304) {
      await recordSync(ownerId, sourceId, startedAt, "not_modified", durationMs, 0, null);
      return { sourceId, status: "not_modified", newCount: 0, durationMs };
    }
    if (!fetched.response.ok) throw new AppError(502, "SOURCE_HTTP_ERROR", `来源返回 HTTP ${fetched.response.status}。`);
    const feed = await parseFeed(fetched.body, fetched.finalUrl);
    const db = getD1();
    const existingResult = await db.prepare("SELECT guid, canonical_url, content_hash FROM inbox_items WHERE owner_id = ? AND source_id = ?").bind(ownerId, sourceId).all<Row>();
    const existing = existingResult.results ?? [];
    const guids = new Set(existing.map((row) => row.guid ? String(row.guid) : "").filter(Boolean));
    const urls = new Set(existing.map((row) => row.canonical_url ? String(row.canonical_url) : "").filter(Boolean));
    const hashes = new Set(existing.map((row) => String(row.content_hash)));
    const timestamp = now();
    const inserts: D1PreparedStatement[] = [];
    for (const entry of feed.entries) {
      if ((entry.guid && guids.has(entry.guid)) || (entry.canonicalUrl && urls.has(entry.canonicalUrl)) || hashes.has(entry.contentHash)) continue;
      const dedupeKey = entry.guid ? `guid:${entry.guid}` : entry.canonicalUrl ? `url:${entry.canonicalUrl}` : `hash:${entry.contentHash}`;
      inserts.push(db.prepare("INSERT INTO inbox_items (id, owner_id, source_id, guid, canonical_url, content_hash, dedupe_key, title, summary, author, published_at, review_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)")
        .bind(uuid(), ownerId, sourceId, entry.guid, entry.canonicalUrl, entry.contentHash, dedupeKey, entry.title, entry.summary, entry.author, entry.publishedAt, timestamp));
      if (entry.guid) guids.add(entry.guid);
      if (entry.canonicalUrl) urls.add(entry.canonicalUrl);
      hashes.add(entry.contentHash);
    }
    if (inserts.length) await db.batch(inserts);
    await db.prepare("UPDATE sources SET source_type = ?, etag = ?, last_modified = ? WHERE id = ? AND owner_id = ?")
      .bind(feed.type, fetched.response.headers.get("etag"), fetched.response.headers.get("last-modified"), sourceId, ownerId).run();
    await recordSync(ownerId, sourceId, startedAt, "success", durationMs, inserts.length, null);
    return { sourceId, status: "success", newCount: inserts.length, durationMs };
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = error instanceof Error ? error.message : "未知抓取错误";
    await recordSync(ownerId, sourceId, startedAt, "failed", durationMs, 0, message);
    if (error instanceof AppError) throw error;
    throw new AppError(502, "SOURCE_FETCH_FAILED", message);
  }
}

export async function fetchAllEnabledSources(): Promise<FetchSourceResult[]> {
  const result = await getD1().prepare("SELECT owner_id, id FROM sources WHERE enabled = 1 AND feed_url IS NOT NULL ORDER BY owner_id, name").all<Row>();
  const outcomes: FetchSourceResult[] = [];
  for (const row of result.results ?? []) {
    try {
      outcomes.push(await fetchSource(String(row.owner_id), String(row.id)));
    } catch (error) {
      outcomes.push({
        sourceId: String(row.id),
        status: "failed",
        newCount: 0,
        durationMs: 0,
        error: error instanceof Error ? error.message : "未知抓取错误",
      });
    }
  }
  return outcomes;
}

export async function reviewInboxItem(ownerId: string, actorEmail: string, id: string, input: {
  action: "reject" | "ignore" | "convert";
  sourceCategory?: string;
  credibility?: number;
  relevance?: number;
  stance?: EvidenceDto["stance"];
  note?: string;
}): Promise<{ recordId: string | null; evidenceId: string | null }> {
  const db = getD1();
  const item = await db.prepare("SELECT item.*, source.name AS source_name, source.source_category, source.default_credibility FROM inbox_items AS item JOIN sources AS source ON source.id = item.source_id WHERE item.id = ? AND item.owner_id = ?")
    .bind(id, ownerId).first<Row>();
  if (!item) throw new AppError(404, "INBOX_ITEM_NOT_FOUND", "待审核条目不存在。");
  if (item.review_status !== "pending") throw new AppError(409, "INBOX_ALREADY_REVIEWED", "这个条目已经审核过。");
  if (input.action === "reject" || input.action === "ignore") {
    await db.prepare("UPDATE inbox_items SET review_status = ?, reviewed_at = ? WHERE id = ? AND owner_id = ? AND review_status = 'pending'")
      .bind(input.action === "reject" ? "rejected" : "ignored", now(), id, ownerId).run();
    return { recordId: null, evidenceId: null };
  }
  if (input.action !== "convert") throw new AppError(400, "INVALID_REVIEW_ACTION", "未知审核动作。");
  const stance = input.stance ?? "context";
  if (!STANCES.has(stance)) throw new AppError(400, "INVALID_STANCE", "证据立场必须是支持、反对或背景。");
  const record = await createRecord(ownerId, actorEmail, {
    kind: "signal",
    status: "draft",
    title: String(item.title),
    summary: String(item.summary ?? ""),
    payload: {
      title: String(item.title),
      summary: String(item.summary ?? ""),
      quadrant: "",
      ring: "关注",
      movement: "稳定",
      impact: 0,
      confidence: 50,
      sourceName: String(item.source_name),
      sourceUrl: item.canonical_url ? String(item.canonical_url) : "",
      observedAt: item.published_at ? String(item.published_at).slice(0, 10) : now().slice(0, 10),
      tags: [],
    },
    changeReason: "由订阅待审核箱转为信号草稿",
  });
  const timestamp = now();
  const evidenceId = uuid();
  await db.batch([
    db.prepare("INSERT INTO evidence (id, owner_id, title, url, source_name, source_category, credibility, relevance, stance, note, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(evidenceId, ownerId, String(item.title), item.canonical_url ?? null, String(item.source_name), input.sourceCategory?.trim() || String(item.source_category), oneToFive(input.credibility ?? item.default_credibility, "可信度"), oneToFive(input.relevance ?? 3, "相关度"), stance, input.note?.trim() ?? "", item.published_at ?? null, timestamp, timestamp),
    db.prepare("INSERT INTO evidence_links (evidence_id, record_id, relation, created_at) VALUES (?, ?, ?, ?)")
      .bind(evidenceId, record.id, stance, timestamp),
    db.prepare("UPDATE inbox_items SET review_status = 'converted', reviewed_at = ?, record_id = ? WHERE id = ? AND owner_id = ? AND review_status = 'pending'")
      .bind(timestamp, record.id, id, ownerId),
  ]);
  return { recordId: record.id, evidenceId };
}

export async function createEvidence(ownerId: string, input: {
  title: string;
  url?: string | null;
  sourceName: string;
  sourceCategory: string;
  credibility: number;
  relevance: number;
  stance: EvidenceDto["stance"];
  note?: string;
  publishedAt?: string | null;
  recordId?: string | null;
}): Promise<EvidenceDto> {
  if (!input.title?.trim() || !input.sourceName?.trim() || !input.sourceCategory?.trim()) {
    throw new AppError(400, "VALIDATION_ERROR", "证据标题、来源名称和来源类别不能为空。");
  }
  if (!STANCES.has(input.stance)) throw new AppError(400, "INVALID_STANCE", "未知证据立场。");
  const url = asOptionalUrl(input.url);
  const db = getD1();
  if (input.recordId) {
    const record = await db.prepare("SELECT id FROM records WHERE id = ? AND owner_id = ?").bind(input.recordId, ownerId).first<Row>();
    if (!record) throw new AppError(404, "RECORD_NOT_FOUND", "要关联的记录不存在。");
  }
  const timestamp = now();
  const id = uuid();
  const statements = [db.prepare("INSERT INTO evidence (id, owner_id, title, url, source_name, source_category, credibility, relevance, stance, note, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, ownerId, input.title.trim(), url, input.sourceName.trim(), input.sourceCategory.trim(), oneToFive(input.credibility, "可信度"), oneToFive(input.relevance, "相关度"), input.stance, input.note?.trim() ?? "", input.publishedAt ?? null, timestamp, timestamp)];
  if (input.recordId) statements.push(db.prepare("INSERT INTO evidence_links (evidence_id, record_id, relation, created_at) VALUES (?, ?, ?, ?)").bind(id, input.recordId, input.stance, timestamp));
  await db.batch(statements);
  const row = await db.prepare("SELECT * FROM evidence WHERE id = ? AND owner_id = ?").bind(id, ownerId).first<Row>();
  return evidenceFromRow(row!);
}

export async function updateEvidence(ownerId: string, id: string, patch: Partial<{
  title: string; url: string | null; sourceName: string; sourceCategory: string;
  credibility: number; relevance: number; stance: EvidenceDto["stance"]; note: string; publishedAt: string | null;
}>): Promise<EvidenceDto> {
  const db = getD1();
  const current = await db.prepare("SELECT * FROM evidence WHERE id = ? AND owner_id = ?").bind(id, ownerId).first<Row>();
  if (!current) throw new AppError(404, "EVIDENCE_NOT_FOUND", "证据不存在。");
  const stance = patch.stance ?? String(current.stance) as EvidenceDto["stance"];
  if (!STANCES.has(stance)) throw new AppError(400, "INVALID_STANCE", "未知证据立场。");
  const title = patch.title?.trim() ?? String(current.title);
  const sourceName = patch.sourceName?.trim() ?? String(current.source_name);
  const sourceCategory = patch.sourceCategory?.trim() ?? String(current.source_category);
  if (!title || !sourceName || !sourceCategory) throw new AppError(400, "VALIDATION_ERROR", "证据必填字段不能为空。");
  await db.prepare("UPDATE evidence SET title = ?, url = ?, source_name = ?, source_category = ?, credibility = ?, relevance = ?, stance = ?, note = ?, published_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?")
    .bind(title, patch.url === undefined ? current.url : asOptionalUrl(patch.url), sourceName, sourceCategory, oneToFive(patch.credibility ?? current.credibility, "可信度"), oneToFive(patch.relevance ?? current.relevance, "相关度"), stance, patch.note?.trim() ?? String(current.note ?? ""), patch.publishedAt === undefined ? current.published_at : patch.publishedAt, now(), id, ownerId).run();
  return evidenceFromRow((await db.prepare("SELECT * FROM evidence WHERE id = ? AND owner_id = ?").bind(id, ownerId).first<Row>())!);
}
