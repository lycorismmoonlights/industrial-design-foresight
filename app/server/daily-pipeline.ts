import { getD1 } from "../../db";
import { processPendingInboxWithAi, type AiBatchResult } from "./ai-processing";
import { fetchAllEnabledSources, type FetchSourceResult } from "./ingestion";

type Row = Record<string, unknown>;

export interface DailyPipelineResult {
  runId: string;
  status: "success" | "partial" | "failed" | "duplicate";
  sourceCount: number;
  sourceSuccessCount: number;
  sourceFailureCount: number;
  newCount: number;
  ai: AiBatchResult | null;
}

function now(): string {
  return new Date().toISOString();
}

function normalizedSchedule(value: number | string | Date | undefined): string {
  const date = value === undefined ? new Date() : new Date(value);
  return Number.isNaN(date.getTime()) ? now() : date.toISOString();
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "未知管线错误").replace(/\s+/g, " ").trim().slice(0, 1000);
}

async function finishRun(runId: string, status: Exclude<DailyPipelineResult["status"], "duplicate">, sources: FetchSourceResult[], ai: AiBatchResult | null, error: string | null) {
  const sourceFailureCount = sources.filter((item) => item.status === "failed").length;
  const sourceSuccessCount = sources.length - sourceFailureCount;
  const newCount = sources.reduce((total, item) => total + item.newCount, 0);
  const metrics = {
    sourceDurationMs: sources.reduce((total, item) => total + item.durationMs, 0),
    aiAttemptedCount: ai?.attemptedCount ?? 0,
    aiPromptTokens: ai?.promptTokens ?? 0,
    aiCompletionTokens: ai?.completionTokens ?? 0,
  };
  await getD1().prepare("UPDATE pipeline_runs SET finished_at = ?, status = ?, source_count = ?, source_success_count = ?, source_failure_count = ?, new_count = ?, ai_status = ?, ai_processed_count = ?, ai_failure_count = ?, error = ?, metrics_json = ? WHERE id = ?")
    .bind(now(), status, sources.length, sourceSuccessCount, sourceFailureCount, newCount, ai?.status ?? "not_started", ai?.processedCount ?? 0, ai?.failureCount ?? 0, error, JSON.stringify(metrics), runId).run();
  return { sourceSuccessCount, sourceFailureCount, newCount };
}

export async function runDailyResearchPipeline(scheduledFor?: number | string | Date): Promise<DailyPipelineResult> {
  const scheduledAt = normalizedSchedule(scheduledFor);
  const slotKey = `daily:${scheduledAt}`;
  const runId = crypto.randomUUID();
  const startedAt = now();
  const inserted = await getD1().prepare("INSERT OR IGNORE INTO pipeline_runs (id, slot_key, scheduled_at, started_at, status) VALUES (?, ?, ?, ?, 'running')")
    .bind(runId, slotKey, scheduledAt, startedAt).run();
  if (Number(inserted.meta.changes ?? 0) !== 1) {
    const existing = await getD1().prepare("SELECT id, status, source_count, source_success_count, source_failure_count, new_count FROM pipeline_runs WHERE slot_key = ?")
      .bind(slotKey).first<Row>();
    return {
      runId: String(existing?.id ?? ""),
      status: "duplicate",
      sourceCount: Number(existing?.source_count ?? 0),
      sourceSuccessCount: Number(existing?.source_success_count ?? 0),
      sourceFailureCount: Number(existing?.source_failure_count ?? 0),
      newCount: Number(existing?.new_count ?? 0),
      ai: null,
    };
  }

  let sources: FetchSourceResult[] = [];
  let ai: AiBatchResult | null = null;
  try {
    sources = await fetchAllEnabledSources();
    ai = await processPendingInboxWithAi();
    const partial = sources.some((item) => item.status === "failed") || ai.status === "partial" || ai.status === "missing_key";
    const status = partial ? "partial" : "success";
    const counts = await finishRun(runId, status, sources, ai, null);
    return { runId, status, sourceCount: sources.length, ...counts, ai };
  } catch (error) {
    const message = errorMessage(error);
    const counts = await finishRun(runId, "failed", sources, ai, message);
    return { runId, status: "failed", sourceCount: sources.length, ...counts, ai };
  }
}
