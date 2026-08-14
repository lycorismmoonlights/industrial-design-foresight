import type { ResearchStore } from "./model";

export const RECORD_KINDS = ["signal", "indicator", "hypothesis", "skill", "opportunity", "discussion"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];
export type RecordStatus = "draft" | "published" | "archived";

export interface RecordDto {
  id: string;
  kind: RecordKind;
  status: RecordStatus;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  revision: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
}

export interface RevisionDto {
  id: string;
  recordId: string;
  revision: number;
  snapshot: RecordDto;
  changeReason: string | null;
  changedBy: string;
  createdAt: string;
}

export interface SourceDto {
  id: string;
  name: string;
  pageUrl: string | null;
  feedUrl: string | null;
  sourceType: "rss" | "atom" | "manual";
  sourceCategory: string;
  defaultCredibility: number;
  enabled: boolean;
  lastFetchAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastDurationMs: number | null;
  lastNewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface InboxItemDto {
  id: string;
  sourceId: string;
  title: string;
  summary: string;
  author: string | null;
  canonicalUrl: string | null;
  publishedAt: string | null;
  reviewStatus: "pending" | "rejected" | "ignored" | "converted";
  recordId: string | null;
  createdAt: string;
}

export interface EvidenceDto {
  id: string;
  title: string;
  url: string | null;
  sourceName: string;
  sourceCategory: string;
  credibility: number;
  relevance: number;
  stance: "supports" | "opposes" | "context";
  note: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BootstrapDto {
  user: { userId: string; email: string; displayName: string };
  records: RecordDto[];
  sources: SourceDto[];
  inboxStats: { pending: number; reviewed: number };
  inboxItems: InboxItemDto[];
  evidence: EvidenceDto[];
  settings: Record<string, unknown>;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

const V1_COLLECTIONS = {
  signal: "signals",
  indicator: "indicators",
  hypothesis: "hypotheses",
  skill: "skills",
  opportunity: "opportunities",
  discussion: "discussions",
} as const satisfies Record<RecordKind, keyof ResearchStore>;

export function titleForV1(kind: RecordKind, payload: Record<string, unknown>): string {
  if (kind === "indicator") return String(payload.label ?? "未命名指标");
  if (kind === "skill") return String(payload.name ?? "未命名技能");
  return String(payload.title ?? `未命名${kind}`);
}

export function recordsToV1(records: RecordDto[]): ResearchStore {
  const store: ResearchStore = {
    version: 1,
    updatedAt: records.reduce((latest, record) => record.updatedAt > latest ? record.updatedAt : latest, new Date(0).toISOString()),
    signals: [],
    indicators: [],
    hypotheses: [],
    skills: [],
    opportunities: [],
    discussions: [],
  };

  for (const record of records.filter((item) => !item.deletedAt && item.status !== "archived")) {
    const collection = V1_COLLECTIONS[record.kind];
    const legacy = { ...record.payload, id: record.id };
    (store[collection] as unknown as Array<Record<string, unknown>>).push(legacy);
  }
  return store;
}

export function v1Collections() {
  return V1_COLLECTIONS;
}
