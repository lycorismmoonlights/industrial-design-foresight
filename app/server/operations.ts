import { getAppEnv, getD1 } from "../../db";
import type {
  IntegrationDto,
  IntegrationId,
  OperationsInboxItemDto,
  OperationsInboxPageDto,
  OperationsOverviewDto,
  PipelineRunDto,
  SyncRunDto,
} from "../operations-model";
import type { InboxItemDto } from "../v2-model";
import { AppError } from "./errors";

type Row = Record<string, unknown>;
const REVIEW_STATUSES = new Set(["pending", "rejected", "ignored", "converted"]);
const AI_STATUSES = new Set(["pending", "processing", "retry", "completed", "failed"]);

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function configuredInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function pipelineRunFromRow(row: Row): PipelineRunDto {
  return {
    id: String(row.id),
    scheduledAt: String(row.scheduled_at),
    triggerType: String(row.trigger_type ?? "scheduled") as PipelineRunDto["triggerType"],
    requestedBy: row.requested_by ? String(row.requested_by) : null,
    startedAt: String(row.started_at),
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    status: String(row.status) as PipelineRunDto["status"],
    sourceCount: Number(row.source_count ?? 0),
    sourceSuccessCount: Number(row.source_success_count ?? 0),
    sourceFailureCount: Number(row.source_failure_count ?? 0),
    newCount: Number(row.new_count ?? 0),
    aiStatus: String(row.ai_status ?? "not_started"),
    aiProcessedCount: Number(row.ai_processed_count ?? 0),
    aiFailureCount: Number(row.ai_failure_count ?? 0),
    error: row.error ? String(row.error) : null,
    metrics: parseJson<Record<string, unknown>>(row.metrics_json, {}),
  };
}

function syncRunFromRow(row: Row): SyncRunDto {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    sourceName: String(row.source_name),
    adapterType: String(row.adapter_type ?? "rss"),
    status: String(row.status) as SyncRunDto["status"],
    durationMs: Number(row.duration_ms ?? 0),
    newCount: Number(row.new_count ?? 0),
    error: row.error ? String(row.error) : null,
    startedAt: String(row.started_at),
    finishedAt: String(row.finished_at),
  };
}

function integration(
  id: IntegrationId,
  name: string,
  counts: Map<string, { total: number; enabled: number }>,
  environmentVariables: string[],
  state: Pick<IntegrationDto, "status" | "detail">,
): IntegrationDto {
  const sourceCounts = counts.get(id) ?? { total: 0, enabled: 0 };
  return { id, name, environmentVariables, sourceCount: sourceCounts.total, enabledSourceCount: sourceCounts.enabled, ...state };
}

export async function getOperationsOverview(ownerId: string): Promise<OperationsOverviewDto> {
  const db = getD1();
  const appEnv = getAppEnv();
  const [sourceSummary, inboxSummary, adapterRows, pipelineRows, syncRows] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) AS enabled, SUM(CASE WHEN enabled = 1 AND last_error IS NOT NULL THEN 1 ELSE 0 END) AS unhealthy FROM sources WHERE owner_id = ?")
      .bind(ownerId).first<Row>(),
    db.prepare("SELECT SUM(CASE WHEN review_status = 'pending' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN ai_status = 'completed' THEN 1 ELSE 0 END) AS ai_completed, SUM(CASE WHEN ai_status = 'failed' THEN 1 ELSE 0 END) AS ai_failed FROM inbox_items WHERE owner_id = ?")
      .bind(ownerId).first<Row>(),
    db.prepare("SELECT adapter_type, COUNT(*) AS total, SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) AS enabled FROM sources WHERE owner_id = ? GROUP BY adapter_type")
      .bind(ownerId).all<Row>(),
    db.prepare("SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 25").all<Row>(),
    db.prepare("SELECT run.*, source.name AS source_name, source.adapter_type FROM sync_runs AS run JOIN sources AS source ON source.id = run.source_id WHERE run.owner_id = ? ORDER BY run.started_at DESC LIMIT 40")
      .bind(ownerId).all<Row>(),
  ]);

  const counts = new Map((adapterRows.results ?? []).map((row) => [String(row.adapter_type), { total: Number(row.total), enabled: Number(row.enabled ?? 0) }]));
  const noSource = (id: IntegrationId) => (counts.get(id)?.total ?? 0) === 0;
  const deepSeekEnabled = appEnv.AI_PROCESSING_ENABLED === "true";
  const integrations: IntegrationDto[] = [
    integration("rss", "RSS / Atom", counts, [], { status: "ready", detail: noSource("rss") ? "无需密钥，尚未添加订阅。" : "无需密钥，可直接抓取。" }),
    integration("bls", "BLS Public Data API", counts, ["BLS_API_KEY（可选）"], {
      status: appEnv.BLS_API_KEY ? "ready" : "optional",
      detail: appEnv.BLS_API_KEY ? "注册密钥已配置。" : "匿名接口可用；配置密钥可提高官方配额。",
    }),
    integration("fred", "FRED API", counts, ["FRED_API_KEY"], {
      status: appEnv.FRED_API_KEY ? "ready" : noSource("fred") ? "optional" : "missing",
      detail: appEnv.FRED_API_KEY ? "运行时密钥已配置。" : noSource("fred") ? "添加 FRED 来源前需配置密钥。" : "已添加来源，但缺少 FRED_API_KEY。",
    }),
    integration("sec", "SEC EDGAR", counts, ["SEC_USER_AGENT"], {
      status: appEnv.SEC_USER_AGENT ? "ready" : noSource("sec") ? "optional" : "missing",
      detail: appEnv.SEC_USER_AGENT ? "联系标识已配置。" : noSource("sec") ? "添加 SEC 来源前需配置联系标识。" : "已添加来源，但缺少 SEC_USER_AGENT。",
    }),
    integration("eurostat", "Eurostat Statistics API", counts, [], { status: "ready", detail: "无需密钥，使用官方公开接口。" }),
    integration("deepseek", "DeepSeek", counts, ["DEEPSEEK_API_KEY", "DEEPSEEK_MODEL"], {
      status: !deepSeekEnabled ? "disabled" : appEnv.DEEPSEEK_API_KEY ? "ready" : "missing",
      detail: !deepSeekEnabled ? "AI_PROCESSING_ENABLED 当前为 false。" : appEnv.DEEPSEEK_API_KEY ? "AI 整理已启用，密钥已配置。" : "AI 已启用，但缺少 DEEPSEEK_API_KEY。",
    }),
  ];

  return {
    schedule: {
      cron: "0 16 * * *",
      timezone: "Asia/Shanghai",
      localTime: "00:00",
      aiEnabled: deepSeekEnabled,
      aiModel: appEnv.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash",
      aiDailyItemLimit: configuredInteger(appEnv.AI_DAILY_ITEM_LIMIT, 30, 1, 100),
      aiMaxAttempts: configuredInteger(appEnv.AI_MAX_ATTEMPTS, 3, 1, 10),
    },
    metrics: {
      totalSources: Number(sourceSummary?.total ?? 0),
      enabledSources: Number(sourceSummary?.enabled ?? 0),
      unhealthySources: Number(sourceSummary?.unhealthy ?? 0),
      pendingInbox: Number(inboxSummary?.pending ?? 0),
      aiCompleted: Number(inboxSummary?.ai_completed ?? 0),
      aiFailed: Number(inboxSummary?.ai_failed ?? 0),
    },
    integrations,
    pipelineRuns: (pipelineRows.results ?? []).map(pipelineRunFromRow),
    syncRuns: (syncRows.results ?? []).map(syncRunFromRow),
  };
}

function encodeCursor(item: OperationsInboxItemDto): string {
  return btoa(`${item.createdAt}\n${item.id}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeCursor(value: string): { createdAt: string; id: string } {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const [createdAt, id, ...rest] = atob(padded).split("\n");
    if (!createdAt || !id || rest.length || Number.isNaN(Date.parse(createdAt))) throw new Error("invalid");
    return { createdAt, id };
  } catch {
    throw new AppError(400, "INVALID_CURSOR", "分页游标无效，请重新载入数据。");
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function operationsInboxFromRow(row: Row): OperationsInboxItemDto {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    sourceName: String(row.source_name),
    adapterType: String(row.adapter_type ?? "rss"),
    sourceCategory: String(row.source_category),
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

export async function listOperationsInbox(ownerId: string, params: URLSearchParams): Promise<OperationsInboxPageDto> {
  const limit = configuredInteger(params.get("limit") ?? undefined, 40, 1, 100);
  const query = (params.get("q") ?? "").trim().slice(0, 200);
  const sourceId = (params.get("sourceId") ?? "").trim();
  const reviewStatus = (params.get("reviewStatus") ?? "").trim();
  const aiStatus = (params.get("aiStatus") ?? "").trim();
  if (reviewStatus && !REVIEW_STATUSES.has(reviewStatus)) throw new AppError(400, "INVALID_REVIEW_STATUS", "未知人工审核状态。");
  if (aiStatus && !AI_STATUSES.has(aiStatus)) throw new AppError(400, "INVALID_AI_STATUS", "未知 AI 处理状态。");

  const conditions = ["item.owner_id = ?"];
  const bindings: unknown[] = [ownerId];
  if (query) {
    conditions.push("(item.title LIKE ? ESCAPE '\\' OR item.summary LIKE ? ESCAPE '\\')");
    const pattern = `%${escapeLike(query)}%`;
    bindings.push(pattern, pattern);
  }
  if (sourceId) { conditions.push("item.source_id = ?"); bindings.push(sourceId); }
  if (reviewStatus) { conditions.push("item.review_status = ?"); bindings.push(reviewStatus); }
  if (aiStatus) { conditions.push("item.ai_status = ?"); bindings.push(aiStatus); }
  const filterSql = conditions.join(" AND ");
  const count = await getD1().prepare(`SELECT COUNT(*) AS count FROM inbox_items AS item WHERE ${filterSql}`).bind(...bindings).first<{ count: number }>();

  const pageConditions = [...conditions];
  const pageBindings = [...bindings];
  const cursorValue = params.get("cursor");
  if (cursorValue) {
    const cursor = decodeCursor(cursorValue);
    pageConditions.push("(item.created_at < ? OR (item.created_at = ? AND item.id < ?))");
    pageBindings.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }
  pageBindings.push(limit + 1);
  const rows = await getD1().prepare(`SELECT item.*, source.name AS source_name, source.adapter_type, source.source_category FROM inbox_items AS item JOIN sources AS source ON source.id = item.source_id WHERE ${pageConditions.join(" AND ")} ORDER BY item.created_at DESC, item.id DESC LIMIT ?`)
    .bind(...pageBindings).all<Row>();
  const mapped = (rows.results ?? []).map(operationsInboxFromRow);
  const hasMore = mapped.length > limit;
  const items = mapped.slice(0, limit);
  return { items, filteredCount: Number(count?.count ?? 0), nextCursor: hasMore && items.length ? encodeCursor(items[items.length - 1]) : null };
}

export async function retryFailedAiItems(ownerId: string, rawIds: unknown): Promise<{ requestedCount: number; requeuedCount: number }> {
  if (!Array.isArray(rawIds)) throw new AppError(400, "INBOX_IDS_REQUIRED", "需要提供待重试条目 ID 数组。");
  const ids = [...new Set(rawIds.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))];
  if (!ids.length || ids.length > 50) throw new AppError(400, "INVALID_INBOX_IDS", "每次必须选择 1–50 条数据。");
  const results = await getD1().batch(ids.map((id) => getD1().prepare("UPDATE inbox_items SET ai_status = 'pending', ai_summary = NULL, ai_quadrant = NULL, ai_relevance = NULL, ai_stance_suggestion = NULL, ai_tags_json = '[]', ai_hypothesis_links_json = '[]', ai_model = NULL, ai_prompt_version = NULL, ai_attempt_count = 0, ai_started_at = NULL, ai_processed_at = NULL, ai_error = NULL WHERE id = ? AND owner_id = ? AND review_status = 'pending' AND ai_status = 'failed'")
    .bind(id, ownerId)));
  return { requestedCount: ids.length, requeuedCount: results.reduce((total, result) => total + Number(result.meta.changes ?? 0), 0) };
}
