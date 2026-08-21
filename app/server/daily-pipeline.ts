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

export interface DailyPipelineOptions {
  scheduledFor?: number | string | Date;
  triggerType?: "scheduled" | "manual";
  requestedBy?: string | null;
}

const PIPELINE_LOCK_KEY = "daily-research";
const PIPELINE_LOCK_MS = 2 * 60 * 60 * 1000;

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
  await getD1().batch([
    getD1().prepare("UPDATE pipeline_runs SET finished_at = ?, status = ?, source_count = ?, source_success_count = ?, source_failure_count = ?, new_count = ?, ai_status = ?, ai_processed_count = ?, ai_failure_count = ?, error = ?, metrics_json = ? WHERE id = ?")
      .bind(now(), status, sources.length, sourceSuccessCount, sourceFailureCount, newCount, ai?.status ?? "not_started", ai?.processedCount ?? 0, ai?.failureCount ?? 0, error, JSON.stringify(metrics), runId),
    getD1().prepare("DELETE FROM pipeline_locks WHERE lock_key = ? AND run_id = ?").bind(PIPELINE_LOCK_KEY, runId),
  ]);
  return { sourceSuccessCount, sourceFailureCount, newCount };
}

function pipelineOptions(value?: number | string | Date | DailyPipelineOptions): Required<Omit<DailyPipelineOptions, "requestedBy">> & { requestedBy: string | null } {
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return {
      scheduledFor: value.scheduledFor ?? new Date(),
      triggerType: value.triggerType ?? "scheduled",
      requestedBy: value.requestedBy?.trim() || null,
    };
  }
  return { scheduledFor: value ?? new Date(), triggerType: "scheduled", requestedBy: null };
}

async function duplicateResult(runId: string): Promise<DailyPipelineResult> {
  const existing = await getD1().prepare("SELECT id, source_count, source_success_count, source_failure_count, new_count FROM pipeline_runs WHERE id = ?")
    .bind(runId).first<Row>();
  return {
    runId: String(existing?.id ?? runId),
    status: "duplicate",
    sourceCount: Number(existing?.source_count ?? 0),
    sourceSuccessCount: Number(existing?.source_success_count ?? 0),
    sourceFailureCount: Number(existing?.source_failure_count ?? 0),
    newCount: Number(existing?.new_count ?? 0),
    ai: null,
  };
}

export async function runDailyResearchPipeline(input?: number | string | Date | DailyPipelineOptions): Promise<DailyPipelineResult> {
  const options = pipelineOptions(input);
  const scheduledAt = normalizedSchedule(options.scheduledFor);
  const runId = crypto.randomUUID();
  const slotKey = options.triggerType === "manual" ? `manual:${runId}` : `daily:${scheduledAt}`;
  const startedAt = now();
  const expiresAt = new Date(Date.parse(startedAt) + PIPELINE_LOCK_MS).toISOString();
  const acquired = await getD1().prepare("INSERT INTO pipeline_locks (lock_key, run_id, acquired_at, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(lock_key) DO UPDATE SET run_id = excluded.run_id, acquired_at = excluded.acquired_at, expires_at = excluded.expires_at WHERE pipeline_locks.expires_at <= excluded.acquired_at")
    .bind(PIPELINE_LOCK_KEY, runId, startedAt, expiresAt).run();
  if (Number(acquired.meta.changes ?? 0) !== 1) {
    const active = await getD1().prepare("SELECT run_id FROM pipeline_locks WHERE lock_key = ?").bind(PIPELINE_LOCK_KEY).first<{ run_id: string }>();
    return duplicateResult(String(active?.run_id ?? "active-pipeline"));
  }
  await getD1().prepare("UPDATE pipeline_runs SET status = 'failed', finished_at = ?, error = COALESCE(error, 'Recovered after an expired pipeline lock.') WHERE status = 'running' AND id != ? AND started_at < ?")
    .bind(startedAt, runId, startedAt).run();

  let inserted: D1Result<unknown>;
  try {
    inserted = await getD1().prepare("INSERT OR IGNORE INTO pipeline_runs (id, slot_key, scheduled_at, trigger_type, requested_by, started_at, status) VALUES (?, ?, ?, ?, ?, ?, 'running')")
      .bind(runId, slotKey, scheduledAt, options.triggerType, options.requestedBy, startedAt).run();
  } catch (error) {
    await getD1().prepare("DELETE FROM pipeline_locks WHERE lock_key = ? AND run_id = ?").bind(PIPELINE_LOCK_KEY, runId).run();
    throw error;
  }
  if (Number(inserted.meta.changes ?? 0) !== 1) {
    await getD1().prepare("DELETE FROM pipeline_locks WHERE lock_key = ? AND run_id = ?").bind(PIPELINE_LOCK_KEY, runId).run();
    const existing = await getD1().prepare("SELECT id FROM pipeline_runs WHERE slot_key = ?").bind(slotKey).first<{ id: string }>();
    return duplicateResult(String(existing?.id ?? runId));
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
