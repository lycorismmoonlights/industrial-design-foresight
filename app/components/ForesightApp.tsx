"use client";

import {
  Archive,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Clock3,
  Database,
  Download,
  ExternalLink,
  Filter,
  Gauge,
  GraduationCap,
  History,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Plus,
  Radar,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { demoStore, scenarioPresets } from "../demo-data";
import { useResearchData, type InitialUser } from "../hooks/useResearchData";
import {
  calculatePhase,
  phaseMeta,
  scoreOpportunity,
  type CrisisPhase,
  type Discussion,
  type Indicator,
  type Opportunity,
  type RadarQuadrant,
  type RadarRing,
  type ResearchStore,
  type Signal,
  type Skill,
  type ViewId,
} from "../model";
import type { RecordDto, RevisionDto } from "../v2-model";

type ModalType = "signal" | "skill" | "opportunity" | "discussion" | null;

const NAV: Array<{ id: ViewId; label: string; icon: LucideIcon; group?: string }> = [
  { id: "dashboard", label: "研究总览", icon: LayoutDashboard, group: "工作台" },
  { id: "radar", label: "行业雷达", icon: Radar },
  { id: "forecast", label: "2029 预测", icon: BrainCircuit },
  { id: "skills", label: "技能库", icon: GraduationCap, group: "准备与进入" },
  { id: "opportunities", label: "机会库", icon: BriefcaseBusiness },
  { id: "discussions", label: "讨论与决策", icon: MessageSquareText, group: "协作与维护" },
  { id: "data", label: "数据与备份", icon: Database },
];

const VIEW_COPY: Record<ViewId, { eyebrow: string; title: string; description: string }> = {
  dashboard: { eyebrow: "研究工作台", title: "工业设计前瞻总览", description: "把行业信号、核心假设、能力储备和入场动作放在同一条证据链上。" },
  radar: { eyebrow: "持续扫描", title: "工业设计行业雷达", description: "按影响领域与行动成熟度组织信号；越靠中心，越需要投入行动。" },
  forecast: { eyebrow: "核心研究假设", title: "2029 危机与复苏推演", description: "年份和恢复周期是待验证假设。用反方证据和触发器管理不确定性。" },
  skills: { eyebrow: "可迁移能力", title: "技能储备库", description: "用可验证成果而不是“学过”管理技能，优先补齐危机中仍有价值的能力。" },
  opportunities: { eyebrow: "进入准备", title: "机会窗口库", description: "分别管理现在、危机期和复苏窗口的进入条件，避免把趋势等同于机会。" },
  discussions: { eyebrow: "研究协作", title: "讨论与决策", description: "区分开放讨论、反方证据和正式决定，让研究过程可追溯。" },
  data: { eyebrow: "云端数据", title: "记录、历史与备份", description: "D1 保存全部研究记录与版本；浏览器只保留界面偏好。" },
};

const RINGS: RadarRing[] = ["行动", "试验", "研究", "关注"];
const QUADRANTS: RadarQuadrant[] = ["需求与商业", "技术与工具", "制造与材料", "社会与规则"];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function phaseForSignal(signal: Signal, index: number) {
  const quadrantCenter: Record<RadarQuadrant, number> = {
    "需求与商业": 225,
    "技术与工具": 315,
    "制造与材料": 45,
    "社会与规则": 135,
  };
  const radius: Record<RadarRing, number> = { "行动": 13, "试验": 25, "研究": 36, "关注": 45 };
  const angle = ((quadrantCenter[signal.quadrant] + ((index % 5) - 2) * 12) * Math.PI) / 180;
  const r = radius[signal.ring] + (index % 2 ? 2 : -1);
  return { left: `${50 + Math.cos(angle) * r}%`, top: `${50 + Math.sin(angle) * r}%` };
}

function confidenceTone(value: number) {
  if (value >= 70) return "positive";
  if (value >= 50) return "watch";
  return "muted";
}

export function ForesightApp({ initialUser }: { initialUser: InitialUser }) {
  const research = useResearchData(initialUser);
  const { store } = research;
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [notice, setNotice] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedView = window.localStorage.getItem("id-foresight-ui-view") as ViewId | null;
    const timer = window.setTimeout(() => {
      if (savedView && NAV.some((item) => item.id === savedView)) setActiveView(savedView);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("id-foresight-ui-view", activeView);
  }, [activeView]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const phase = useMemo(() => calculatePhase(store.indicators), [store.indicators]);
  const searchSignals = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return store.signals;
    return store.signals.filter((item) => [item.title, item.summary, item.sourceName, ...item.tags].join(" ").toLowerCase().includes(needle));
  }, [query, store.signals]);

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      setNotice(success);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败，请重试。");
    }
  }

  function navigate(view: ViewId) {
    setActiveView(view);
    setMenuOpen(false);
  }

  function updateIndicator(id: string, patch: Partial<Indicator>) {
    void run(() => research.patchLegacy("indicator", id, patch as Record<string, unknown>), "指标已保存");
  }

  function applyScenario(key: keyof typeof scenarioPresets) {
    const preset = scenarioPresets[key];
    void run(
      () => Promise.all(store.indicators.map((item, index) => research.patchLegacy("indicator", item.id, {
        value: preset.values[index] as Indicator["value"],
        direction: preset.directions[index] as Indicator["direction"],
      }))),
      `已载入“${preset.label}”情景`,
    );
  }

  function updateSkill(id: string, level: Skill["level"]) {
    void run(() => research.patchLegacy("skill", id, { level }), "技能进度已保存");
  }

  function updateOpportunity(id: string, status: Opportunity["status"]) {
    void run(() => research.patchLegacy("opportunity", id, { status }), "机会状态已更新");
  }

  function convertDecision(id: string) {
    const item = store.discussions.find((discussion) => discussion.id === id);
    if (!item) return;
    void run(() => research.patchLegacy("discussion", id, {
      status: "已形成决策",
      decision: `采纳方向：${item.title}。下一轮研究按提案补充证据并复盘。`,
    }), "讨论已转为可追溯决策");
  }

  async function exportData() {
    const backup = await research.exportV2();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `工业设计前瞻研究备份-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("v2 完整 JSON 备份已导出");
  }

  async function importData(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await research.importV1(await file.text());
      setNotice(`v1 导入成功：${Object.values(result.counts).reduce((sum, count) => sum + count, 0)} 条记录`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "导入失败：文件不是 v1 JSON 备份");
    } finally {
      event.target.value = "";
    }
  }

  async function importExample() {
    await run(() => research.importV1(JSON.stringify(demoStore)), "示例研究数据已导入");
  }

  async function createRecord(kind: Exclude<ModalType, null>, value: Record<string, unknown>) {
    await run(() => research.createLegacy(kind, value), "记录已保存到云端");
  }

  if (research.loading && !research.records.length) {
    return <main className="loading-page"><Radar size={28} /><p>正在连接私有研究库…</p></main>;
  }

  const page = VIEW_COPY[activeView];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
        <div className="brand-block">
          <div className="brand-mark"><Radar size={21} strokeWidth={1.8} /></div>
          <div><strong>工业设计前瞻站</strong><span>FORESIGHT · LAB 01</span></div>
        </div>
        <nav className="side-nav" aria-label="主导航">
          {NAV.map((item, index) => {
            const Icon = item.icon;
            const showGroup = item.group && (index === 0 || NAV[index - 1].group !== item.group);
            return (
              <div key={item.id}>
                {showGroup && <p className="nav-group">{item.group}</p>}
                <button className={activeView === item.id ? "active" : ""} onClick={() => navigate(item.id)}>
                  <Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>
                  {item.id === "discussions" && <em>{store.discussions.filter((x) => x.status === "开放").length}</em>}
                </button>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status"><ShieldCheck size={16} /><div><strong>私有云端模式</strong><span>{research.data.user.email}</span></div></div>
          <div className="version-line"><span>PERSONAL v0.2</span><a href="/signout-with-chatgpt?return_to=/">退出</a></div>
        </div>
      </aside>

      {menuOpen && <button className="mobile-scrim" aria-label="关闭菜单" onClick={() => setMenuOpen(false)} />}

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" aria-label="打开菜单" onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
          <label className="global-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索信号、来源或标签…" /><kbd>⌘ K</kbd></label>
          <div className="top-actions">
            <div className={`phase-pill ${phase.accent}`}><span>{phase.phase}</span>{phase.label}</div>
            <button className="button primary compact" onClick={() => setModalType("signal")}><Plus size={16} />新增记录</button>
          </div>
        </header>

        <div className="page-wrap">
          <div className="page-heading">
            <div><p className="eyebrow">{page.eyebrow}</p><h1>{page.title}</h1><p>{page.description}</p></div>
            <div className="heading-meta"><span><Clock3 size={14} />{research.records.length ? `更新 ${formatDate(store.updatedAt)}` : "尚无研究记录"}</span><span className="demo-badge">人工审核 · 云端可追溯</span></div>
          </div>

          {research.error && <div className="inline-error">{research.error}<button onClick={() => void research.refresh()}>重试</button></div>}
          {!research.records.length && activeView !== "data" && <section className="empty-cloud"><Database size={24} /><div><h2>研究库目前为空</h2><p>导入旧版备份或示例数据后，即可继续使用雷达、预测、技能和机会功能。</p></div><button className="button secondary" onClick={() => navigate("data")}>前往导入</button></section>}

          {activeView === "dashboard" && (
            <DashboardView store={store} phase={phase} signals={searchSignals} navigate={navigate} applyScenario={applyScenario} />
          )}
          {activeView === "radar" && <RadarView signals={searchSignals} openAdd={() => setModalType("signal")} />}
          {activeView === "forecast" && (
            <ForecastView store={store} phase={phase} updateIndicator={updateIndicator} applyScenario={applyScenario} />
          )}
          {activeView === "skills" && <SkillsView skills={store.skills} updateSkill={updateSkill} openAdd={() => setModalType("skill")} />}
          {activeView === "opportunities" && <OpportunityView opportunities={store.opportunities} updateStatus={updateOpportunity} openAdd={() => setModalType("opportunity")} />}
          {activeView === "discussions" && <DiscussionView discussions={store.discussions} convertDecision={convertDecision} openAdd={() => setModalType("discussion")} />}
          {activeView === "data" && (
            <DataView store={store} records={research.records} exportData={() => void exportData()} importData={() => importRef.current?.click()} importExample={() => void importExample()} archive={(record) => void run(() => research.setStatus(record, "archived"), "记录已归档")} restore={(record) => void run(() => record.deletedAt ? research.restore(record) : research.setStatus(record, "published"), "记录已恢复")} remove={(record) => void run(() => research.softDelete(record), "记录已移入回收站")} revisions={research.revisions} update={(record, patch, reason) => research.updateRecord(record, patch, reason)} />
          )}
        </div>
      </main>

      <input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importData} />
      {modalType && <AddRecordModal type={modalType} close={() => setModalType(null)} create={createRecord} changeType={setModalType} />}
      {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
    </div>
  );
}

function DashboardView({ store, phase, signals, navigate, applyScenario }: { store: ResearchStore; phase: ReturnType<typeof calculatePhase>; signals: Signal[]; navigate: (view: ViewId) => void; applyScenario: (key: keyof typeof scenarioPresets) => void }) {
  const highPriorityGaps = store.skills.filter((item) => item.priority === "高" && item.level < item.target).length;
  const readyOpportunities = store.opportunities.filter((item) => scoreOpportunity(item) >= 65).length;
  return (
    <div className="view-stack">
      <section className="scenario-hero">
        <div className="hero-copy">
          <div className="hero-kicker"><Sparkles size={15} />核心研究情景</div>
          <h2>2029 左右可能破裂，<br /><span>6–12 个月或出现复苏窗口</span></h2>
          <p>这不是结论，而是系统的压力测试基线。所有准备动作必须同时回答：如果年份偏移、恢复更慢，能力是否仍然有用？</p>
          <div className="hero-actions"><button className="button light" onClick={() => navigate("forecast")}>查看假设与反证 <ArrowRight size={16} /></button><button className="text-button" onClick={() => applyScenario("rupture")}>演示断裂情景</button></div>
        </div>
        <div className="hero-metrics">
          <div className="pressure-gauge" style={{ "--value": `${phase.pressure * 3.6}deg` } as React.CSSProperties}>
            <div><strong>{phase.pressure}</strong><span>压力指数</span></div>
          </div>
          <div className="phase-readout"><span>系统建议阶段</span><strong>{phase.phase} · {phase.label}</strong><p>{phase.posture}</p></div>
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard icon={Radar} label="行业信号" value={store.signals.length} unit="条" detail={`${store.signals.filter((x) => x.movement === "上升").length} 条正在上升`} tone="blue" onClick={() => navigate("radar")} />
        <MetricCard icon={BrainCircuit} label="核心假设" value={store.hypotheses.length} unit="项" detail={`平均置信度 ${Math.round(store.hypotheses.reduce((s, x) => s + x.confidence, 0) / store.hypotheses.length)}%`} tone="violet" onClick={() => navigate("forecast")} />
        <MetricCard icon={GraduationCap} label="高优先级缺口" value={highPriorityGaps} unit="项" detail="优先补齐可验证成果" tone="amber" onClick={() => navigate("skills")} />
        <MetricCard icon={Target} label="可准备机会" value={readyOpportunities} unit="项" detail="综合评分 ≥ 65" tone="mint" onClick={() => navigate("opportunities")} />
      </section>

      <section className="two-column wide-left">
        <div className="panel">
          <PanelTitle eyebrow="危机导航" title="五阶段行动路线" action={<button className="link-action" onClick={() => navigate("forecast")}>打开推演 <ChevronRight size={15} /></button>} />
          <div className="phase-roadmap">
            {(Object.keys(phaseMeta) as CrisisPhase[]).map((key, index) => (
              <div className={`roadmap-step ${key === phase.phase ? "current" : ""}`} key={key}>
                <div className="step-track"><span>{key}</span>{index < 4 && <i />}</div>
                <strong>{phaseMeta[key].label}</strong><p>{phaseMeta[key].posture}</p>
              </div>
            ))}
          </div>
          <div className="action-banner"><div><span>当前建议动作</span><strong>{phase.action}</strong></div><button onClick={() => navigate(phase.phase === "P4" ? "opportunities" : "skills")}>进入行动区 <ArrowRight size={16} /></button></div>
        </div>
        <div className="panel">
          <PanelTitle eyebrow="本周队列" title="下一步最小动作" />
          <div className="task-list">
            {[
              ["补 1 条反方证据", "2029 假设", "forecast"],
              ["完成小家电逆向拆解", "结构 / DFM", "skills"],
              ["验证降本改造触发器", "机会 04", "opportunities"],
            ].map(([title, meta, view], index) => (
              <button key={title} onClick={() => navigate(view as ViewId)}><span className="task-index">0{index + 1}</span><div><strong>{title}</strong><small>{meta}</small></div><ArrowUpRight size={16} /></button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <PanelTitle eyebrow="新近观察" title="最近行业信号" action={<button className="link-action" onClick={() => navigate("radar")}>查看全部 <ChevronRight size={15} /></button>} />
        <div className="signal-table desktop-table">
          <div className="table-row table-head"><span>信号</span><span>象限</span><span>行动环</span><span>方向</span><span>可信度</span><span>日期</span></div>
          {signals.slice(0, 5).map((signal) => <SignalRow key={signal.id} signal={signal} />)}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, unit, detail, tone, onClick }: { icon: LucideIcon; label: string; value: number; unit: string; detail: string; tone: string; onClick: () => void }) {
  return <button className="metric-card" onClick={onClick}><span className={`metric-icon ${tone}`}><Icon size={18} /></span><span className="metric-label">{label}</span><div className="metric-value"><strong>{value}</strong><span>{unit}</span></div><p>{detail}</p><ArrowUpRight className="metric-arrow" size={16} /></button>;
}

function PanelTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return <div className="panel-title"><div>{eyebrow && <p>{eyebrow}</p>}<h2>{title}</h2></div>{action}</div>;
}

function SignalRow({ signal }: { signal: Signal }) {
  return <div className="table-row"><div className="signal-title"><span className={`impact-dot impact-${signal.impact}`} /><div><strong>{signal.title}</strong><small>{signal.tags.join(" · ")}</small></div></div><span>{signal.quadrant}</span><span><em className={`ring-tag ring-${signal.ring}`}>{signal.ring}</em></span><span className={`movement movement-${signal.movement}`}>{signal.movement === "上升" ? <ArrowUpRight size={14} /> : signal.movement === "下降" ? <ArrowDownRight size={14} /> : <ArrowRight size={14} />}{signal.movement}</span><span><em className={`confidence ${confidenceTone(signal.confidence)}`}>{signal.confidence}%</em></span><span>{formatDate(signal.observedAt)}</span></div>;
}

function RadarView({ signals, openAdd }: { signals: Signal[]; openAdd: () => void }) {
  const [quadrant, setQuadrant] = useState<RadarQuadrant | "全部">("全部");
  const [ring, setRing] = useState<RadarRing | "全部">("全部");
  const [selected, setSelected] = useState(signals[0]?.id ?? "");
  const filtered = signals.filter((item) => (quadrant === "全部" || item.quadrant === quadrant) && (ring === "全部" || item.ring === ring));
  const selectedSignal = signals.find((item) => item.id === selected) ?? filtered[0];
  return (
    <div className="view-stack">
      <section className="filter-bar"><div className="filter-group"><Filter size={15} /><span>象限</span>{["全部", ...QUADRANTS].map((item) => <button key={item} className={quadrant === item ? "active" : ""} onClick={() => setQuadrant(item as RadarQuadrant | "全部")}>{item}</button>)}</div><div className="filter-group"><span>行动环</span>{["全部", ...RINGS].map((item) => <button key={item} className={ring === item ? "active" : ""} onClick={() => setRing(item as RadarRing | "全部")}>{item}</button>)}</div></section>
      <section className="radar-layout">
        <div className="panel radar-panel">
          <div className="radar-legend"><span><i className="legend-up" />上升</span><span><i className="legend-stable" />稳定</span><span><i className="legend-down" />下降</span><small>{filtered.length} / {signals.length} 条可见</small></div>
          <div className="radar-map" aria-label="行业信号雷达">
            <div className="radar-axis horizontal" /><div className="radar-axis vertical" />
            <div className="radar-ring radar-r1"><span>行动</span></div><div className="radar-ring radar-r2"><span>试验</span></div><div className="radar-ring radar-r3"><span>研究</span></div><div className="radar-ring radar-r4"><span>关注</span></div>
            <b className="quadrant-label q1">需求与商业</b><b className="quadrant-label q2">技术与工具</b><b className="quadrant-label q3">制造与材料</b><b className="quadrant-label q4">社会与规则</b>
            {filtered.map((signal, index) => <button key={signal.id} className={`radar-blip movement-${signal.movement} ${selectedSignal?.id === signal.id ? "selected" : ""}`} style={phaseForSignal(signal, index)} onClick={() => setSelected(signal.id)} aria-label={signal.title}>{signals.findIndex((x) => x.id === signal.id) + 1}</button>)}
          </div>
          <p className="radar-note">借鉴技术雷达的象限 / 环 / 移动结构；“行动”表示应立即纳入学习或项目，不等于行业已形成共识。</p>
        </div>
        <aside className="panel signal-inspector">
          {selectedSignal ? <>
            <div className="inspector-top"><span className={`ring-tag ring-${selectedSignal.ring}`}>{selectedSignal.ring}</span><em className={`movement movement-${selectedSignal.movement}`}>{selectedSignal.movement}</em></div>
            <h2>{selectedSignal.title}</h2><p>{selectedSignal.summary}</p>
            <dl><div><dt>象限</dt><dd>{selectedSignal.quadrant}</dd></div><div><dt>影响</dt><dd>{selectedSignal.impact > 0 ? `+${selectedSignal.impact}` : selectedSignal.impact}</dd></div><div><dt>可信度</dt><dd>{selectedSignal.confidence}%</dd></div><div><dt>观察日期</dt><dd>{selectedSignal.observedAt}</dd></div></dl>
            <div className="source-box"><span>来源 / 证据</span>{selectedSignal.sourceUrl ? <a href={selectedSignal.sourceUrl} target="_blank" rel="noreferrer">{selectedSignal.sourceName}<ExternalLink size={13} /></a> : <strong>{selectedSignal.sourceName}</strong>}</div>
            <div className="tag-row">{selectedSignal.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          </> : <div className="empty-state"><Radar size={28} /><h2>没有匹配信号</h2><p>调整筛选，或新增一条研究记录。</p><button className="button primary" onClick={openAdd}><Plus size={16} />新增信号</button></div>}
        </aside>
      </section>
      <section className="panel"><PanelTitle eyebrow="结构化清单" title="信号记录" action={<button className="button secondary compact" onClick={openAdd}><Plus size={15} />新增信号</button>} /><div className="signal-table desktop-table"><div className="table-row table-head"><span>信号</span><span>象限</span><span>行动环</span><span>方向</span><span>可信度</span><span>日期</span></div>{filtered.map((signal) => <SignalRow key={signal.id} signal={signal} />)}</div></section>
    </div>
  );
}

function ForecastView({ store, phase, updateIndicator, applyScenario }: { store: ResearchStore; phase: ReturnType<typeof calculatePhase>; updateIndicator: (id: string, patch: Partial<Indicator>) => void; applyScenario: (key: keyof typeof scenarioPresets) => void }) {
  return <div className="view-stack">
    <section className="forecast-summary">
      <div className="forecast-year"><span>核心节点</span><strong>2029</strong><p>研究窗口：2028 Q2 — 2030 Q1</p></div>
      <div className="forecast-arrow"><ArrowRight /></div>
      <div className="forecast-window"><span>预测恢复周期</span><strong>6–12 <small>个月</small></strong><p>若 12 个月无连续改善，必须修正假设</p></div>
      <div className={`forecast-phase ${phase.accent}`}><span>当前情景输出</span><strong>{phase.phase} · {phase.label}</strong><p>压力 {phase.pressure} / 100 · {phase.posture}</p></div>
    </section>

    <section className="panel">
      <PanelTitle eyebrow="一键推演" title="五种演示情景" />
      <div className="scenario-presets">{(Object.entries(scenarioPresets) as Array<[keyof typeof scenarioPresets, (typeof scenarioPresets)[keyof typeof scenarioPresets]]>).map(([key, item]) => <button key={key} onClick={() => applyScenario(key)}><span>{item.label}</span><small>{item.description}</small><ChevronRight size={15} /></button>)}</div>
    </section>

    <section className="hypothesis-grid">
      {store.hypotheses.map((item) => <article className="panel hypothesis-card" key={item.id}>
        <div className="hypothesis-head"><span className="status-chip">{item.status}</span><div className="confidence-meter"><span>主观置信度</span><strong>{item.confidence}%</strong></div></div>
        <h2>{item.title}</h2><p className="hypothesis-statement">{item.statement}</p><div className="time-window"><Clock3 size={15} />{item.timeWindow}</div>
        <div className="evidence-columns"><div><h3><ArrowUpRight size={15} />支持证据</h3>{item.evidenceFor.map((text) => <p key={text}>{text}</p>)}</div><div><h3><ShieldCheck size={15} />反方证据</h3>{item.evidenceAgainst.map((text) => <p key={text}>{text}</p>)}</div></div>
        <div className="falsifier"><span>证伪条件</span><p>{item.falsifier}</p></div>
      </article>)}
    </section>

    <section className="panel">
      <PanelTitle eyebrow="手动校准" title="危机指标面板" action={<span className="formula-note"><Gauge size={14} />加权规则 · 仅用于情景比较</span>} />
      <div className="indicator-list">{store.indicators.map((item) => <div className="indicator-row" key={item.id}><div className="indicator-name"><strong>{item.label}</strong><span>{item.category} · 权重 {item.weight.toFixed(1)}</span><p>{item.note}</p></div><div className="score-control" aria-label={`${item.label}评分`}>{([-2, -1, 0, 1, 2] as const).map((value) => <button key={value} className={item.value === value ? "active" : ""} onClick={() => updateIndicator(item.id, { value })}>{value > 0 ? `+${value}` : value}</button>)}</div><select value={item.direction} onChange={(event) => updateIndicator(item.id, { direction: Number(event.target.value) as Indicator["direction"] })} aria-label={`${item.label}趋势`}><option value={1}>↗ 改善</option><option value={0}>→ 持平</option><option value={-1}>↘ 恶化</option></select></div>)}</div>
      <div className="method-note"><ShieldCheck size={18} /><p><strong>边界：</strong>模型输出是行动提示，不是金融预测。关键判断需同时保留原始来源、反方证据和修正日期。</p></div>
    </section>
  </div>;
}

function SkillsView({ skills, updateSkill, openAdd }: { skills: Skill[]; updateSkill: (id: string, level: Skill["level"]) => void; openAdd: () => void }) {
  const [category, setCategory] = useState("全部");
  const [priority, setPriority] = useState("全部");
  const categories = ["全部", ...Array.from(new Set(skills.map((x) => x.category)))];
  const filtered = skills.filter((item) => (category === "全部" || item.category === category) && (priority === "全部" || item.priority === priority));
  const average = Math.round((skills.reduce((sum, x) => sum + x.level, 0) / (skills.length * 4)) * 100);
  return <div className="view-stack">
    <section className="skill-summary"><div><span>能力完成度</span><strong>{average}%</strong><p>按当前等级 / 最高等级计算</p></div><div><span>高优先级缺口</span><strong>{skills.filter((x) => x.priority === "高" && x.level < x.target).length}</strong><p>优先做可验证成果</p></div><div className="skill-principle"><Sparkles size={18} /><p><strong>危机准备原则</strong>：优先研究、工程、成本与跨域协作；工具熟练度必须转成可复盘的项目证据。</p></div></section>
    <section className="filter-bar"><div className="filter-group"><Filter size={15} /><span>类别</span>{categories.map((item) => <button className={category === item ? "active" : ""} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="filter-group"><span>优先级</span>{["全部", "高", "中", "低"].map((item) => <button className={priority === item ? "active" : ""} key={item} onClick={() => setPriority(item)}>{item}</button>)}</div><button className="button secondary compact push-right" onClick={openAdd}><Plus size={15} />添加技能</button></section>
    <section className="skills-grid">{filtered.map((skill) => <article className="panel skill-card" key={skill.id}><div className="skill-card-top"><span className={`priority priority-${skill.priority}`}>{skill.priority}优先</span><span>{skill.category}</span></div><h2>{skill.name}</h2><div className="level-row"><span>当前 L{skill.level}</span><span>目标 L{skill.target}</span></div><div className="level-control">{([0, 1, 2, 3, 4] as const).map((level) => <button key={level} aria-label={`设置 ${skill.name} 为 L${level}`} className={level <= skill.level ? "filled" : ""} onClick={() => updateSkill(skill.id, level)}><span /></button>)}</div><dl className="skill-details"><div><dt>现有证据</dt><dd>{skill.evidence}</dd></div><div><dt>下一动作</dt><dd>{skill.nextAction}</dd></div><div><dt>危机价值</dt><dd>{skill.crisisValue}</dd></div></dl></article>)}</section>
  </div>;
}

function OpportunityView({ opportunities, updateStatus, openAdd }: { opportunities: Opportunity[]; updateStatus: (id: string, status: Opportunity["status"]) => void; openAdd: () => void }) {
  const [horizon, setHorizon] = useState<Opportunity["horizon"] | "全部">("全部");
  const filtered = opportunities.filter((item) => horizon === "全部" || item.horizon === horizon).sort((a, b) => scoreOpportunity(b) - scoreOpportunity(a));
  return <div className="view-stack">
    <section className="opportunity-guide"><div><span>01</span><strong>趋势不是机会</strong><p>先找到具体使用者和未满足任务。</p></div><ArrowRight size={18} /><div><span>02</span><strong>触发器决定时机</strong><p>用订单、成本、规则或能力阈值判断。</p></div><ArrowRight size={18} /><div><span>03</span><strong>最小验证后进入</strong><p>先做低成本实验，再扩大投入。</p></div></section>
    <section className="filter-bar"><div className="filter-group"><Filter size={15} /><span>窗口</span>{["全部", "现在", "危机期", "复苏窗口"].map((item) => <button key={item} className={horizon === item ? "active" : ""} onClick={() => setHorizon(item as Opportunity["horizon"] | "全部")}>{item}</button>)}</div><button className="button secondary compact push-right" onClick={openAdd}><Plus size={15} />新增机会</button></section>
    <section className="opportunity-grid">{filtered.map((item) => { const score = scoreOpportunity(item); return <article className="panel opportunity-card" key={item.id}><div className="opportunity-head"><span className={`horizon horizon-${item.horizon}`}>{item.horizon}</span><select value={item.status} onChange={(event) => updateStatus(item.id, event.target.value as Opportunity["status"])}><option>观察</option><option>准备</option><option>验证</option><option>进入</option></select></div><h2>{item.title}</h2><p className="target-user"><Target size={14} />目标：{item.targetUser}</p><div className="opportunity-score"><div><strong>{score}</strong><span>/ 100</span></div><div className="score-bar"><i style={{ width: `${score}%` }} /></div></div><dl><div><dt>进入触发器</dt><dd>{item.trigger}</dd></div><div><dt>下一步验证</dt><dd>{item.nextAction}</dd></div></dl><div className="score-breakdown"><span>准备度 {item.readiness}</span><span>时机 {item.timing}</span><span>抗危机 {item.resilience}</span></div></article>; })}</section>
  </div>;
}

function DiscussionView({ discussions, convertDecision, openAdd }: { discussions: Discussion[]; convertDecision: (id: string) => void; openAdd: () => void }) {
  const [category, setCategory] = useState<Discussion["category"] | "全部">("全部");
  const filtered = discussions.filter((item) => category === "全部" || item.category === category);
  return <div className="view-stack">
    <section className="discussion-stats"><div><MessageSquareText size={20} /><span>开放讨论<strong>{discussions.filter((x) => x.status === "开放").length}</strong></span></div><div><Archive size={20} /><span>正式决策<strong>{discussions.filter((x) => x.status === "已形成决策").length}</strong></span></div><p>参考成熟社区的分类讨论，但测试版把流程压缩为“开放问题 → 反证/提案 → 决策记录”。</p></section>
    <section className="filter-bar"><div className="filter-group"><Filter size={15} /><span>类型</span>{["全部", "研究问题", "反方证据", "行动提案", "复盘"].map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item as Discussion["category"] | "全部")}>{item}</button>)}</div><button className="button secondary compact push-right" onClick={openAdd}><Plus size={15} />发起讨论</button></section>
    <section className="discussion-list">{filtered.map((item) => <article className="panel discussion-card" key={item.id}><div className="discussion-main"><div className="discussion-meta"><span className="category-chip">{item.category}</span><span>{item.createdAt}</span><span>{item.author}</span></div><h2>{item.title}</h2><p>{item.body}</p>{item.decision && <div className="decision-box"><Check size={16} /><div><span>DECISION</span><strong>{item.decision}</strong></div></div>}</div><aside><span className={`discussion-status status-${item.status}`}>{item.status}</span><span><MessageSquareText size={14} />{item.replies} 条回复</span>{item.status === "开放" && <button onClick={() => convertDecision(item.id)}>转为决策 <ArrowRight size={14} /></button>}</aside></article>)}</section>
  </div>;
}

function DataView({ store, records, exportData, importData, importExample, archive, restore, remove, revisions, update }: {
  store: ResearchStore;
  records: RecordDto[];
  exportData: () => void;
  importData: () => void;
  importExample: () => void;
  archive: (record: RecordDto) => void;
  restore: (record: RecordDto) => void;
  remove: (record: RecordDto) => void;
  revisions: (id: string) => Promise<RevisionDto[]>;
  update: (record: RecordDto, patch: { title: string; summary: string; payload: Record<string, unknown> }, reason?: string) => Promise<RecordDto>;
}) {
  const [editing, setEditing] = useState<RecordDto | null>(null);
  const [historyFor, setHistoryFor] = useState<RecordDto | null>(null);
  const [history, setHistory] = useState<RevisionDto[]>([]);
  const collections = [
    ["行业信号", store.signals.length, Radar], ["预测假设", store.hypotheses.length, BrainCircuit], ["技能记录", store.skills.length, GraduationCap], ["机会条目", store.opportunities.length, Target], ["讨论/决策", store.discussions.length, MessageSquareText],
  ] as const;
  async function openHistory(record: RecordDto) {
    setHistoryFor(record);
    setHistory(await revisions(record.id));
  }
  return <div className="view-stack">
    <section className="data-hero"><div><Database size={24} /><h2>D1 私有研究库</h2><p>业务数据跨设备保存；每次变更都形成完整快照，并以版本号阻止静默覆盖。</p></div><span><ShieldCheck size={16} />OWNER ONLY</span></section>
    <section className="collection-grid">{collections.map(([label, count, Icon]) => <div className="collection-card" key={label}><Icon size={18} /><span>{label}</span><strong>{count}</strong></div>)}</section>
    <section className="two-column equal">
      <div className="panel data-actions"><PanelTitle eyebrow="迁移与恢复" title="JSON 备份" /><button onClick={exportData}><span className="data-action-icon"><Download size={20} /></span><div><strong>导出 v2 完整备份</strong><p>包含业务数据、来源、证据、修订和设置。</p></div><ChevronRight size={18} /></button><button onClick={importData}><span className="data-action-icon"><Upload size={20} /></span><div><strong>导入 v1 备份</strong><p>六类记录转成服务端 UUID；同一文件只允许导入一次。</p></div><ChevronRight size={18} /></button><button className="reset-action" onClick={importExample}><span className="data-action-icon"><RefreshCcw size={20} /></span><div><strong>导入示例研究</strong><p>仅供首次体验；不会覆盖已有数据。</p></div><ChevronRight size={18} /></button></div>
      <div className="panel reference-panel"><PanelTitle eyebrow="可靠性" title="数据保护机制" /><div className="reliability-list"><p><ShieldCheck size={17} /><span><strong>唯一所有者</strong> 页面与 API 同时校验登录邮箱。</span></p><p><History size={17} /><span><strong>完整修订</strong> 每次修改、归档、删除与恢复均留存快照。</span></p><p><RefreshCcw size={17} /><span><strong>冲突保护</strong> expectedRevision 不一致时返回 409。</span></p></div></div>
    </section>
    <section className="panel record-admin"><PanelTitle eyebrow="统一记录" title="编辑、归档与历史" />{records.length === 0 ? <p className="empty-note">还没有记录。先导入备份、示例数据或新建一条信号。</p> : <div className="record-table">{records.map((record) => <article key={record.id} className={record.deletedAt ? "is-deleted" : ""}><div><span className="record-kind">{record.kind}</span><strong>{record.title}</strong><small>v{record.revision} · {record.deletedAt ? "回收站" : record.status}</small></div><div className="record-actions"><button onClick={() => void openHistory(record)}><History size={14} />历史</button>{!record.deletedAt && <button onClick={() => setEditing(record)}>编辑</button>}{!record.deletedAt && record.status !== "archived" && <button onClick={() => archive(record)}>归档</button>}{(record.deletedAt || record.status === "archived") && <button onClick={() => restore(record)}>恢复</button>}{!record.deletedAt && <button className="danger-link" onClick={() => remove(record)}>删除</button>}</div></article>)}</div>}</section>
    {editing && <RecordEditor record={editing} close={() => setEditing(null)} save={update} />}
    {historyFor && <HistoryModal record={historyFor} history={history} close={() => { setHistoryFor(null); setHistory([]); }} />}
  </div>;
}

function RecordEditor({ record, close, save }: { record: RecordDto; close: () => void; save: (record: RecordDto, patch: { title: string; summary: string; payload: Record<string, unknown> }, reason?: string) => Promise<RecordDto> }) {
  const [title, setTitle] = useState(record.title);
  const [summary, setSummary] = useState(record.summary);
  const [payload, setPayload] = useState(JSON.stringify(record.payload, null, 2));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      await save(record, { title, summary, payload: parsed }, reason || undefined);
      close();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败。");
    }
  }
  return <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true" aria-label="编辑记录"><div className="modal-head"><div><p className="eyebrow">RECORD v{record.revision}</p><h2>编辑{record.title}</h2></div><button aria-label="关闭" onClick={close}><X size={19} /></button></div><form onSubmit={submit}><label className="form-field"><span>标题</span><input required value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="form-field"><span>摘要</span><textarea value={summary} onChange={(event) => setSummary(event.target.value)} /></label><label className="form-field"><span>结构化字段 JSON</span><textarea className="json-editor" value={payload} onChange={(event) => setPayload(event.target.value)} spellCheck={false} /></label><label className="form-field"><span>变更理由{record.kind === "hypothesis" ? " *" : ""}</span><input required={record.kind === "hypothesis"} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="为什么修改；假设、置信度或证伪条件变更时必填" /></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="button ghost" onClick={close}>取消</button><button className="button primary" type="submit">保存新版本</button></div></form></section></div>;
}

function HistoryModal({ record, history, close }: { record: RecordDto; history: RevisionDto[]; close: () => void }) {
  return <div className="modal-backdrop"><section className="modal-card history-modal" role="dialog" aria-modal="true" aria-label="历史版本"><div className="modal-head"><div><p className="eyebrow">REVISION HISTORY</p><h2>{record.title}</h2></div><button aria-label="关闭" onClick={close}><X size={19} /></button></div><div className="history-list">{history.map((item) => <article key={item.id}><span>v{item.revision}</span><div><strong>{item.changeReason || "未填写理由"}</strong><p>{new Date(item.createdAt).toLocaleString("zh-CN")} · {item.changedBy}</p></div></article>)}</div><div className="modal-actions"><button className="button ghost" onClick={close}>关闭</button></div></section></div>;
}

function AddRecordModal({ type, close, create, changeType }: { type: Exclude<ModalType, null>; close: () => void; create: (type: Exclude<ModalType, null>, value: Record<string, unknown>) => Promise<void>; changeType: (type: ModalType) => void }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.title?.trim()) return;
    if (type === "signal") {
      await create(type, { title: form.title.trim(), summary: form.summary?.trim() || "待补充摘要", quadrant: form.quadrant || "需求与商业", ring: form.ring || "关注", movement: "稳定", impact: 0, confidence: 50, sourceName: form.source?.trim() || "个人观察 / 待验证", ...(form.url?.trim() ? { sourceUrl: form.url.trim() } : {}), observedAt: new Date().toISOString().slice(0, 10), tags: form.tags?.split(/[，,]/).map((x) => x.trim()).filter(Boolean) || [] });
    }
    if (type === "skill") {
      await create(type, { name: form.title.trim(), category: form.category || "研究", level: 0, target: 3, priority: form.priority || "中", evidence: form.evidence || "暂无验证证据", nextAction: form.action || "定义一个可在两周内完成的验证动作", crisisValue: form.value || "待评估" });
    }
    if (type === "opportunity") {
      await create(type, { title: form.title.trim(), horizon: form.horizon || "现在", status: "观察", trigger: form.trigger || "待定义可观察触发器", targetUser: form.user || "待验证目标用户", readiness: 40, timing: 50, resilience: 60, nextAction: form.action || "完成一次最小需求验证" });
    }
    if (type === "discussion") {
      await create(type, { title: form.title.trim(), category: form.discussionCategory || "研究问题", body: form.body || "待补充讨论背景与希望得到的结论。", author: "Mina", createdAt: new Date().toISOString().slice(0, 10), replies: 0, status: "开放" });
    }
    close();
  }
  const label = { signal: "行业信号", skill: "技能", opportunity: "机会", discussion: "讨论" }[type];
  return <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true" aria-label={`新增${label}`}><div className="modal-head"><div><p className="eyebrow">快速录入</p><h2>新增{label}</h2></div><button aria-label="关闭" onClick={close}><X size={19} /></button></div><div className="type-tabs">{(["signal", "skill", "opportunity", "discussion"] as const).map((item) => <button key={item} className={type === item ? "active" : ""} onClick={() => { setForm({}); changeType(item); }}>{({ signal: "信号", skill: "技能", opportunity: "机会", discussion: "讨论" } as const)[item]}</button>)}</div><form onSubmit={submit}><label className="form-field"><span>标题 *</span><input required value={form.title || ""} onChange={(e) => set("title", e.target.value)} placeholder={{ signal: "观察到什么变化？", skill: "需要储备什么能力？", opportunity: "可能出现什么机会？", discussion: "要讨论什么研究问题？" }[type]} /></label>
    {type === "signal" && <><label className="form-field"><span>摘要</span><textarea value={form.summary || ""} onChange={(e) => set("summary", e.target.value)} placeholder="说明它为何影响工业设计行业，而不只是一条新闻。" /></label><div className="form-grid"><label className="form-field"><span>象限</span><select value={form.quadrant || "需求与商业"} onChange={(e) => set("quadrant", e.target.value)}>{QUADRANTS.map((x) => <option key={x}>{x}</option>)}</select></label><label className="form-field"><span>行动环</span><select value={form.ring || "关注"} onChange={(e) => set("ring", e.target.value)}>{RINGS.map((x) => <option key={x}>{x}</option>)}</select></label></div><div className="form-grid"><label className="form-field"><span>来源名称</span><input value={form.source || ""} onChange={(e) => set("source", e.target.value)} placeholder="报告、访谈或个人观察" /></label><label className="form-field"><span>来源 URL</span><input type="url" value={form.url || ""} onChange={(e) => set("url", e.target.value)} placeholder="https://…" /></label></div><label className="form-field"><span>标签</span><input value={form.tags || ""} onChange={(e) => set("tags", e.target.value)} placeholder="用逗号分隔" /></label></>}
    {type === "skill" && <><div className="form-grid"><label className="form-field"><span>类别</span><select value={form.category || "研究"} onChange={(e) => set("category", e.target.value)}><option>研究</option><option>工程</option><option>数字</option><option>商业</option><option>表达</option></select></label><label className="form-field"><span>优先级</span><select value={form.priority || "中"} onChange={(e) => set("priority", e.target.value)}><option>高</option><option>中</option><option>低</option></select></label></div><label className="form-field"><span>现有证据</span><input value={form.evidence || ""} onChange={(e) => set("evidence", e.target.value)} placeholder="课程、项目、测试或作品" /></label><label className="form-field"><span>下一动作</span><textarea value={form.action || ""} onChange={(e) => set("action", e.target.value)} placeholder="两周内可以完成的最小动作" /></label><label className="form-field"><span>危机价值</span><input value={form.value || ""} onChange={(e) => set("value", e.target.value)} placeholder="它如何帮助防守或抓住复苏窗口" /></label></>}
    {type === "opportunity" && <><div className="form-grid"><label className="form-field"><span>机会窗口</span><select value={form.horizon || "现在"} onChange={(e) => set("horizon", e.target.value)}><option>现在</option><option>危机期</option><option>复苏窗口</option></select></label><label className="form-field"><span>目标用户</span><input value={form.user || ""} onChange={(e) => set("user", e.target.value)} placeholder="谁会付费或采用" /></label></div><label className="form-field"><span>进入触发器</span><textarea value={form.trigger || ""} onChange={(e) => set("trigger", e.target.value)} placeholder="出现什么可观察条件，才值得加大投入？" /></label><label className="form-field"><span>下一步验证</span><input value={form.action || ""} onChange={(e) => set("action", e.target.value)} placeholder="最小、低成本验证" /></label></>}
    {type === "discussion" && <><label className="form-field"><span>类型</span><select value={form.discussionCategory || "研究问题"} onChange={(e) => set("discussionCategory", e.target.value)}><option>研究问题</option><option>反方证据</option><option>行动提案</option><option>复盘</option></select></label><label className="form-field"><span>背景与问题</span><textarea value={form.body || ""} onChange={(e) => set("body", e.target.value)} placeholder="提供背景、证据和希望达成的决定。" /></label></>}
    <div className="modal-actions"><button type="button" className="button ghost" onClick={close}>取消</button><button type="submit" className="button primary"><Plus size={16} />保存{label}</button></div></form></section></div>;
}
