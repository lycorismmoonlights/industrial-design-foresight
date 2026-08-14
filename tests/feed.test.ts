import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverFeedUrl, parseFeed } from "../app/server/feed";
import { assertPublicHttpUrl, safeFetchText } from "../app/server/network-safety";

describe("feed parser and network safety", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("parses RSS and limits metadata to the first 100 entries", async () => {
    const items = Array.from({ length: 105 }, (_, index) => `<item><guid>g-${index}</guid><title>Signal ${index}</title><description><![CDATA[<p>Summary ${index}</p>]]></description><link>https://example.com/posts/${index}?utm_source=test</link><pubDate>Fri, 14 Aug 2026 00:00:00 GMT</pubDate></item>`).join("");
    const feed = await parseFeed(`<rss version="2.0"><channel><title>Design feed</title>${items}</channel></rss>`, "https://example.com/feed.xml");
    expect(feed.type).toBe("rss");
    expect(feed.entries).toHaveLength(100);
    expect(feed.entries[0]).toMatchObject({ guid: "g-0", summary: "Summary 0", canonicalUrl: "https://example.com/posts/0" });
  });

  it("parses Atom links, authors and dates", async () => {
    const feed = await parseFeed(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Policy</title><entry><id>urn:1</id><title>Manufacturing policy</title><summary>Industrial update</summary><author><name>DG GROW</name></author><updated>2026-08-14T00:00:00Z</updated><link rel="alternate" href="/policy/1" /></entry></feed>`, "https://example.eu/feed");
    expect(feed.type).toBe("atom");
    expect(feed.entries[0]).toMatchObject({ guid: "urn:1", author: "DG GROW", canonicalUrl: "https://example.eu/policy/1" });
  });

  it("discovers rel=alternate feeds from a web page", async () => {
    const discovered = await discoverFeedUrl(`<html><head><link rel="alternate" type="application/atom+xml" href="/atom.xml"></head></html>`, "https://example.com/news");
    expect(discovered).toBe("https://example.com/atom.xml");
  });

  it("rejects local/private addresses and oversized bodies", async () => {
    expect(() => assertPublicHttpUrl("http://127.0.0.1/feed")).toThrowError(/私有网络/);
    expect(() => assertPublicHttpUrl("http://[::1]/feed")).toThrowError(/私有网络/);
    await expect(safeFetchText("https://example.com/feed", {}, async () => new Response("x", { headers: { "content-length": String(1024 * 1024 + 1) } }))).rejects.toMatchObject({ code: "SOURCE_TOO_LARGE" });
  });

  it("aborts a source after ten seconds", async () => {
    vi.useFakeTimers();
    const pending = safeFetchText("https://timeout.example/feed", {}, async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const assertion = expect(pending).rejects.toMatchObject({ code: "SOURCE_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(10_001);
    await assertion;
  });
});
