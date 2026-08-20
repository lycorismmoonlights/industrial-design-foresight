import { getAppEnv, getD1, type AppEnv } from "../../db";
import {
  analyzeWithDeepSeek,
  DEEPSEEK_PROMPT_VERSION,
  DEFAULT_DEEPSEEK_MODEL,
  type DeepSeekAnalysisInput,
  type DeepSeekResult,
} from "./deepseek";

type Row = Record<string, unknown>;

export interface AiBatchResult {
  status: "disabled" | "missing_key" | "success" | "partial";
  attemptedCount: number;
  processedCount: number;
  failureCount: number;
  promptTokens: number;
  completionTokens: number;
}

interface ProcessingOptions {
  appEnv?: AppEnv;
  analyzer?: (input: DeepSeekAnalysisInput, options: { apiKey: string; model: string }) => Promise<DeepSeekResult>;
}

function configuredInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback;
}

function now(): string {
  return new Date().toISOString();
}

function truncatedError(error: unknown): string {
  return (error instanceof Error ? error.message : "未知 AI 处理错误").replace(/\s+/g, " ").trim().slice(0, 1000);
}

async function hypothesesForOwner(ownerId: string): Promise<DeepSeekAnalysisInput["hypotheses"]> {
  const result = await getD1().prepare("SELECT id, title, summary FROM records WHERE owner_id = ? AND kind = 'hypothesis' AND status != 'archived' AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 20")
    .bind(ownerId).all<Row>();
  return (result.results ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    summary: String(row.summary ?? ""),
  }));
}

export async function processPendingInboxWithAi(options: ProcessingOptions = {}): Promise<AiBatchResult> {
  const appEnv = options.appEnv ?? getAppEnv();
  const empty = { attemptedCount: 0, processedCount: 0, failureCount: 0, promptTokens: 0, completionTokens: 0 };
  if (appEnv.AI_PROCESSING_ENABLED !== "true") return { status: "disabled", ...empty };
  if (!appEnv.DEEPSEEK_API_KEY?.trim()) return { status: "missing_key", ...empty };

  const limit = configuredInteger(appEnv.AI_DAILY_ITEM_LIMIT, 30, 1, 100);
  const maximumAttempts = configuredInteger(appEnv.AI_MAX_ATTEMPTS, 3, 1, 10);
  const staleBefore = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const db = getD1();
  await db.batch([
    db.prepare("UPDATE inbox_items SET ai_status = 'retry', ai_error = 'Recovered after an interrupted AI attempt.' WHERE ai_status = 'processing' AND ai_started_at < ? AND ai_attempt_count < ?")
      .bind(staleBefore, maximumAttempts),
    db.prepare("UPDATE inbox_items SET ai_status = 'failed', ai_error = 'Maximum AI attempts reached after an interrupted attempt.' WHERE ai_status = 'processing' AND ai_started_at < ? AND ai_attempt_count >= ?")
      .bind(staleBefore, maximumAttempts),
  ]);

  const rows = await db.prepare("SELECT item.*, source.name AS source_name, source.source_category FROM inbox_items AS item JOIN sources AS source ON source.id = item.source_id WHERE item.review_status = 'pending' AND item.ai_status IN ('pending', 'retry') AND item.ai_attempt_count < ? ORDER BY item.created_at ASC LIMIT ?")
    .bind(maximumAttempts, limit).all<Row>();
  const hypothesisCache = new Map<string, DeepSeekAnalysisInput["hypotheses"]>();
  const analyzer = options.analyzer ?? ((input, requestOptions) => analyzeWithDeepSeek(input, requestOptions));
  const result: AiBatchResult = { status: "success", ...empty };

  for (const row of rows.results ?? []) {
    const itemId = String(row.id);
    const startedAt = now();
    const claim = await db.prepare("UPDATE inbox_items SET ai_status = 'processing', ai_attempt_count = ai_attempt_count + 1, ai_started_at = ?, ai_error = NULL WHERE id = ? AND ai_status IN ('pending', 'retry') AND ai_attempt_count < ?")
      .bind(startedAt, itemId, maximumAttempts).run();
    if (Number(claim.meta.changes ?? 0) !== 1) continue;
    result.attemptedCount += 1;
    const ownerId = String(row.owner_id);
    let hypotheses = hypothesisCache.get(ownerId);
    if (!hypotheses) {
      hypotheses = await hypothesesForOwner(ownerId);
      hypothesisCache.set(ownerId, hypotheses);
    }
    try {
      const analyzed = await analyzer({
        sourceName: String(row.source_name),
        sourceCategory: String(row.source_category),
        title: String(row.title),
        summary: String(row.summary ?? ""),
        publishedAt: row.published_at ? String(row.published_at) : null,
        hypotheses,
      }, {
        apiKey: appEnv.DEEPSEEK_API_KEY,
        model: appEnv.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL,
      });
      const finishedAt = now();
      await db.prepare("UPDATE inbox_items SET ai_status = 'completed', ai_summary = ?, ai_quadrant = ?, ai_relevance = ?, ai_stance_suggestion = ?, ai_tags_json = ?, ai_hypothesis_links_json = ?, ai_model = ?, ai_prompt_version = ?, ai_processed_at = ?, ai_error = NULL WHERE id = ? AND ai_status = 'processing'")
        .bind(analyzed.analysis.summary, analyzed.analysis.quadrant, analyzed.analysis.relevance, analyzed.analysis.stanceSuggestion, JSON.stringify(analyzed.analysis.tags), JSON.stringify(analyzed.analysis.hypothesisLinks), analyzed.model, DEEPSEEK_PROMPT_VERSION, finishedAt, itemId).run();
      result.processedCount += 1;
      result.promptTokens += analyzed.promptTokens ?? 0;
      result.completionTokens += analyzed.completionTokens ?? 0;
    } catch (error) {
      const nextStatus = Number(row.ai_attempt_count ?? 0) + 1 >= maximumAttempts ? "failed" : "retry";
      await db.prepare("UPDATE inbox_items SET ai_status = ?, ai_error = ?, ai_processed_at = ? WHERE id = ? AND ai_status = 'processing'")
        .bind(nextStatus, truncatedError(error), now(), itemId).run();
      result.failureCount += 1;
    }
  }
  result.status = result.failureCount > 0 ? "partial" : "success";
  return result;
}
