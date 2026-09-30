import { describe, expect, it, vi } from "vitest";
import { euPublicationParentKey, expandEuPublicationEntries, parseEuPublicationAttachments } from "../app/server/source-enrichment";
import type { NormalizedSourceItem } from "../app/server/source-adapters";

const pageUrl = "https://single-market-economy.ec.europa.eu/publications/example_en";
const html = `
  <html><body>
    <article data-ecl-file id="ecl-file-1">
      <div class="ecl-file__title">COM(2026) 100 Industrial package</div>
      <div class="ecl-file__language">English</div>
      <div class="ecl-file__meta">(320 KB - PDF)</div>
      <a href="/document/download/file-1_en?filename=COM_2026_100.pdf" class="ecl-file__download">Download</a>
    </article>
    <article data-ecl-file id="ecl-file-2">
      <div class="ecl-file__title">Annex &amp; methodology</div>
      <div class="ecl-file__language">English</div>
      <div class="ecl-file__meta">(110 KB - PDF)</div>
      <a class="ecl-file__download" href="/document/download/file-2_en?filename=annex.pdf">Download</a>
    </article>
  </body></html>`;

const parent: NormalizedSourceItem = {
  guid: "eu-parent-1",
  canonicalUrl: pageUrl,
  contentHash: "parent-hash",
  title: "EU industrial package",
  summary: "Landing page summary.",
  author: "European Commission",
  publishedAt: "2026-09-01T00:00:00.000Z",
};

describe("EU publication attachment enrichment", () => {
  it("extracts official downloadable files without treating their body as already read", () => {
    expect(parseEuPublicationAttachments(html, pageUrl)).toEqual([
      {
        title: "COM(2026) 100 Industrial package",
        meta: "English · (320 KB - PDF)",
        url: "https://single-market-economy.ec.europa.eu/document/download/file-1_en?filename=COM_2026_100.pdf",
      },
      {
        title: "Annex & methodology",
        meta: "English · (110 KB - PDF)",
        url: "https://single-market-economy.ec.europa.eu/document/download/file-2_en?filename=annex.pdf",
      },
    ]);
  });

  it("adds attachment records and skips detail pages that were already expanded", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));
    const config = { enrichment: "eu_publication" as const, maxDetailPagesPerRun: 5, maxAttachmentsPerItem: 4 };
    const expanded = await expandEuPublicationEntries([parent], config, new Set(), fetcher as unknown as typeof fetch);
    expect(expanded).toHaveLength(3);
    expect(expanded[1]).toMatchObject({
      title: "EU 文件 · COM(2026) 100 Industrial package",
      author: "European Commission",
    });
    expect(expanded[1].summary).toContain("需下载并核对全文后再作细节结论");
    expect(expanded[1].guid).toMatch(/^eu-file:/);

    const parentKey = await euPublicationParentKey(parent);
    const skipped = await expandEuPublicationEntries([parent], config, new Set([parentKey]), fetcher as unknown as typeof fetch);
    expect(skipped).toEqual([parent]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
