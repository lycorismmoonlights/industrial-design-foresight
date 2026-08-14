import { XMLParser } from "fast-xml-parser";
import { AppError } from "./errors";

export interface FeedEntry {
  guid: string | null;
  title: string;
  summary: string;
  author: string | null;
  publishedAt: string | null;
  canonicalUrl: string | null;
  contentHash: string;
}

export interface ParsedFeed {
  type: "rss" | "atom";
  title: string;
  entries: FeedEntry[];
}

function list<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return scalar(object["#text"] ?? object.text ?? object.value ?? object.name);
  }
  return "";
}

function cleanText(value: unknown): string {
  return scalar(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function asDate(value: unknown): string | null {
  const raw = scalar(value).trim();
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

export function canonicalizeUrl(value: unknown, baseUrl: string): string | null {
  const raw = scalar(value).trim();
  if (!raw) return null;
  try {
    const url = new URL(raw, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function atomLink(value: unknown, baseUrl: string): string | null {
  const links = list(value as Record<string, unknown> | Array<Record<string, unknown>>);
  const selected = links.find((link) => !link.rel || link.rel === "alternate") ?? links[0];
  return canonicalizeUrl(selected?.href ?? selected?.["@_href"] ?? selected, baseUrl);
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function normalizeEntry(input: {
  guid?: unknown;
  title?: unknown;
  summary?: unknown;
  author?: unknown;
  publishedAt?: unknown;
  url?: unknown;
}, baseUrl: string): Promise<FeedEntry | null> {
  const title = cleanText(input.title);
  if (!title) return null;
  const summary = cleanText(input.summary).slice(0, 4000);
  const guid = scalar(input.guid).trim() || null;
  const canonicalUrl = canonicalizeUrl(input.url, baseUrl);
  const publishedAt = asDate(input.publishedAt);
  return {
    guid,
    title: title.slice(0, 500),
    summary,
    author: cleanText(input.author).slice(0, 300) || null,
    publishedAt,
    canonicalUrl,
    contentHash: await sha256(JSON.stringify({ title, summary, publishedAt, canonicalUrl })),
  };
}

export async function parseFeed(xml: string, baseUrl: string): Promise<ParsedFeed> {
  let root: Record<string, unknown>;
  try {
    root = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      textNodeName: "#text",
      trimValues: true,
      processEntities: true,
    }).parse(xml) as Record<string, unknown>;
  } catch {
    throw new AppError(422, "INVALID_FEED", "订阅内容不是有效的 RSS/Atom XML。");
  }

  const rssRoot = (root.rss ?? root["rdf:RDF"] ?? root.RDF) as Record<string, unknown> | undefined;
  if (rssRoot) {
    const channel = (rssRoot.channel ?? rssRoot) as Record<string, unknown>;
    const rawItems = list((channel.item ?? rssRoot.item) as Record<string, unknown> | Array<Record<string, unknown>>).slice(0, 100);
    const entries = (await Promise.all(rawItems.map((item) => normalizeEntry({
      guid: item.guid ?? item["dc:identifier"],
      title: item.title,
      summary: item.description ?? item["content:encoded"],
      author: item.author ?? item["dc:creator"],
      publishedAt: item.pubDate ?? item["dc:date"],
      url: item.link,
    }, baseUrl)))).filter((entry): entry is FeedEntry => Boolean(entry));
    return { type: "rss", title: cleanText(channel.title), entries };
  }

  const feed = root.feed as Record<string, unknown> | undefined;
  if (feed) {
    const rawEntries = list(feed.entry as Record<string, unknown> | Array<Record<string, unknown>>).slice(0, 100);
    const entries = (await Promise.all(rawEntries.map((entry) => {
      const author = entry.author as Record<string, unknown> | undefined;
      return normalizeEntry({
        guid: entry.id,
        title: entry.title,
        summary: entry.summary ?? entry.content,
        author: author?.name ?? author,
        publishedAt: entry.published ?? entry.updated,
        url: atomLink(entry.link, baseUrl),
      }, baseUrl);
    }))).filter((entry): entry is FeedEntry => Boolean(entry));
    return { type: "atom", title: cleanText(feed.title), entries };
  }
  throw new AppError(422, "INVALID_FEED", "未识别到 RSS 或 Atom 订阅结构。");
}

export async function discoverFeedUrl(html: string, pageUrl: string): Promise<string | null> {
  let found: string | null = null;
  const rewriter = new HTMLRewriter().on("link", {
    element(element) {
      if (found) return;
      const rel = (element.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
      const type = (element.getAttribute("type") ?? "").toLowerCase();
      const href = element.getAttribute("href");
      if (href && rel.includes("alternate") && (type.includes("rss") || type.includes("atom") || type.includes("xml"))) {
        found = canonicalizeUrl(href, pageUrl);
      }
    },
  });
  await rewriter.transform(new Response(html)).text();
  return found;
}
