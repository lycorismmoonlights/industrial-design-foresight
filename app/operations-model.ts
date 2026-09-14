import type { InboxItemDto } from "./v2-model";

export type IntegrationId = "rss" | "bls" | "fred" | "sec" | "eurostat" | "deepseek";
export type IntegrationStatus = "ready" | "optional" | "missing" | "disabled";

export interface IntegrationDto {
  id: IntegrationId;
  name: string;
  status: IntegrationStatus;
  detail: string;
  environmentVariables: string[];
  sourceCount: number;
  enabledSourceCount: number;
}

export interface OperationsMetricsDto {
  totalSources: number;
  enabledSources: number;
  unhealthySources: number;
  pendingInbox: number;
  aiCompleted: number;
  aiFailed: number;
}

export interface PipelineRunDto {
  id: string;
  scheduledAt: string;
  triggerType: "scheduled" | "manual";
  requestedBy: string | null;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "success" | "partial" | "failed";
  sourceCount: number;
  sourceSuccessCount: number;
  sourceFailureCount: number;
  newCount: number;
  aiStatus: string;
  aiProcessedCount: number;
  aiFailureCount: number;
  error: string | null;
  metrics: Record<string, unknown>;
}

export interface SyncRunDto {
  id: string;
  sourceId: string;
  sourceName: string;
  adapterType: string;
  status: "success" | "not_modified" | "failed";
  durationMs: number;
  newCount: number;
  error: string | null;
  startedAt: string;
  finishedAt: string;
}

export interface OperationsOverviewDto {
  schedule: {
    cron: "0 16 * * *";
    timezone: "Asia/Shanghai";
    localTime: "00:00";
    aiEnabled: boolean;
    aiModel: string;
    aiDailyItemLimit: number;
    aiMaxAttempts: number;
  };
  metrics: OperationsMetricsDto;
  integrations: IntegrationDto[];
  pipelineRuns: PipelineRunDto[];
  syncRuns: SyncRunDto[];
}

export interface OperationsInboxItemDto extends InboxItemDto {
  sourceName: string;
  adapterType: string;
  sourceCategory: string;
}

export interface OperationsInboxPageDto {
  items: OperationsInboxItemDto[];
  filteredCount: number;
  nextCursor: string | null;
}
