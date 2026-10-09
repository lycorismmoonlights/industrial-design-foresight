"use client";

import { Activity, AlertTriangle, Check, CircleCheck, Clock3, Database, ExternalLink, FileSearch, Globe2, HelpCircle, Inbox, KeyRound, Link2, Plus, RefreshCcw, Rss, Search, Settings2, SlidersHorizontal, Target, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../data/api-client";
import type { useResearchData } from "../hooks/useResearchData";
import type { OperationsOverviewDto } from "../operations-model";
import type { EvidenceDto, InboxItemDto, SourceDto } from "../v2-model";
import { SourceEditor } from "./SourceEditor";

type Research = ReturnType<typeof useResearchData>;
type Notify = (action: () => Promise<unknown>, success: string) => void;

const SOURCE_PRESETS = [
  {
    name: "Core77",
    pageUrl: "https://www.core77.com/about",
    feedUrl: "https://feeds.feedburner.com/core77/blog",
    sourceCategory: "industry_media",
    defaultCredibility: 3,
    note: "工业设计媒体；适合发现产品、材料、工具和从业实践信号。",
  },
  {
    name: "EU DG GROW Publications",
    pageUrl: "https://single-market-economy.ec.europa.eu/rss_en",
    feedUrl: "https://single-market-economy.ec.europa.eu/node/3/rss_en",
    sourceCategory: "government",
    defaultCredibility: 5,
    note: "欧盟单一市场、工业、企业与制造政策的一手发布。",
  },
  {
    name: "WIPO News",
    pageUrl: "https://www.wipo.int/en/web/news/rss",
    feedUrl: null,
    sourceCategory: "intergovernmental",
    defaultCredibility: 5,
    note: "保留为网页/人工来源；系统会尝试发现订阅，但不虚构未确认的通用 feed。",
  },
] as const;

type SourceFilter = "all" | "attention" | "disabled";
type AddSourceMode = "preset" | "feed" | "api" | "page";
type ApiAdapter = "bls" | "fred" | "sec" | "eurostat";

const ADAPTER_LABELS: Record<SourceDto["adapterType"], string> = {
  rss: "RSS",
  bls: "BLS API",
  fred: "FRED API",
  sec: "SEC API",
  eurostat: "Eurostat API",
  manual: "网页",
};

const CATEGORY_LABELS: Record<string, string> = {
  industry_media: "行业媒体",
  government: "政府与监管",
  intergovernmental: "国际组织",
  economic_data: "经济数据",
  corporate_filings: "企业披露",
};

const RUNTIME_REQUIREMENTS: Partial<Record<SourceDto["adapterType"], { key: string; action: string }>> = {
  fred: { key: "FRED_API_KEY", action: "配置 API 密钥" },
  sec: { key: "SEC_USER_AGENT", action: "配置联系标识" },
};

function sourceState(source: SourceDto) {
  if (!source.enabled) return { key: "disabled", label: "已停用" } as const;
  if (source.lastError) return { key: "attention", label: "需要处理" } as const;
  if (source.lastSuccessAt) return { key: "healthy", label: "正常" } as const;
  return { key: "idle", label: "待测试" } as const;
}

function formatSourceTime(value: string | null): string {
  if (!value) return "尚未运行";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function SourceStatus({ source }: { source: SourceDto }) {
  const state = sourceState(source);
  return <span className={`source-state ${state.key}`}><i />{state.label}</span>;
}

function adapterConfig(adapter: ApiAdapter, identifier: string, label: string): Record<string, unknown> {
  if (adapter === "bls" || adapter === "fred") return { series: [{ id: identifier, label }] };
  if (adapter === "sec") return { companies: [{ cik: identifier, name: label }], forms: ["10-K", "10-Q", "8-K"] };
  return { queries: [{ dataset: identifier, label, filters: {} }] };
}

function AddSourceDialog({ research, notify, close, created }: {
  research: Research;
  notify: Notify;
  close: () => void;
  created: (sourceId: string) => void;
}) {
  const [mode, setMode] = useState<AddSourceMode>("preset");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [adapter, setAdapter] = useState<ApiAdapter>("fred");
  const [identifier, setIdentifier] = useState("");

  function finish(action: () => Promise<SourceDto>, message: string) {
    notify(() => action().then((source) => { created(source.id); close(); }), message);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === "feed" || mode === "page") {
      finish(() => research.createSource({ name, ...(mode === "feed" ? { feedUrl: url } : { pageUrl: url }), enabled: false }), "来源已添加，请先测试连接再启用");
      return;
    }
    finish(() => research.createSource({
      name,
      adapterType: adapter,
      adapterConfig: adapterConfig(adapter, identifier.trim(), name.trim()),
      sourceCategory: adapter === "sec" ? "corporate_filings" : adapter === "eurostat" ? "government" : "economic_data",
      enabled: false,
    }), "API 来源已添加，请先测试连接再启用");
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="modal-card add-source-dialog" role="dialog" aria-modal="true" aria-labelledby="add-source-title">
      <div className="modal-head"><div><p className="eyebrow">ADD SOURCE</p><h2 id="add-source-title">添加来源</h2><span>选择一种方式，系统会在启用前让你测试连接。</span></div><button type="button" onClick={close} aria-label="关闭添加来源"><X size={16} /></button></div>
      <div className="source-method-tabs" role="tablist" aria-label="添加来源方式">
        {(["preset", "feed", "api", "page"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={mode === value} className={mode === value ? "active" : ""} onClick={() => setMode(value)}>{value === "preset" ? "推荐来源" : value === "feed" ? "RSS 订阅" : value === "api" ? "官方数据 API" : "普通网页"}</button>)}
      </div>
      {mode === "preset" ? <div className="source-preset-list">{SOURCE_PRESETS.map((preset) => <article key={preset.name}><div><strong>{preset.name}</strong><p>{preset.note}</p></div><button type="button" className="button secondary compact" onClick={() => finish(() => research.createSource({ ...preset, enabled: false }), `${preset.name} 已添加，请先测试连接`)}>添加</button></article>)}</div> : <form onSubmit={submit}>
        <label className="form-field"><span>来源名称</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：制造业就业指标" /></label>
        {mode === "api" && <label className="form-field"><span>官方 API</span><select value={adapter} onChange={(event) => { setAdapter(event.target.value as ApiAdapter); setIdentifier(""); }}><option value="fred">FRED 经济数据</option><option value="bls">BLS 劳工统计</option><option value="sec">SEC 企业披露</option><option value="eurostat">Eurostat 欧盟统计</option></select></label>}
        {mode === "feed" || mode === "page" ? <label className="form-field"><span>{mode === "feed" ? "RSS / Atom 地址" : "网页地址"}</span><input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" /></label> : <label className="form-field"><span>{adapter === "sec" ? "公司 CIK" : adapter === "eurostat" ? "数据集代码" : "数据系列 ID"}</span><input required value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder={adapter === "sec" ? "例如：320193" : adapter === "eurostat" ? "例如：nama_10_a64" : "例如：PAYEMS"} /><small>{RUNTIME_REQUIREMENTS[adapter] ? `${RUNTIME_REQUIREMENTS[adapter]?.key} 必须在站点运行时配置，页面不会保存密钥。` : "如使用 BLS 密钥，也应放在站点运行时配置中。"}</small></label>}
        <div className="add-source-safety"><CircleCheck size={15} /><span>新来源先保存为停用状态；测试成功后再加入每天零点的自动抓取。</span></div>
        <div className="modal-actions"><button type="button" className="button ghost" onClick={close}>取消</button><button className="button primary" type="submit">添加并去测试</button></div>
      </form>}
    </section>
  </div>;
}

export function SourcesView({ research, notify }: { research: Research; notify: Notify }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [runtimeHelp, setRuntimeHelp] = useState<{ key: string; action: string } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [overview, setOverview] = useState<OperationsOverviewDto | null>(null);

  const loadOverview = useCallback(async () => {
    try { setOverview(await apiRequest<OperationsOverviewDto>("/api/operations")); } catch { setOverview(null); }
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest<OperationsOverviewDto>("/api/operations")
      .then((nextOverview) => { if (active) setOverview(nextOverview); })
      .catch(() => { if (active) setOverview(null); });
    return () => { active = false; };
  }, []);

  const sources = research.data.sources;
  const selected = sources.find((source) => source.id === selectedId) ?? sources.find((source) => source.lastError && source.enabled) ?? sources[0] ?? null;
  const filtered = useMemo(() => sources.filter((source) => {
    const state = sourceState(source);
    const matchesFilter = filter === "all" || (filter === "attention" && (state.key === "attention" || state.key === "idle")) || (filter === "disabled" && state.key === "disabled");
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    return matchesFilter && (!normalized || `${source.name} ${source.adapterType} ${source.sourceCategory}`.toLocaleLowerCase("zh-CN").includes(normalized));
  }), [filter, query, sources]);
  const healthyCount = sources.filter((source) => sourceState(source).key === "healthy").length;
  const attentionCount = sources.filter((source) => ["attention", "idle"].includes(sourceState(source).key)).length;
  const selectedRuns = overview?.syncRuns.filter((run) => run.sourceId === selected?.id).slice(0, 5) ?? [];

  function testSource(source: SourceDto) {
    notify(async () => {
      setTestingId(source.id);
      try { await research.fetchSource(source.id); } finally { await loadOverview(); setTestingId(null); }
    }, "连接测试完成");
  }

  function toggleSource(source: SourceDto) {
    if (!source.enabled && !window.confirm(`确认启用“${source.name}”？启用后会进入每天零点的自动抓取。`)) return;
    notify(() => research.updateSource(source.id, { enabled: !source.enabled }, !source.enabled).then(loadOverview), source.enabled ? "来源已停用" : "来源已启用");
  }

  return <div className="view-stack source-management">
    <section className="source-summary-bar">
      <div><strong>{sources.length}</strong><span>个来源</span></div><i />
      <div className="healthy"><strong>{healthyCount}</strong><span>个正常</span></div><i />
      <div className={attentionCount ? "attention" : "healthy"}><strong>{attentionCount}</strong><span>个需要处理</span></div>
      <button className="button primary" type="button" onClick={() => setAddOpen(true)}><Plus size={15} />添加来源</button>
    </section>

    <section className="panel source-workspace">
      <aside className="source-master">
        <div className="source-master-tools"><label><Search size={15} /><span className="visually-hidden">搜索来源</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索来源…" /></label><SlidersHorizontal size={16} /></div>
        <div className="source-filter-tabs">{(["all", "attention", "disabled"] as const).map((value) => <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "全部" : value === "attention" ? "需处理" : "已停用"}</button>)}</div>
        <div className="source-master-list">{filtered.length ? filtered.map((source) => <button type="button" key={source.id} className={selected?.id === source.id ? "selected" : ""} onClick={() => setSelectedId(source.id)}><div><strong>{source.name}</strong><span>{ADAPTER_LABELS[source.adapterType]}</span></div><SourceStatus source={source} /></button>) : <div className="source-list-empty"><Search size={18} /><p>没有符合条件的来源</p></div>}</div>
        <footer>显示 {filtered.length} / {sources.length} 个来源</footer>
      </aside>

      <div className="source-detail">{selected ? <>
        <header className="source-detail-head"><div><div><span className="adapter-chip">{ADAPTER_LABELS[selected.adapterType]}</span><SourceStatus source={selected} /></div><h2>{selected.name}</h2><p>{selected.feedUrl ?? selected.pageUrl ?? `${CATEGORY_LABELS[selected.sourceCategory] ?? selected.sourceCategory} · 官方结构化数据来源`}</p></div>{(selected.feedUrl || selected.pageUrl) && <div className="record-actions"><a href={selected.feedUrl ?? selected.pageUrl ?? "#"} target="_blank" rel="noreferrer" aria-label="打开来源网站"><ExternalLink size={14} /></a></div>}</header>
        <section className="source-detail-overview">
          <dl><div><dt><Activity size={14} />当前状态</dt><dd><SourceStatus source={selected} /></dd></div><div><dt><Clock3 size={14} />最近运行</dt><dd>{formatSourceTime(selected.lastFetchAt)}</dd></div><div><dt><RefreshCcw size={14} />运行频率</dt><dd>{selected.cadence === "daily" ? "每天 00:00" : selected.cadence === "weekly" ? "每周" : "每月"}</dd></div><div><dt><Database size={14} />每次抓取上限</dt><dd>{selected.maxItemsPerRun} 条</dd></div><div><dt><Globe2 size={14} />类别</dt><dd>{CATEGORY_LABELS[selected.sourceCategory] ?? selected.sourceCategory}</dd></div><div><dt><Check size={14} />默认可信度</dt><dd>{selected.defaultCredibility} / 5</dd></div></dl>
          <div className="source-diagnostic">{selected.lastError ? <><span>最近错误 · {formatSourceTime(selected.lastFetchAt)}</span><div><AlertTriangle size={18} /><p><strong>{selected.lastError}</strong><small>修复配置后重新测试；其他来源不会受到影响。</small></p></div></> : selected.lastSuccessAt ? <><span>连接诊断</span><div className="success"><CircleCheck size={18} /><p><strong>最近一次抓取成功</strong><small>新增 {selected.lastNewCount} 条，耗时 {selected.lastDurationMs ?? 0} ms。</small></p></div></> : <><span>连接诊断</span><div className="idle"><Clock3 size={18} /><p><strong>尚未完成连接测试</strong><small>点击“测试连接”验证地址和参数，再决定是否启用。</small></p></div></>}</div>
        </section>
        <div className="source-detail-actions">{RUNTIME_REQUIREMENTS[selected.adapterType] && selected.lastError && <button type="button" className="button primary" onClick={() => setRuntimeHelp(RUNTIME_REQUIREMENTS[selected.adapterType] ?? null)}><KeyRound size={14} />{RUNTIME_REQUIREMENTS[selected.adapterType]?.action}</button>}<button type="button" className={RUNTIME_REQUIREMENTS[selected.adapterType] && selected.lastError ? "button secondary" : "button primary"} disabled={selected.adapterType === "manual" || testingId === selected.id} onClick={() => testSource(selected)}><RefreshCcw size={14} />{testingId === selected.id ? "测试中…" : "测试连接"}</button><button type="button" className="button secondary" onClick={() => setEditOpen(true)}><Settings2 size={14} />编辑设置</button><button type="button" className="button danger-outline" onClick={() => toggleSource(selected)}>{selected.enabled ? "停用来源" : "启用来源"}</button></div>
        <section className="source-run-history"><div><h3>最近运行记录</h3><span>{selectedRuns.length ? `最近 ${selectedRuns.length} 次` : "尚无运行记录"}</span></div>{selectedRuns.length ? <div className="source-run-table">{selectedRuns.map((run) => <article key={run.id}><time>{formatSourceTime(run.startedAt)}</time><span className={`run-status ${run.status}`}>{run.status === "success" ? "成功" : run.status === "not_modified" ? "未变化" : "失败"}</span><span>{run.newCount} 条</span><span>{run.durationMs} ms</span></article>)}</div> : <div className="source-run-empty"><Clock3 size={18} /><p>测试一次连接后，这里会显示抓取结果和耗时。</p></div>}</section>
        <footer className="source-detail-help"><HelpCircle size={14} /><span>来源状态由最近一次抓取结果决定。先修复配置，再运行测试。</span></footer>
      </> : <div className="source-empty-workspace"><Rss size={24} /><h2>还没有来源</h2><p>添加一个推荐来源，或连接 RSS、官方 API 和普通网页。</p><button className="button primary" type="button" onClick={() => setAddOpen(true)}>添加第一个来源</button></div>}</div>
    </section>

    {addOpen && <AddSourceDialog research={research} notify={notify} close={() => setAddOpen(false)} created={setSelectedId} />}
    {selected && editOpen && <div className="modal-backdrop" role="presentation"><section className="modal-card source-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-source-title"><div className="modal-head"><div><p className="eyebrow">SOURCE SETTINGS</p><h2 id="edit-source-title">编辑 {selected.name}</h2></div><button type="button" onClick={() => setEditOpen(false)} aria-label="关闭来源设置"><X size={16} /></button></div><SourceEditor key={selected.updatedAt} source={selected} cancel={() => setEditOpen(false)} save={(patch, confirmEnable) => notify(() => research.updateSource(selected.id, patch, confirmEnable).then(async () => { setEditOpen(false); await loadOverview(); }), "来源配置已保存")} /></section></div>}
    {runtimeHelp && <div className="modal-backdrop" role="presentation"><section className="confirm-card runtime-help-dialog" role="dialog" aria-modal="true" aria-labelledby="runtime-help-title"><div className="confirm-icon"><KeyRound size={21} /></div><h2 id="runtime-help-title">{runtimeHelp.action}</h2><p>为避免密钥泄露，浏览器不会读取或保存密钥。请在站点运行时变量中设置：</p><code>{runtimeHelp.key}</code><p>保存运行时配置后，回到这里点击“测试连接”。</p><div className="modal-actions"><button className="button primary" type="button" onClick={() => setRuntimeHelp(null)}>我知道了</button></div></section></div>}
  </div>;
}

function ReviewCard({ item, review }: { item: InboxItemDto; review: (input: Parameters<Research["reviewInbox"]>[1]) => void }) {
  const [relevance, setRelevance] = useState(item.aiRelevance ?? 3);
  const [stance, setStance] = useState<EvidenceDto["stance"]>(item.aiStanceSuggestion ?? "context");
  return <article className="inbox-card"><div className="inbox-copy"><span>{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString("zh-CN") : "日期未知"}</span><h2>{item.title}</h2><p>{item.summary || "此条目没有摘要，请打开原文后人工判断。"}</p>{item.aiStatus === "completed" && <div className="ai-suggestion"><small>AI 整理建议 · {item.aiQuadrant} · 相关度 {item.aiRelevance}/5</small><p>{item.aiSummary}</p>{item.aiTags.length > 0 && <span>{item.aiTags.join(" · ")}</span>}</div>}{item.canonicalUrl && <a href={item.canonicalUrl} target="_blank" rel="noreferrer">查看原文 <ExternalLink size={13} /></a>}</div><aside><label>相关度<select value={relevance} onChange={(event) => setRelevance(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option key={value}>{value}</option>)}</select></label><label>立场<select value={stance} onChange={(event) => setStance(event.target.value as EvidenceDto["stance"])}><option value="supports">支持</option><option value="opposes">反对</option><option value="context">背景</option></select></label><button className="button primary compact" onClick={() => review({ action: "convert", relevance, stance })}>转为信号草稿</button><div><button onClick={() => review({ action: "ignore" })}>忽略</button><button onClick={() => review({ action: "reject" })}>拒绝</button></div></aside></article>;
}

export function InboxView({ research, notify }: { research: Research; notify: Notify }) {
  const pending = research.data.inboxItems.filter((item) => item.reviewStatus === "pending");
  return <div className="view-stack"><section className="ops-intro"><Inbox size={22} /><div><h2>{pending.length} 条资料等待判断</h2><p>“转为信号”只生成默认可信度 50 的草稿，并附上来源证据；AI 结果只是可覆盖的整理建议。</p></div></section><section className="inbox-list">{pending.length ? pending.map((item) => <ReviewCard key={item.id} item={item} review={(input) => notify(() => research.reviewInbox(item.id, input), input.action === "convert" ? "已生成信号草稿与证据" : "条目已处理")} />) : <div className="panel empty-ops"><Check size={24} /><h2>待审核箱已清空</h2><p>可在来源管理中手动同步，或等待每天 00:00 的定时抓取。</p></div>}</section></div>;
}

export function EvidenceView({ research, notify }: { research: Research; notify: Notify }) {
  const [form, setForm] = useState({ title: "", url: "", sourceName: "", sourceCategory: "industry_media", credibility: "3", relevance: "3", stance: "context", recordId: "" });
  const linkable = research.records.filter((record) => !record.deletedAt && record.status !== "archived");
  function submit(event: FormEvent) {
    event.preventDefault();
    notify(() => research.createEvidence({ ...form, credibility: Number(form.credibility), relevance: Number(form.relevance), stance: form.stance as EvidenceDto["stance"], url: form.url || null, recordId: form.recordId || null }).then(() => setForm((current) => ({ ...current, title: "", url: "" }))), "证据已保存并关联");
  }
  return <div className="view-stack"><section className="two-column equal"><form className="panel ops-form" onSubmit={submit}><div className="panel-title"><div><p>EVIDENCE</p><h2>添加结构化证据</h2></div></div><label className="form-field"><span>标题</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><div className="form-grid"><label className="form-field"><span>来源名称</span><input required value={form.sourceName} onChange={(event) => setForm({ ...form, sourceName: event.target.value })} /></label><label className="form-field"><span>来源类别</span><input required value={form.sourceCategory} onChange={(event) => setForm({ ...form, sourceCategory: event.target.value })} /></label></div><label className="form-field"><span>原文 URL（可选）</span><input type="url" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} /></label><div className="form-grid"><label className="form-field"><span>可信度 1–5</span><select value={form.credibility} onChange={(event) => setForm({ ...form, credibility: event.target.value })}>{[1, 2, 3, 4, 5].map((value) => <option key={value}>{value}</option>)}</select></label><label className="form-field"><span>相关度 1–5</span><select value={form.relevance} onChange={(event) => setForm({ ...form, relevance: event.target.value })}>{[1, 2, 3, 4, 5].map((value) => <option key={value}>{value}</option>)}</select></label></div><div className="form-grid"><label className="form-field"><span>立场</span><select value={form.stance} onChange={(event) => setForm({ ...form, stance: event.target.value })}><option value="supports">支持</option><option value="opposes">反对</option><option value="context">背景</option></select></label><label className="form-field"><span>关联研究记录</span><select value={form.recordId} onChange={(event) => setForm({ ...form, recordId: event.target.value })}><option value="">暂不关联</option>{linkable.map((record) => <option key={record.id} value={record.id}>{record.kind} · {record.title}</option>)}</select></label></div><button className="button primary" type="submit"><Plus size={15} />保存证据</button></form><section className="panel ops-panel"><div className="panel-title"><div><p>INTERPRETATION</p><h2>证据强度提示</h2></div></div><div className="evidence-rule"><strong>可信度 × 相关度</strong><p>分值帮助你发现薄弱证据，但绝不自动修改 2029 假设或其他假设的主观置信度。</p></div><div className="evidence-rule"><strong>支持 / 反对 / 背景</strong><p>反方证据与支持证据同等可见，避免只收藏符合预期的资料。</p></div></section></section><section className="evidence-library">{research.data.evidence.map((item) => <article className="panel" key={item.id}><div><span className={`stance ${item.stance}`}>{item.stance === "supports" ? "支持" : item.stance === "opposes" ? "反对" : "背景"}</span><strong>{item.title}</strong></div><p>{item.sourceName} · {item.sourceCategory}</p><div className="evidence-scores"><span>可信 {item.credibility}/5</span><span>相关 {item.relevance}/5</span><span>提示强度 {item.credibility * item.relevance}/25</span></div><small><Link2 size={12} />已关联 {item.links.length} 条记录</small></article>)}</section></div>;
}

export function WeeklyView({ research, navigate, notify }: { research: Research; navigate: (view: "sources" | "inbox" | "evidence" | "skills" | "opportunities") => void; notify: Notify }) {
  const [reviewDay, setReviewDay] = useState(Number(research.data.settings.reviewDay ?? 0));
  const [reviewMinutes, setReviewMinutes] = useState(Number(research.data.settings.reviewMinutes ?? 30));
  const records = research.records.filter((record) => !record.deletedAt && record.status !== "archived");
  const hypothesisGaps = records.filter((record) => record.kind === "hypothesis" && !research.data.evidence.some((evidence) => evidence.links.some((link) => link.recordId === record.id))).length;
  const skillActions = research.store.skills.filter((skill) => skill.level < skill.target && skill.nextAction?.trim()).length;
  const triggers = research.store.opportunities.filter((item) => item.trigger?.trim()).length;
  const unhealthy = research.data.sources.filter((source) => source.enabled && (source.lastError || !source.lastSuccessAt)).length;
  const cards = useMemo(() => [
    { label: "待审核", value: research.data.inboxStats.pending, detail: "清空资料队列", icon: Inbox, view: "inbox" as const },
    { label: "来源需检查", value: unhealthy, detail: "处理同步异常", icon: Activity, view: "sources" as const },
    { label: "假设证据缺口", value: hypothesisGaps, detail: "补充支持与反方", icon: FileSearch, view: "evidence" as const },
    { label: "技能下一动作", value: skillActions, detail: "形成可验证成果", icon: Target, view: "skills" as const },
  ], [hypothesisGaps, research.data.inboxStats.pending, skillActions, unhealthy]);
  return <div className="view-stack"><section className="ops-intro"><RefreshCcw size={22} /><div><h2>每周 30–45 分钟研究复盘</h2><p>顺序固定为：清待审核 → 看来源健康 → 找假设证据缺口 → 安排一个技能动作 → 检查机会触发器。</p></div></section><form className="panel weekly-settings" onSubmit={(event) => { event.preventDefault(); notify(() => research.updateSettings({ timezone: "Asia/Shanghai", reviewCadence: "weekly", reviewDay, reviewMinutes }), "每周复盘设置已保存"); }}><div><strong>个人复盘节奏</strong><span>时区 Asia/Shanghai</span></div><label>复盘日<select value={reviewDay} onChange={(event) => setReviewDay(Number(event.target.value))}><option value={0}>周日</option><option value={1}>周一</option><option value={2}>周二</option><option value={3}>周三</option><option value={4}>周四</option><option value={5}>周五</option><option value={6}>周六</option></select></label><label>时长<select value={reviewMinutes} onChange={(event) => setReviewMinutes(Number(event.target.value))}><option value={30}>30 分钟</option><option value={45}>45 分钟</option><option value={60}>60 分钟</option></select></label><button className="button secondary compact" type="submit">保存节奏</button></form><section className="weekly-grid">{cards.map(({ label, value, detail, icon: Icon, view }) => <button className="panel" key={label} onClick={() => navigate(view)}><Icon size={18} /><span>{label}</span><strong>{value}</strong><small>{detail}</small></button>)}</section><section className="panel weekly-checklist"><div className="panel-title"><div><p>OPPORTUNITY TRIGGERS</p><h2>机会触发器检查</h2></div><span className="count-chip">{triggers} 项</span></div>{research.store.opportunities.length ? research.store.opportunities.map((item) => <button key={item.id} onClick={() => navigate("opportunities")}><span className={item.status === "进入" ? "checked" : ""}><Check size={13} /></span><div><strong>{item.title}</strong><p>{item.trigger || "尚未定义触发器"}</p></div></button>) : <p className="empty-note">尚未建立机会记录。</p>}</section></div>;
}
