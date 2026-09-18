import type { AppEnv } from "../../db";
import type { SourceDto } from "../v2-model";
import { AppError } from "./errors";
import { safeFetchText } from "./network-safety";

export const ADAPTER_TYPES = ["rss", "bls", "fred", "sec", "eurostat", "manual"] as const;
export const SOURCE_CADENCES = ["daily", "weekly", "monthly"] as const;

export interface NormalizedSourceItem {
  guid: string | null;
  canonicalUrl: string | null;
  contentHash: string;
  title: string;
  summary: string;
  author: string | null;
  publishedAt: string | null;
}

export interface ApiSourceDefinition {
  adapterType: Exclude<SourceDto["adapterType"], "rss" | "manual">;
  adapterConfig: Record<string, unknown>;
  maxItemsPerRun: number;
}

interface SeriesDefinition {
  id: string;
  label: string;
}

function asObject(value: unknown, label = "适配器配置"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError(400, "INVALID_ADAPTER_CONFIG", `${label}必须是 JSON 对象。`);
  }
  return value as Record<string, unknown>;
}

function boundedStrings(value: unknown, field: string, maximum: number, pattern: RegExp): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximum) {
    throw new AppError(400, "INVALID_ADAPTER_CONFIG", `${field} 必须包含 1–${maximum} 项。`);
  }
  const values = value.map((item) => String(item).trim());
  if (values.some((item) => !pattern.test(item))) {
    throw new AppError(400, "INVALID_ADAPTER_CONFIG", `${field} 包含格式不正确的标识符。`);
  }
  return [...new Set(values)];
}

function seriesDefinitions(config: Record<string, unknown>, maximum: number, pattern: RegExp): SeriesDefinition[] {
  if (Array.isArray(config.series)) {
    if (config.series.length === 0 || config.series.length > maximum) {
      throw new AppError(400, "INVALID_ADAPTER_CONFIG", `series 必须包含 1–${maximum} 项。`);
    }
    return config.series.map((raw) => {
      const item = asObject(raw, "series 项");
      const id = String(item.id ?? "").trim();
      if (!pattern.test(id)) throw new AppError(400, "INVALID_ADAPTER_CONFIG", "series.id 格式不正确。");
      const label = String(item.label ?? id).trim().slice(0, 200) || id;
      return { id, label };
    });
  }
  return boundedStrings(config.seriesIds, "seriesIds", maximum, pattern).map((id) => ({ id, label: id }));
}

function parseJson(body: string, source: string): Record<string, unknown> {
  try {
    return asObject(JSON.parse(body), `${source} 响应`);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, "INVALID_SOURCE_RESPONSE", `${source} 返回了无效 JSON。`);
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function normalized(input: Omit<NormalizedSourceItem, "contentHash">): Promise<NormalizedSourceItem> {
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, 500);
  const summary = input.summary.replace(/\s+/g, " ").trim().slice(0, 4000);
  if (!title) throw new AppError(502, "INVALID_SOURCE_RESPONSE", "来源条目缺少标题。");
  return {
    ...input,
    title,
    summary,
    author: input.author?.trim().slice(0, 300) || null,
    contentHash: await sha256(JSON.stringify({ title, summary, publishedAt: input.publishedAt, canonicalUrl: input.canonicalUrl })),
  };
}

function isoPeriod(year: unknown, period: unknown): string | null {
  const yearText = String(year ?? "");
  const periodText = String(period ?? "");
  if (!/^\d{4}$/.test(yearText)) return null;
  const month = periodText.match(/^M(0[1-9]|1[0-2])$/)?.[1];
  if (month) return `${yearText}-${month}-01T00:00:00.000Z`;
  const quarter = Number(periodText.match(/^Q0?([1-4])$/)?.[1]);
  if (quarter) return `${yearText}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01T00:00:00.000Z`;
  return `${yearText}-01-01T00:00:00.000Z`;
}

async function fetchBls(definition: ApiSourceDefinition, appEnv: AppEnv, fetcher: typeof fetch): Promise<NormalizedSourceItem[]> {
  const config = asObject(definition.adapterConfig);
  const series = seriesDefinitions(config, 25, /^[A-Za-z0-9_]+$/);
  const currentYear = new Date().getUTCFullYear();
  const startYear = Number.isInteger(config.startYear) ? Number(config.startYear) : currentYear - 1;
  const endYear = Number.isInteger(config.endYear) ? Number(config.endYear) : currentYear;
  if (startYear < 1900 || endYear < startYear || endYear - startYear > 19) {
    throw new AppError(400, "INVALID_ADAPTER_CONFIG", "BLS 年份范围必须有效且不超过 20 年。");
  }
  const requestBody: Record<string, unknown> = { seriesid: series.map((item) => item.id), startyear: String(startYear), endyear: String(endYear) };
  if (appEnv.BLS_API_KEY) requestBody.registrationkey = appEnv.BLS_API_KEY;
  const fetched = await safeFetchText("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(requestBody),
  }, fetcher);
  if (!fetched.response.ok) throw new AppError(502, "SOURCE_HTTP_ERROR", `BLS 返回 HTTP ${fetched.response.status}。`);
  const payload = parseJson(fetched.body, "BLS");
  if (payload.status !== "REQUEST_SUCCEEDED") {
    const messages = Array.isArray(payload.message) ? payload.message.map(String).join("; ") : "请求未成功";
    throw new AppError(502, "INVALID_SOURCE_RESPONSE", `BLS：${messages.slice(0, 500)}`);
  }
  const results = asObject(payload.Results, "BLS Results");
  const rawSeries = Array.isArray(results.series) ? results.series : [];
  const labels = new Map(series.map((item) => [item.id, item.label]));
  const items: NormalizedSourceItem[] = [];
  for (const raw of rawSeries) {
    const result = asObject(raw, "BLS series");
    const seriesId = String(result.seriesID ?? "");
    for (const rawPoint of Array.isArray(result.data) ? result.data : []) {
      const point = asObject(rawPoint, "BLS data");
      const value = String(point.value ?? "").trim();
      const period = String(point.periodName ?? point.period ?? "").trim();
      if (!value) continue;
      items.push(await normalized({
        guid: `bls:${seriesId}:${String(point.year)}:${String(point.period)}:${value}`,
        canonicalUrl: `https://data.bls.gov/timeseries/${encodeURIComponent(seriesId)}`,
        title: `${labels.get(seriesId) ?? seriesId}：${period || point.year} = ${value}`,
        summary: `BLS series ${seriesId}; period ${String(point.year)} ${period}; value ${value}.`,
        author: "U.S. Bureau of Labor Statistics",
        publishedAt: isoPeriod(point.year, point.period),
      }));
    }
  }
  return items.sort(newestFirst).slice(0, definition.maxItemsPerRun);
}

async function fetchFred(definition: ApiSourceDefinition, appEnv: AppEnv, fetcher: typeof fetch): Promise<NormalizedSourceItem[]> {
  if (!appEnv.FRED_API_KEY) throw new AppError(503, "SOURCE_SECRET_MISSING", "FRED_API_KEY 尚未配置。");
  const config = asObject(definition.adapterConfig);
  const series = seriesDefinitions(config, 10, /^[A-Za-z0-9_.-]+$/);
  const items: NormalizedSourceItem[] = [];
  for (const item of series) {
    const url = new URL("https://api.stlouisfed.org/fred/series/observations");
    url.searchParams.set("series_id", item.id);
    url.searchParams.set("api_key", appEnv.FRED_API_KEY);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("sort_order", "desc");
    url.searchParams.set("limit", String(Math.min(definition.maxItemsPerRun, 10)));
    const fetched = await safeFetchText(url.toString(), { headers: { accept: "application/json" } }, fetcher);
    if (!fetched.response.ok) throw new AppError(502, "SOURCE_HTTP_ERROR", `FRED ${item.id} 返回 HTTP ${fetched.response.status}。`);
    const payload = parseJson(fetched.body, "FRED");
    for (const raw of Array.isArray(payload.observations) ? payload.observations : []) {
      const point = asObject(raw, "FRED observation");
      const date = String(point.date ?? "");
      const value = String(point.value ?? "");
      if (!date || !value || value === ".") continue;
      items.push(await normalized({
        guid: `fred:${item.id}:${date}:${value}`,
        canonicalUrl: `https://fred.stlouisfed.org/series/${encodeURIComponent(item.id)}`,
        title: `${item.label}：${date} = ${value}`,
        summary: `FRED series ${item.id}; observation ${date}; value ${value}.`,
        author: "Federal Reserve Bank of St. Louis",
        publishedAt: /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00.000Z` : null,
      }));
    }
  }
  return items.sort(newestFirst).slice(0, definition.maxItemsPerRun);
}

async function fetchSec(definition: ApiSourceDefinition, appEnv: AppEnv, fetcher: typeof fetch): Promise<NormalizedSourceItem[]> {
  if (!appEnv.SEC_USER_AGENT?.trim()) throw new AppError(503, "SOURCE_CONFIG_MISSING", "SEC_USER_AGENT 尚未配置。");
  const config = asObject(definition.adapterConfig);
  if (!Array.isArray(config.companies) || config.companies.length === 0 || config.companies.length > 10) {
    throw new AppError(400, "INVALID_ADAPTER_CONFIG", "companies 必须包含 1–10 项。");
  }
  const companies = config.companies.map((raw) => {
    const item = asObject(raw, "company");
    const cik = String(item.cik ?? "").replace(/^0+/, "");
    if (!/^\d{1,10}$/.test(cik)) throw new AppError(400, "INVALID_ADAPTER_CONFIG", "company.cik 必须是 1–10 位数字。");
    return { cik, name: String(item.name ?? `CIK ${cik}`).trim().slice(0, 200) };
  });
  const forms = new Set(config.forms === undefined
    ? ["10-K", "10-Q", "8-K"]
    : boundedStrings(config.forms, "forms", 20, /^[A-Za-z0-9/-]+$/));
  const items: NormalizedSourceItem[] = [];
  for (const company of companies) {
    const paddedCik = company.cik.padStart(10, "0");
    const fetched = await safeFetchText(`https://data.sec.gov/submissions/CIK${paddedCik}.json`, {
      headers: { accept: "application/json", "user-agent": appEnv.SEC_USER_AGENT },
    }, fetcher);
    if (!fetched.response.ok) throw new AppError(502, "SOURCE_HTTP_ERROR", `SEC CIK ${company.cik} 返回 HTTP ${fetched.response.status}。`);
    const payload = parseJson(fetched.body, "SEC");
    const filings = asObject(payload.filings, "SEC filings");
    const recent = asObject(filings.recent, "SEC recent filings");
    const accessionNumbers = Array.isArray(recent.accessionNumber) ? recent.accessionNumber : [];
    for (let index = 0; index < accessionNumbers.length && items.length < definition.maxItemsPerRun * companies.length; index += 1) {
      const accession = String(accessionNumbers[index] ?? "");
      const form = String((recent.form as unknown[])?.[index] ?? "");
      if (!accession || !forms.has(form)) continue;
      const filingDate = String((recent.filingDate as unknown[])?.[index] ?? "");
      const reportDate = String((recent.reportDate as unknown[])?.[index] ?? "");
      const document = String((recent.primaryDocument as unknown[])?.[index] ?? "");
      const accessionPath = accession.replace(/-/g, "");
      const canonicalUrl = document
        ? `https://www.sec.gov/Archives/edgar/data/${company.cik}/${accessionPath}/${encodeURIComponent(document)}`
        : `https://www.sec.gov/Archives/edgar/data/${company.cik}/${accessionPath}/`;
      items.push(await normalized({
        guid: `sec:${company.cik}:${accession}`,
        canonicalUrl,
        title: `${company.name} 提交 ${form}（${filingDate || "日期未知"}）`,
        summary: `SEC filing ${accession}; form ${form}; filing date ${filingDate}; report date ${reportDate || "unknown"}.`,
        author: "U.S. Securities and Exchange Commission",
        publishedAt: /^\d{4}-\d{2}-\d{2}$/.test(filingDate) ? `${filingDate}T00:00:00.000Z` : null,
      }));
    }
  }
  return items.sort(newestFirst).slice(0, definition.maxItemsPerRun);
}

function categoryCodes(dimension: Record<string, unknown>): string[] {
  const category = asObject(dimension.category, "Eurostat category");
  if (Array.isArray(category.index)) return category.index.map(String);
  const index = asObject(category.index, "Eurostat category index");
  return Object.entries(index).sort((left, right) => Number(left[1]) - Number(right[1])).map(([code]) => code);
}

function eurostatDate(value: string): string | null {
  if (/^\d{4}$/.test(value)) return `${value}-01-01T00:00:00.000Z`;
  const quarter = value.match(/^(\d{4})-?Q([1-4])$/);
  if (quarter) return `${quarter[1]}-${String((Number(quarter[2]) - 1) * 3 + 1).padStart(2, "0")}-01T00:00:00.000Z`;
  const month = value.match(/^(\d{4})-?M(0[1-9]|1[0-2])$/);
  if (month) return `${month[1]}-${month[2]}-01T00:00:00.000Z`;
  return null;
}

function recentPeriodStart(frequency: string, recentPeriods: number, current = new Date()): string {
  if (frequency === "M") {
    const date = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - recentPeriods + 1, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  if (frequency === "Q") {
    const currentQuarter = Math.floor(current.getUTCMonth() / 3);
    const startQuarterIndex = current.getUTCFullYear() * 4 + currentQuarter - recentPeriods + 1;
    return `${Math.floor(startQuarterIndex / 4)}-Q${(startQuarterIndex % 4) + 1}`;
  }
  return String(current.getUTCFullYear() - recentPeriods + 1);
}

async function fetchEurostat(definition: ApiSourceDefinition, _appEnv: AppEnv, fetcher: typeof fetch): Promise<NormalizedSourceItem[]> {
  const config = asObject(definition.adapterConfig);
  if (!Array.isArray(config.queries) || config.queries.length === 0 || config.queries.length > 10) {
    throw new AppError(400, "INVALID_ADAPTER_CONFIG", "queries 必须包含 1–10 项。");
  }
  const items: NormalizedSourceItem[] = [];
  for (const rawQuery of config.queries) {
    const query = asObject(rawQuery, "Eurostat query");
    const dataset = String(query.dataset ?? "").trim();
    if (!/^[A-Za-z0-9_]+$/.test(dataset)) throw new AppError(400, "INVALID_ADAPTER_CONFIG", "Eurostat dataset 格式不正确。");
    const label = String(query.label ?? dataset).trim().slice(0, 200) || dataset;
    const url = new URL(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}`);
    url.searchParams.set("lang", "en");
    if (query.recentPeriods !== undefined) {
      const recentPeriods = Number(query.recentPeriods);
      if (!Number.isInteger(recentPeriods) || recentPeriods < 1 || recentPeriods > 60) {
        throw new AppError(400, "INVALID_ADAPTER_CONFIG", "Eurostat recentPeriods 必须是 1–60 的整数。");
      }
      const filters = query.filters === undefined ? {} : asObject(query.filters, "Eurostat filters");
      const frequency = String(filters.freq ?? "A").toUpperCase();
      if (!["A", "Q", "M"].includes(frequency)) {
        throw new AppError(400, "INVALID_ADAPTER_CONFIG", "Eurostat recentPeriods 仅支持年、季度或月度频率。");
      }
      url.searchParams.set("sinceTimePeriod", recentPeriodStart(frequency, recentPeriods));
    }
    if (query.filters !== undefined) {
      const filters = asObject(query.filters, "Eurostat filters");
      for (const [key, rawValue] of Object.entries(filters)) {
        if (!/^[A-Za-z0-9_]+$/.test(key)) throw new AppError(400, "INVALID_ADAPTER_CONFIG", "Eurostat filter 名称格式不正确。");
        const values = Array.isArray(rawValue) ? rawValue : [rawValue];
        for (const value of values) url.searchParams.append(key, String(value).slice(0, 100));
      }
    }
    const fetched = await safeFetchText(url.toString(), { headers: { accept: "application/json" } }, fetcher);
    if (!fetched.response.ok) throw new AppError(502, "SOURCE_HTTP_ERROR", `Eurostat ${dataset} 返回 HTTP ${fetched.response.status}。`);
    const payload = parseJson(fetched.body, "Eurostat");
    const dimensionIds = Array.isArray(payload.id) ? payload.id.map(String) : [];
    const sizes = Array.isArray(payload.size) ? payload.size.map(Number) : [];
    const dimensions = asObject(payload.dimension, "Eurostat dimensions");
    if (!dimensionIds.length || dimensionIds.length !== sizes.length) throw new AppError(502, "INVALID_SOURCE_RESPONSE", "Eurostat 维度结构不完整。");
    const codes = dimensionIds.map((id) => categoryCodes(asObject(dimensions[id], `Eurostat dimension ${id}`)));
    const rawValues = payload.value;
    const valueEntries: Array<[number, unknown]> = Array.isArray(rawValues)
      ? rawValues.map((value, index) => [index, value])
      : Object.entries(asObject(rawValues, "Eurostat values")).map(([index, value]) => [Number(index), value]);
    for (const [flatIndex, value] of valueEntries) {
      if (value === null || value === undefined || value === "") continue;
      let remainder = flatIndex;
      const coordinates = new Array(dimensionIds.length);
      for (let dimensionIndex = dimensionIds.length - 1; dimensionIndex >= 0; dimensionIndex -= 1) {
        const size = sizes[dimensionIndex];
        coordinates[dimensionIndex] = codes[dimensionIndex][remainder % size];
        remainder = Math.floor(remainder / size);
      }
      const coordinateText = dimensionIds.map((id, index) => `${id}=${coordinates[index]}`).join(", ");
      const timeIndex = dimensionIds.findIndex((id) => id.toLowerCase() === "time");
      const time = timeIndex >= 0 ? String(coordinates[timeIndex] ?? "") : "";
      items.push(await normalized({
        guid: `eurostat:${dataset}:${coordinateText}:${String(value)}`,
        canonicalUrl: `https://ec.europa.eu/eurostat/databrowser/view/${encodeURIComponent(dataset)}/default/table?lang=en`,
        title: `${label}：${time || coordinateText} = ${String(value)}`,
        summary: `Eurostat dataset ${dataset}; ${coordinateText}; value ${String(value)}.`,
        author: "Eurostat",
        publishedAt: eurostatDate(time),
      }));
    }
  }
  return items.sort(newestFirst).slice(0, definition.maxItemsPerRun);
}

function newestFirst(left: NormalizedSourceItem, right: NormalizedSourceItem): number {
  return String(right.publishedAt ?? "").localeCompare(String(left.publishedAt ?? ""));
}

export function validateAdapterConfig(adapterType: SourceDto["adapterType"], value: unknown): Record<string, unknown> {
  const config = value === undefined ? {} : asObject(value);
  const encoded = JSON.stringify(config);
  if (encoded.length > 20_000) throw new AppError(413, "ADAPTER_CONFIG_TOO_LARGE", "适配器配置不能超过 20 KB。");
  const pending: unknown[] = [config];
  let secretKey: string | undefined;
  while (pending.length && !secretKey) {
    const current = pending.pop();
    if (!current || typeof current !== "object") continue;
    for (const [key, nested] of Object.entries(current)) {
      if (/(?:secret|password|token|api.?key)/i.test(key)) {
        secretKey = key;
        break;
      }
      if (nested && typeof nested === "object") pending.push(nested);
    }
  }
  if (secretKey) throw new AppError(400, "SECRET_IN_SOURCE_CONFIG", `不要在来源配置中保存密钥字段 ${secretKey}；请使用运行时环境变量。`);
  if (adapterType === "bls") seriesDefinitions(config, 25, /^[A-Za-z0-9_]+$/);
  if (adapterType === "fred") seriesDefinitions(config, 10, /^[A-Za-z0-9_.-]+$/);
  if (adapterType === "sec") {
    if (!Array.isArray(config.companies) || config.companies.length === 0 || config.companies.length > 10) {
      throw new AppError(400, "INVALID_ADAPTER_CONFIG", "companies 必须包含 1–10 项。");
    }
  }
  if (adapterType === "eurostat") {
    if (!Array.isArray(config.queries) || config.queries.length === 0 || config.queries.length > 10) {
      throw new AppError(400, "INVALID_ADAPTER_CONFIG", "queries 必须包含 1–10 项。");
    }
    for (const rawQuery of config.queries) {
      const query = asObject(rawQuery, "Eurostat query");
      if (query.recentPeriods !== undefined) {
        const recentPeriods = Number(query.recentPeriods);
        if (!Number.isInteger(recentPeriods) || recentPeriods < 1 || recentPeriods > 60) {
          throw new AppError(400, "INVALID_ADAPTER_CONFIG", "Eurostat recentPeriods 必须是 1–60 的整数。");
        }
      }
    }
  }
  if (adapterType === "rss" && config.enrichment !== undefined) {
    if (config.enrichment !== "eu_publication") {
      throw new AppError(400, "INVALID_ADAPTER_CONFIG", "RSS enrichment 类型不受支持。");
    }
    for (const [key, fallback, maximum] of [["maxDetailPagesPerRun", 5, 10], ["maxAttachmentsPerItem", 4, 10]] as const) {
      const number = Number(config[key] ?? fallback);
      if (!Number.isInteger(number) || number < 1 || number > maximum) {
        throw new AppError(400, "INVALID_ADAPTER_CONFIG", `${key} 必须是 1–${maximum} 的整数。`);
      }
    }
  }
  return config;
}

export async function fetchApiAdapter(
  definition: ApiSourceDefinition,
  appEnv: AppEnv,
  fetcher: typeof fetch = fetch,
): Promise<NormalizedSourceItem[]> {
  if (definition.adapterType === "bls") return fetchBls(definition, appEnv, fetcher);
  if (definition.adapterType === "fred") return fetchFred(definition, appEnv, fetcher);
  if (definition.adapterType === "sec") return fetchSec(definition, appEnv, fetcher);
  return fetchEurostat(definition, appEnv, fetcher);
}
