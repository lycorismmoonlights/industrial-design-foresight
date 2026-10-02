import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bootstrap, updateRecord } from "../app/server/repository";
import { createSource, fetchAllEnabledSources, fetchSource, reviewInboxItem } from "../app/server/ingestion";
import { scheduleSourceIngestion } from "../worker/scheduled";

interface TestEnv { DB: D1Database }
const db = (env as unknown as TestEnv).DB;

function rss(guid: string, url: string, title = "Industrial design signal") {
  return `<rss version="2.0"><channel><title>Test</title><item><guid>${guid}</guid><title>${title}</title><description>Evidence summary</description><link>${url}</link><pubDate>Fri, 14 Aug 2026 00:00:00 GMT</pubDate></item></channel></rss>`;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("source ingestion and review", () => {
  it("uses conditional headers and deduplicates by canonical URL even when GUID changes", async () => {
    const ownerId = crypto.randomUUID();
    const source = await createSource(ownerId, { name: "Dedupe feed", feedUrl: "https://dedupe.example/feed" });
    const mockedFetch = vi.fn()
      .mockResolvedValueOnce(new Response(rss("guid-a", "https://dedupe.example/post?utm_source=x"), { status: 200, headers: { etag: '"v1"', "last-modified": "Fri, 14 Aug 2026 00:00:00 GMT" } }))
      .mockResolvedValueOnce(new Response(rss("guid-b", "https://dedupe.example/post"), { status: 200 }));
    vi.stubGlobal("fetch", mockedFetch);

    expect((await fetchSource(ownerId, source.id)).newCount).toBe(1);
    expect((await fetchSource(ownerId, source.id)).newCount).toBe(0);
    const secondHeaders = new Headers(mockedFetch.mock.calls[1][1]?.headers);
    expect(secondHeaders.get("if-none-match")).toBe('"v1"');
    expect(secondHeaders.get("if-modified-since")).toContain("14 Aug 2026");
  });

  it("handles 304 without adding inbox entries", async () => {
    const ownerId = crypto.randomUUID();
    const source = await createSource(ownerId, { name: "Conditional feed", feedUrl: "https://conditional.example/feed" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 304 })));
    await expect(fetchSource(ownerId, source.id)).resolves.toMatchObject({ status: "not_modified", newCount: 0 });
  });

  it("converts a reviewed item to a signal draft and blocks publish until its quadrant is complete", async () => {
    const ownerId = crypto.randomUUID();
    const source = await createSource(ownerId, { name: "Review feed", feedUrl: "https://review.example/feed", defaultCredibility: 4 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(rss("review-1", "https://review.example/post"), { status: 200 })));
    await fetchSource(ownerId, source.id);
    const inbox = await db.prepare("SELECT id FROM inbox_items WHERE owner_id = ? AND review_status = 'pending'").bind(ownerId).first<{ id: string }>();
    const reviewed = await reviewInboxItem(ownerId, "owner@example.com", inbox!.id, { action: "convert", relevance: 5, stance: "opposes" });
    const data = await bootstrap(ownerId, { userId: ownerId, email: "owner@example.com", displayName: "Owner" });
    const signal = data.records.find((record) => record.id === reviewed.recordId)!;
    expect(signal.status).toBe("draft");
    expect(signal.payload).toMatchObject({ confidence: 50, ring: "关注", movement: "稳定", impact: 0, quadrant: "" });
    expect(data.evidence.find((item) => item.id === reviewed.evidenceId)).toMatchObject({ credibility: 4, relevance: 5, stance: "opposes" });
    await expect(updateRecord(ownerId, "owner@example.com", signal.id, 1, { status: "published" })).rejects.toMatchObject({ code: "SIGNAL_QUADRANT_REQUIRED" });
    const published = await updateRecord(ownerId, "owner@example.com", signal.id, 1, { status: "published", payload: { ...signal.payload, quadrant: "制造与材料" } });
    expect(published.status).toBe("published");
  });

  it("isolates one source failure while other enabled sources continue", async () => {
    await db.prepare("UPDATE sources SET enabled = 0").run();
    const ownerId = crypto.randomUUID();
    await createSource(ownerId, { name: "Broken", feedUrl: "https://broken.example/feed", enabled: true, confirmEnable: true });
    await createSource(ownerId, { name: "Healthy", feedUrl: "https://healthy.example/feed", enabled: true, confirmEnable: true });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("broken")) throw new Error("upstream unavailable");
      return new Response(rss("healthy-1", "https://healthy.example/post"), { status: 200 });
    }));
    const results = await fetchAllEnabledSources();
    expect(results.map((result) => result.status).sort()).toEqual(["failed", "success"]);
    const pending = await db.prepare("SELECT COUNT(*) AS count FROM inbox_items WHERE owner_id = ?").bind(ownerId).first<{ count: number }>();
    expect(Number(pending?.count)).toBe(1);
  });

  it("runs enabled feeds through the Worker scheduled handler", async () => {
    await db.prepare("UPDATE sources SET enabled = 0").run();
    const ownerId = crypto.randomUUID();
    await createSource(ownerId, { name: "Cron feed", feedUrl: "https://cron.example/feed", enabled: true, confirmEnable: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(rss("cron-1", "https://cron.example/post"), { status: 200 })));
    const context = createExecutionContext();
    scheduleSourceIngestion(context);
    await waitOnExecutionContext(context);
    const pending = await db.prepare("SELECT COUNT(*) AS count FROM inbox_items WHERE owner_id = ?").bind(ownerId).first<{ count: number }>();
    expect(Number(pending?.count)).toBe(1);
  });
});
