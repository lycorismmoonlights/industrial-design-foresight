"use client";

import {
  AlertTriangle,
  Bot,
  Clock3,
  Database,
  ExternalLink,
  KeyRound,
  Play,
  RefreshCcw,
  Rss,
  Search,
  Settings2,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiRequest } from "../data/api-client";
import type { useResearchData } from "../hooks/useResearchData";
import type { OperationsInboxItemDto, OperationsInboxPageDto, OperationsOverviewDto } from "../operations-model";
import type { SourceDto } from "../v2-model";

type Research = ReturnType<typeof useResearchData>;
type Notify = (action: () => Promise<unknown>, success: string) => void;

const STATUS_LABELS = {
  ready: "已就绪",
  optional: "可选配置",
  missing: "缺少配置",
  disabled: "未启用",
} as const;

const RUN_LABELS = {
  running: "运行中",
  success: "成功",
  partial: "部分成功",
  failed: "失败",
} as const;

function formatTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function SourceEditor({ source, save, cancel }: {
  source: SourceDto;
  save: (patch: Partial<Pick<SourceDto, "name" | "adapterConfig" | "cadence" | "maxItemsPerRun" | "sourceCategory" | "defaultCredibility" | "enabled">>, confirmEnable: boolean) => void;
  cancel: () => void;
}) {
  const [name, setName] = useState(source.name);
  const [category, setCategory] = useState(source.sourceCategory);
  const [credibility, setCredibility] = useState(source.defaultCredibility);
  const [cadence, setCadence] = useState(source.cadence);
  const [maximum, setMaximum] = useState(source.maxItemsPerRun);
  const [enabled, setEnabled] = useState(source.enabled);
  const [config, setConfig] = useState(JSON.stringify(source.adapterConfig, null, 2));
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    let adapterConfig: Record<string, unknown>;
    try {
      const parsed = JSON.parse(config) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
      adapterConfig = parsed as Record<string, unknown>;
    } catch {
      setError("适配器配置必须是 JSON 对象。");
      return;
    }
    const confirmEnable = !source.enabled && enabled;
    if (confirmEnable && !window.confirm(`确认启用“${source.name}”？启用后会进入每天零点的自动抓取。`)) return;
    save({ name, sourceCategory: category, defaultCredibility: credibility, cadence, maxItemsPerRun: maximum, enabled, adapterConfig }, confirmEnable);
  }

  return <form className="source-editor" onSubmit={submit}>
    <div className="form-grid"><label className="form-field"><span>来源名称</span><input required value={name} onChange={(event) => setName(event.target.value)} /></label><label className="form-field"><span>来源类别</span><input required value={category} onChange={(event) => setCategory(event.target.value)} /></label></div>
    <div className="form-grid"><label className="form-field"><span>抓取周期</span><select value={cadence} onChange={(event) => setCadence(event.target.value as SourceDto["cadence"])}><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option></select></label><label className="form-field"><span>单次条目上限</span><input type="number" min={1} max={100} value={maximum} onChange={(event) => setMaximum(Number(event.target.value))} /></label></div>
    <div className="form-grid"><label className="form-field"><span>默认可信度</span><select value={credibility} onChange={(event) => setCredibility(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option key={value}>{value}</option>)}</select></label><label className="toggle-field"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>加入自动抓取</span></label></div>
    <label className="form-field"><span>适配器配置 JSON</span><textarea className="json-editor" value={config} onChange={(event) => setConfig(event.target.value)} spellCheck={false} /><small>密钥不能写在这里；只填写系列 ID、CIK、数据集或筛选条件。</small></label>
    {error && <p className="form-error">{error}</p>}
    <div className="editor-actions"><button type="button" className="button ghost compact" onClick={cancel}>取消</button><button className="button primary compact" type="submit">保存配置</button></div>
  </form>;
}

export function AutomationOperations({ research, notify }: { research: Research; notify: Notify }) {
  const [overview, setOverview] = useState<OperationsOverviewDto | null>(null);
  const [dataPage, setDataPage] = useState<OperationsInboxPageDto>({ items: [], filteredCount: 0, nextCursor: null });
  const [filters, setFilters] = useState({ q: "", sourceId: "", reviewStatus: "", aiStatus: "" });
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setOverview(await apiRequest<OperationsOverviewDto>("/api/operations"));
  }, []);

  const loadData = useCallback(async (cursor?: string, append = false) => {
    const params = new URLSearchParams({ limit: "40" });
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.sourceId) params.set("sourceId", filters.sourceId);
    if (filters.reviewStatus) params.set("reviewStatus", filters.reviewStatus);
    if (filters.aiStatus) params.set("aiStatus", filters.aiStatus);
    if (cursor) params.set("cursor", cursor);
    const page = await apiRequest<OperationsInboxPageDto>(`/api/operations/inbox?${params}`);
    setDataPage((current) => append ? { ...page, items: [...current.items, ...page.items] } : page);
  }, [filters]);

  useEffect(() => {
    let active = true;
    Promise.all([apiRequest<OperationsOverviewDto>("/api/operations"), apiRequest<OperationsInboxPageDto>("/api/operations/inbox?limit=40")])
      .then(([nextOverview, nextData]) => {
        if (!active) return;
        setOverview(nextOverview);
        setDataPage(nextData);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "无法载入自动化运营数据。");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function refreshAll() {
    setLoading(true);
    Promise.all([loadOverview(), loadData(), research.refresh()])
      .then(() => setError(null))
      .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "刷新失败。"))
      .finally(() => setLoading(false));
  }

  function runPipeline() {
    if (!window.confirm("确认立即运行整条抓取与 AI 整理管线？这会访问全部到期来源，并可能产生 DeepSeek API 费用。")) return;
    notify(async () => {
      setRunning(true);
      try {
        const result = await apiRequest<{ status: string }>("/api/operations/run", { method: "POST" });
        if (result.status === "duplicate") throw new Error("已有整批任务正在运行，请稍后刷新查看进度。");
        await Promise.all([loadOverview(), loadData(), research.refresh()]);
      } finally {
        setRunning(false);
      }
    }, "人工管线运行完成");
  }

  function retryAi(ids: string[]) {
    notify(async () => {
      await apiRequest("/api/operations/inbox", { method: "POST", body: JSON.stringify({ action: "retry_ai", ids }) });
      await Promise.all([loadOverview(), loadData(), research.refresh()]);
    }, "失败条目已重新排入 AI 队列");
  }

  if (loading && !overview) return <section className="panel operations-loading"><RefreshCcw size={20} /><p>正在载入自动化运营数据…</p></section>;

  const metrics = overview?.metrics;
  const visibleFailed = dataPage.items.filter((item) => item.aiStatus === "failed" && item.reviewStatus === "pending");
  return <div className="view-stack operations-console">
    {error && <div className="inline-error">{error}<button onClick={refreshAll}>重试</button></div>}
    <section className="ops-intro operations-hero"><Settings2 size={22} /><div><h2>抓取、API 与数据统一运营</h2><p>这里管理来源参数、检查运行时配置、人工触发管线并检索原始抓取数据。密钥内容不会返回浏览器。</p></div><div className="operations-actions"><button className="button secondary compact" onClick={refreshAll} disabled={loading}><RefreshCcw size={14} />刷新</button><button className="button primary compact" onClick={runPipeline} disabled={running}><Play size={14} />{running ? "运行中…" : "立即运行管线"}</button></div></section>

    <section className="operations-metrics">
      <article className="panel"><Rss size={17} /><span>启用来源</span><strong>{metrics?.enabledSources ?? 0}<small> / {metrics?.totalSources ?? 0}</small></strong><p>{metrics?.unhealthySources ?? 0} 个异常</p></article>
      <article className="panel"><Database size={17} /><span>待审核数据</span><strong>{metrics?.pendingInbox ?? 0}</strong><p>抓取后仍需人工判断</p></article>
      <article className="panel"><Bot size={17} /><span>AI 已整理</span><strong>{metrics?.aiCompleted ?? 0}</strong><p>{metrics?.aiFailed ?? 0} 条失败</p></article>
      <article className="panel"><Clock3 size={17} /><span>固定调度</span><strong>{overview?.schedule.localTime ?? "00:00"}</strong><p>{overview?.schedule.timezone}</p></article>
    </section>

    <section className="panel ops-panel"><div className="panel-title"><div><p>API READINESS</p><h2>接口就绪状态</h2></div><span className="count-chip">只显示状态</span></div><div className="integration-grid">{overview?.integrations.map((item) => <article key={item.id}><div><KeyRound size={15} /><strong>{item.name}</strong><span className={`integration-status ${item.status}`}>{STATUS_LABELS[item.status]}</span></div><p>{item.detail}</p><small>{item.enabledSourceCount}/{item.sourceCount} 个来源启用{item.environmentVariables.length ? ` · ${item.environmentVariables.join(" · ")}` : " · 无需环境变量"}</small></article>)}</div><div className="runtime-strip"><span>Cron <strong>{overview?.schedule.cron}</strong></span><span>DeepSeek <strong>{overview?.schedule.aiModel}</strong></span><span>每日 AI 上限 <strong>{overview?.schedule.aiDailyItemLimit}</strong></span><span>失败封顶 <strong>{overview?.schedule.aiMaxAttempts} 次</strong></span></div></section>

    <section className="panel ops-panel"><div className="panel-title"><div><p>SOURCE CONFIGURATION</p><h2>来源与 API 参数</h2></div><span className="count-chip">{research.data.sources.length} 个</span></div><div className="operations-source-list">{research.data.sources.length ? research.data.sources.map((source) => <article key={source.id}><div className="source-row"><div><span className={`health-chip ${source.lastError ? "bad" : source.lastSuccessAt ? "good" : "idle"}`}><i />{source.lastError ? "异常" : source.lastSuccessAt ? "正常" : "未同步"}</span><strong>{source.name}</strong><small>{source.adapterType.toUpperCase()} · {source.cadence} · 上限 {source.maxItemsPerRun}</small></div><div className="source-row-meta"><span>{source.enabled ? "自动抓取" : "已停用"}</span><span>{source.lastFetchAt ? formatTime(source.lastFetchAt) : "尚未抓取"}</span></div><div className="record-actions"><button disabled={source.adapterType === "manual"} onClick={() => notify(() => research.fetchSource(source.id).then(loadOverview), "来源测试抓取完成")}>测试抓取</button><button onClick={() => setEditingSource((current) => current === source.id ? null : source.id)}>{editingSource === source.id ? "收起" : "配置"}</button></div></div>{source.lastError && <p className="source-error">{source.lastError}</p>}{editingSource === source.id && <SourceEditor key={source.updatedAt} source={source} cancel={() => setEditingSource(null)} save={(patch, confirmEnable) => notify(() => research.updateSource(source.id, patch, confirmEnable).then(async () => { setEditingSource(null); await loadOverview(); }), "来源配置已保存")} />}</article>) : <p className="empty-note">尚未添加来源，请先在“来源管理”中建立订阅或 API 来源。</p>}</div></section>

    <section className="two-column operations-history"><section className="panel ops-panel"><div className="panel-title"><div><p>PIPELINE RUNS</p><h2>整批运行记录</h2></div><span className="count-chip">最近 {overview?.pipelineRuns.length ?? 0} 次</span></div><div className="run-list">{overview?.pipelineRuns.length ? overview.pipelineRuns.map((run) => <article key={run.id}><div><span className={`run-status ${run.status}`}>{RUN_LABELS[run.status]}</span><strong>{run.triggerType === "manual" ? "人工运行" : "定时运行"}</strong><small>{formatTime(run.startedAt)}{run.requestedBy ? ` · ${run.requestedBy}` : ""}</small></div><div><span>来源 {run.sourceSuccessCount}/{run.sourceCount}</span><span>新增 {run.newCount}</span><span>AI {run.aiProcessedCount}</span></div>{run.error && <p>{run.error}</p>}</article>) : <p className="empty-note">尚无整批运行记录。</p>}</div></section><section className="panel ops-panel"><div className="panel-title"><div><p>SOURCE RUNS</p><h2>来源抓取日志</h2></div><span className="count-chip">最近 {overview?.syncRuns.length ?? 0} 次</span></div><div className="run-list compact">{overview?.syncRuns.length ? overview.syncRuns.map((run) => <article key={run.id}><div><span className={`run-status ${run.status}`}>{run.status === "not_modified" ? "未变化" : run.status === "success" ? "成功" : "失败"}</span><strong>{run.sourceName}</strong><small>{run.adapterType.toUpperCase()} · {formatTime(run.startedAt)}</small></div><div><span>{run.durationMs} ms</span><span>新增 {run.newCount}</span></div>{run.error && <p>{run.error}</p>}</article>) : <p className="empty-note">尚无来源抓取日志。</p>}</div></section></section>

    <section className="panel ops-panel data-browser"><div className="panel-title"><div><p>CAPTURED DATA</p><h2>抓取数据浏览器</h2></div><div className="record-actions">{visibleFailed.length > 0 && <button onClick={() => retryAi(visibleFailed.map((item) => item.id))}><RefreshCcw size={12} />重试本页失败 AI</button>}<span className="count-chip">{dataPage.filteredCount} 条</span></div></div><form className="data-filters" onSubmit={(event) => { event.preventDefault(); void loadData(); }}><label><Search size={14} /><input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="搜索标题或摘要" /></label><select aria-label="筛选来源" value={filters.sourceId} onChange={(event) => setFilters({ ...filters, sourceId: event.target.value })}><option value="">全部来源</option>{research.data.sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select><select aria-label="筛选人工状态" value={filters.reviewStatus} onChange={(event) => setFilters({ ...filters, reviewStatus: event.target.value })}><option value="">全部人工状态</option><option value="pending">待审核</option><option value="converted">已转信号</option><option value="ignored">已忽略</option><option value="rejected">已拒绝</option></select><select aria-label="筛选 AI 状态" value={filters.aiStatus} onChange={(event) => setFilters({ ...filters, aiStatus: event.target.value })}><option value="">全部 AI 状态</option><option value="pending">待处理</option><option value="processing">处理中</option><option value="retry">待重试</option><option value="completed">已完成</option><option value="failed">失败</option></select><button className="button secondary compact" type="submit">应用筛选</button></form><div className="captured-data-list">{dataPage.items.length ? dataPage.items.map((item) => <CapturedDataRow key={item.id} item={item} retry={() => retryAi([item.id])} />) : <p className="empty-note">没有符合筛选条件的数据。</p>}</div>{dataPage.nextCursor && <button className="load-more" onClick={() => void loadData(dataPage.nextCursor ?? undefined, true)}>加载更多</button>}</section>
  </div>;
}

function CapturedDataRow({ item, retry }: { item: OperationsInboxItemDto; retry: () => void }) {
  return <article><div className="captured-data-main"><div><span className="adapter-chip">{item.adapterType.toUpperCase()}</span><span>{item.sourceName}</span><span>{formatTime(item.createdAt)}</span></div><strong>{item.title}</strong><p>{item.summary || "没有摘要。"}</p>{item.aiSummary && <div className="captured-ai"><Bot size={13} /><span>{item.aiSummary}</span></div>}</div><aside><span className={`review-chip ${item.reviewStatus}`}>{item.reviewStatus}</span><span className={`ai-chip ${item.aiStatus}`}>AI {item.aiStatus}</span>{item.aiError && <small title={item.aiError}><AlertTriangle size={12} />{item.aiError}</small>}<div>{item.aiStatus === "failed" && item.reviewStatus === "pending" && <button onClick={retry}><RefreshCcw size={12} />重试 AI</button>}{item.canonicalUrl && <a href={item.canonicalUrl} target="_blank" rel="noreferrer">原文 <ExternalLink size={12} /></a>}</div></aside></article>;
}
