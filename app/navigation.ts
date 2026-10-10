import type { ViewId } from "./model";

export type WorkspaceId = "overview" | "research" | "library" | "action" | "settings";

export interface WorkspaceDefinition {
  id: WorkspaceId;
  label: string;
  description: string;
  views: ReadonlyArray<{ id: ViewId; label: string }>;
}

// Keep existing view IDs so saved preferences and in-app shortcuts remain valid.
export const WORKSPACES: ReadonlyArray<WorkspaceDefinition> = [
  { id: "overview", label: "总览", description: "查看研究进度与本周待办", views: [
    { id: "dashboard", label: "研究概览" }, { id: "weekly", label: "每周复盘" },
  ] },
  { id: "research", label: "经济研究", description: "从信号到指标、假设与决策", views: [
    { id: "radar", label: "信号雷达" }, { id: "forecast", label: "指标与假设" }, { id: "discussions", label: "讨论与决策" },
  ] },
  { id: "library", label: "资料中心", description: "审核资料、管理证据与来源", views: [
    { id: "inbox", label: "待审核" }, { id: "evidence", label: "证据库" }, { id: "sources", label: "来源管理" },
  ] },
  { id: "action", label: "行动计划", description: "把研究转为机会与能力准备", views: [
    { id: "opportunities", label: "机会库" }, { id: "skills", label: "技能库" },
  ] },
  { id: "settings", label: "设置与备份", description: "检查运行状态与维护数据", views: [
    { id: "operations", label: "运行监控" }, { id: "data", label: "数据与备份" },
  ] },
];

export function isViewId(value: string | null): value is ViewId {
  return value !== null && WORKSPACES.some((workspace) => workspace.views.some((view) => view.id === value));
}

export function workspaceForView(view: ViewId): WorkspaceDefinition {
  return WORKSPACES.find((workspace) => workspace.views.some((item) => item.id === view)) ?? WORKSPACES[0];
}
