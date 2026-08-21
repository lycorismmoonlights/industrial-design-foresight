import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { runDailyResearchPipeline } from "../app/server/daily-pipeline";
import { createSource } from "../app/server/ingestion";
import { getOperationsOverview, listOperationsInbox, retryFailedAiItems } from "../app/server/operations";

interface TestEnv { DB: D1Database }
const db = (env as unknown as TestEnv).DB;

async function insertInbox(ownerId: string, sourceId: string, input: { id: string; title: string; createdAt: string; aiStatus?: string }) {
  await db.prepare("INSERT INTO inbox_items (id, owner_id, source_id, content_hash, dedupe_key, title, summary, review_status, ai_status, ai_attempt_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)")
    .bind(input.id, ownerId, sourceId, `hash-${input.id}`, `guid:${input.id}`, input.title, `${input.title} summary`, input.aiStatus ?? "pending", input.aiStatus === "failed" ? 3 : 0, input.createdAt).run();
}

describe("automation operations application layer", () => {
  it("reports integration readiness without exposing runtime secret values", async () => {
    const ownerId = crypto.randomUUID();
    await createSource(ownerId, { name: "RSS", feedUrl: "https://ops.example/rss" });
    await createSource(ownerId, { name: "FRED", adapterType: "fred", adapterConfig: { seriesIds: ["PAYEMS"] } });
    const overview = await getOperationsOverview(ownerId);
    expect(overview.schedule).toMatchObject({ cron: "0 16 * * *", timezone: "Asia/Shanghai", localTime: "00:00", aiEnabled: false });
    expect(overview.metrics.totalSources).toBe(2);
    expect(overview.integrations.find((item) => item.id === "rss")).toMatchObject({ status: "ready", sourceCount: 1 });
    expect(overview.integrations.find((item) => item.id === "fred")).toMatchObject({ status: "missing", sourceCount: 1 });
    expect(JSON.stringify(overview)).not.toContain("Bearer");
  });

  it("filters and cursor-paginates captured data by owner", async () => {
    const ownerId = crypto.randomUUID();
    const otherOwner = crypto.randomUUID();
    const source = await createSource(ownerId, { name: "Operations feed", feedUrl: "https://ops-data.example/rss" });
    const otherSource = await createSource(otherOwner, { name: "Other feed", feedUrl: "https://ops-other.example/rss" });
    await insertInbox(ownerId, source.id, { id: crypto.randomUUID(), title: "robotics alpha", createdAt: "2026-08-20T02:00:00.000Z" });
    await insertInbox(ownerId, source.id, { id: crypto.randomUUID(), title: "robotics beta", createdAt: "2026-08-20T01:00:00.000Z" });
    await insertInbox(ownerId, source.id, { id: crypto.randomUUID(), title: "materials only", createdAt: "2026-08-20T00:00:00.000Z" });
    await insertInbox(otherOwner, otherSource.id, { id: crypto.randomUUID(), title: "robotics private", createdAt: "2026-08-20T03:00:00.000Z" });

    const first = await listOperationsInbox(ownerId, new URLSearchParams({ q: "robotics", limit: "1" }));
    expect(first).toMatchObject({ filteredCount: 2 });
    expect(first.items).toHaveLength(1);
    expect(first.items[0].sourceName).toBe("Operations feed");
    expect(first.nextCursor).toBeTruthy();
    const second = await listOperationsInbox(ownerId, new URLSearchParams({ q: "robotics", limit: "1", cursor: first.nextCursor! }));
    expect(second.items).toHaveLength(1);
    expect(second.items[0].id).not.toBe(first.items[0].id);
    expect(second.nextCursor).toBeNull();
  });

  it("requeues only owned failed AI items that still await human review", async () => {
    const ownerId = crypto.randomUUID();
    const otherOwner = crypto.randomUUID();
    const source = await createSource(ownerId, { name: "Retry feed", feedUrl: "https://ops-retry.example/rss" });
    const otherSource = await createSource(otherOwner, { name: "Other retry feed", feedUrl: "https://ops-other-retry.example/rss" });
    const ownedId = crypto.randomUUID();
    const otherId = crypto.randomUUID();
    await insertInbox(ownerId, source.id, { id: ownedId, title: "owned failure", createdAt: "2026-08-20T00:00:00.000Z", aiStatus: "failed" });
    await insertInbox(otherOwner, otherSource.id, { id: otherId, title: "other failure", createdAt: "2026-08-20T00:00:00.000Z", aiStatus: "failed" });

    const retried = await retryFailedAiItems(ownerId, [ownedId, otherId]);
    expect(retried).toEqual({ requestedCount: 2, requeuedCount: 1 });
    const owned = await db.prepare("SELECT ai_status, ai_attempt_count FROM inbox_items WHERE id = ?").bind(ownedId).first<Record<string, unknown>>();
    const other = await db.prepare("SELECT ai_status, ai_attempt_count FROM inbox_items WHERE id = ?").bind(otherId).first<Record<string, unknown>>();
    expect(owned).toMatchObject({ ai_status: "pending", ai_attempt_count: 0 });
    expect(other).toMatchObject({ ai_status: "failed", ai_attempt_count: 3 });
  });

  it("audits manual runs and refuses a second active pipeline", async () => {
    await db.prepare("UPDATE sources SET enabled = 0").run();
    const manual = await runDailyResearchPipeline({ scheduledFor: "2026-08-20T18:00:00.000Z", triggerType: "manual", requestedBy: "owner@example.com" });
    expect(manual.status).toBe("success");
    const stored = await db.prepare("SELECT trigger_type, requested_by FROM pipeline_runs WHERE id = ?").bind(manual.runId).first<Record<string, unknown>>();
    expect(stored).toMatchObject({ trigger_type: "manual", requested_by: "owner@example.com" });

    const activeRunId = crypto.randomUUID();
    await db.batch([
      db.prepare("INSERT INTO pipeline_runs (id, slot_key, scheduled_at, trigger_type, started_at, status) VALUES (?, ?, ?, 'manual', ?, 'running')")
        .bind(activeRunId, `manual:${activeRunId}`, "2026-08-20T19:00:00.000Z", new Date().toISOString()),
      db.prepare("INSERT OR REPLACE INTO pipeline_locks (lock_key, run_id, acquired_at, expires_at) VALUES ('daily-research', ?, ?, ?)")
        .bind(activeRunId, new Date().toISOString(), new Date(Date.now() + 60_000).toISOString()),
    ]);
    const duplicate = await runDailyResearchPipeline({ triggerType: "manual", requestedBy: "owner@example.com" });
    expect(duplicate).toMatchObject({ status: "duplicate", runId: activeRunId });
    await db.prepare("DELETE FROM pipeline_locks WHERE lock_key = 'daily-research'").run();
  });
});
