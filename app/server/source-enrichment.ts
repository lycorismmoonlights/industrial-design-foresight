import type { NormalizedSourceItem } from "./source-adapters";
import { safeFetchText } from "./network-safety";

export interface EuPublicationEnrichmentConfig {
  enrichment: "eu_publication";
  maxDetailPagesPerRun: number;
  maxAttachmentsPerItem: number;
}

interface EuAttachment {
  title: string;
  meta: string;
  url: string;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function field(block: string, className: string): string {
  const match = block.match(new RegExp(`<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i"));
  return decodeHtml(match?.[1] ?? "");
}

export function parseEuPublicationAttachments(html: string, pageUrl: string): EuAttachment[] {
  const attachments: EuAttachment[] = [];
  const seen = new Set<string>();
  const blocks = html.split(/(?=<[^>]+\bdata-ecl-file\b)/i).slice(1);
  for (const block of blocks) {
    const href = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*\becl-file__download\b/i)?.[1]
      ?? block.match(/<a[^>]+class=["'][^"']*\becl-file__download\b[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    let url: URL;
    try {
      url = new URL(decodeHtml(href), pageUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.hostname !== "single-market-economy.ec.europa.eu" || !url.pathname.startsWith("/document/download/")) continue;
    const canonicalUrl = url.toString();
    if (seen.has(canonicalUrl)) continue;
    seen.add(canonicalUrl);
    attachments.push({
      title: field(block, "ecl-file__title") || decodeURIComponent(url.searchParams.get("filename") ?? "EU official document"),
      meta: [field(block, "ecl-file__language"), field(block, "ecl-file__meta")].filter(Boolean).join(" · "),
      url: canonicalUrl,
    });
  }
  return attachments;
}

export async function euPublicationParentKey(entry: Pick<NormalizedSourceItem, "guid" | "canonicalUrl">): Promise<string> {
  return (await sha256(entry.guid || entry.canonicalUrl || "missing-parent-key")).slice(0, 20);
}

async function attachmentEntry(parent: NormalizedSourceItem, parentKey: string, attachment: EuAttachment): Promise<NormalizedSourceItem> {
  const attachmentKey = (await sha256(attachment.url)).slice(0, 20);
  const title = `EU 文件 · ${attachment.title}`.slice(0, 500);
  const summary = [
    `欧盟官方可下载附件，所属发布：${parent.title}。`,
    attachment.meta ? `文件信息：${attachment.meta}。` : "",
    "当前仅保存附件地址与元数据；需下载并核对全文后再作细节结论。",
  ].filter(Boolean).join(" ");
  return {
    guid: `eu-file:${parentKey}:${attachmentKey}`,
    canonicalUrl: attachment.url,
    contentHash: await sha256(JSON.stringify({ title, summary, publishedAt: parent.publishedAt, canonicalUrl: attachment.url })),
    title,
    summary,
    author: parent.author || "European Commission",
    publishedAt: parent.publishedAt,
  };
}

export async function expandEuPublicationEntries(
  entries: NormalizedSourceItem[],
  config: EuPublicationEnrichmentConfig,
  existingParentKeys: Set<string> = new Set(),
  fetcher: typeof fetch = fetch,
): Promise<NormalizedSourceItem[]> {
  const expanded: NormalizedSourceItem[] = [];
  let fetchedPages = 0;
  for (const entry of entries) {
    expanded.push(entry);
    if (fetchedPages >= config.maxDetailPagesPerRun || !entry.canonicalUrl) continue;
    let url: URL;
    try {
      url = new URL(entry.canonicalUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.hostname !== "single-market-economy.ec.europa.eu" || url.pathname.startsWith("/document/download/")) continue;
    const parentKey = await euPublicationParentKey(entry);
    if (existingParentKeys.has(parentKey)) continue;
    fetchedPages += 1;
    try {
      const fetched = await safeFetchText(url.toString(), { headers: { accept: "text/html,application/xhtml+xml" } }, fetcher);
      if (!fetched.response.ok) continue;
      const attachments = parseEuPublicationAttachments(fetched.body, fetched.finalUrl).slice(0, config.maxAttachmentsPerItem);
      for (const attachment of attachments) expanded.push(await attachmentEntry(entry, parentKey, attachment));
    } catch {
      // Detail-page failure must not discard the parent RSS item or stop other sources.
    }
  }
  return expanded;
}
