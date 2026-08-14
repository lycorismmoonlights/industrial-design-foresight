export type ViewId =
  | "dashboard"
  | "radar"
  | "forecast"
  | "skills"
  | "opportunities"
  | "discussions"
  | "weekly"
  | "sources"
  | "inbox"
  | "evidence"
  | "data";

export type RadarRing = "关注" | "研究" | "试验" | "行动";
export type RadarQuadrant = "需求与商业" | "技术与工具" | "制造与材料" | "社会与规则";
export type Movement = "上升" | "稳定" | "下降";
export type CrisisPhase = "P0" | "P1" | "P2" | "P3" | "P4";

export interface Signal {
  id: string;
  title: string;
  summary: string;
  quadrant: RadarQuadrant;
  ring: RadarRing;
  movement: Movement;
  impact: -2 | -1 | 0 | 1 | 2;
  confidence: number;
  sourceName: string;
  sourceUrl?: string;
  observedAt: string;
  tags: string[];
}

export interface Indicator {
  id: string;
  label: string;
  category: RadarQuadrant;
  value: -2 | -1 | 0 | 1 | 2;
  direction: -1 | 0 | 1;
  weight: number;
  note: string;
}

export interface Hypothesis {
  id: string;
  title: string;
  statement: string;
  timeWindow: string;
  confidence: number;
  status: "待验证" | "跟踪中" | "部分支持" | "被削弱";
  evidenceFor: string[];
  evidenceAgainst: string[];
  falsifier: string;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  level: 0 | 1 | 2 | 3 | 4;
  target: 0 | 1 | 2 | 3 | 4;
  priority: "高" | "中" | "低";
  evidence: string;
  nextAction: string;
  crisisValue: string;
}

export interface Opportunity {
  id: string;
  title: string;
  horizon: "现在" | "危机期" | "复苏窗口";
  status: "观察" | "准备" | "验证" | "进入";
  trigger: string;
  targetUser: string;
  readiness: number;
  timing: number;
  resilience: number;
  nextAction: string;
}

export interface Discussion {
  id: string;
  title: string;
  category: "研究问题" | "反方证据" | "行动提案" | "复盘";
  body: string;
  author: string;
  createdAt: string;
  replies: number;
  status: "开放" | "已形成决策" | "归档";
  decision?: string;
}

export interface ResearchStore {
  version: 1;
  updatedAt: string;
  signals: Signal[];
  indicators: Indicator[];
  hypotheses: Hypothesis[];
  skills: Skill[];
  opportunities: Opportunity[];
  discussions: Discussion[];
}

export interface PhaseResult {
  phase: CrisisPhase;
  pressure: number;
  rebound: number;
  label: string;
  posture: string;
  action: string;
  accent: string;
}

export const STORAGE_KEY = "id-foresight-demo-v1";

export const phaseMeta: Record<CrisisPhase, Omit<PhaseResult, "phase" | "pressure" | "rebound">> = {
  P0: {
    label: "前瞻准备期",
    posture: "研究 + 储备",
    action: "完成技能基线，按月积累可追溯信号，不因单条新闻改变方向。",
    accent: "mint",
  },
  P1: {
    label: "过热与对冲期",
    posture: "降噪 + 对冲",
    action: "降低单一工具押注，把学习转向研究、工程落地和跨行业迁移能力。",
    accent: "amber",
  },
  P2: {
    label: "泡沫断裂期",
    posture: "防守 + 验证",
    action: "保留时间和现金冗余，只做低成本、能验证真实需求的设计实验。",
    accent: "coral",
  },
  P3: {
    label: "低谷压缩期",
    posture: "聚焦 + 积累",
    action: "追踪真实订单、供应链和降本需求，形成可量化的工业设计案例。",
    accent: "violet",
  },
  P4: {
    label: "复苏窗口期",
    posture: "快速进入",
    action: "在 6–12 个月窗口集中投递、合作和原型验证，把储备转为市场位置。",
    accent: "blue",
  },
};

export function calculatePhase(indicators: Indicator[]): PhaseResult {
  const totalWeight = indicators.reduce((sum, item) => sum + item.weight, 0) || 1;
  const weightedValue = indicators.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
  const pressure = Math.round(((2 - weightedValue) / 4) * 100);
  const rebound = indicators.reduce((sum, item) => sum + item.direction * item.weight, 0) / totalWeight;

  let phase: CrisisPhase;
  if (pressure >= 75 && rebound <= 0) phase = "P3";
  else if (pressure >= 55 && rebound < 0.45) phase = "P2";
  else if (pressure >= 40 && rebound >= 0.45) phase = "P4";
  else if (pressure >= 35) phase = "P1";
  else phase = "P0";

  return { phase, pressure, rebound, ...phaseMeta[phase] };
}

export function scoreOpportunity(item: Opportunity): number {
  return Math.round(item.readiness * 0.35 + item.timing * 0.35 + item.resilience * 0.3);
}

export function isResearchStore(value: unknown): value is ResearchStore {
  if (!value || typeof value !== "object") return false;
  const store = value as Partial<ResearchStore>;
  return (
    store.version === 1 &&
    Array.isArray(store.signals) &&
    Array.isArray(store.indicators) &&
    Array.isArray(store.hypotheses) &&
    Array.isArray(store.skills) &&
    Array.isArray(store.opportunities) &&
    Array.isArray(store.discussions)
  );
}

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
