import { runDailyResearchPipeline } from "../app/server/daily-pipeline";

export function scheduleDailyResearch(context: { waitUntil(promise: Promise<unknown>): void }, scheduledTime = Date.now()): void {
  context.waitUntil(runDailyResearchPipeline(scheduledTime));
}

/** Backward-compatible name for callers from the v0.2 ingestion release. */
export function scheduleSourceIngestion(context: { waitUntil(promise: Promise<unknown>): void }, scheduledTime = Date.now()): void {
  scheduleDailyResearch(context, scheduledTime);
}
