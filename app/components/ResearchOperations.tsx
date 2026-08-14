"use client";

import { Activity, Check, ExternalLink, FileSearch, Inbox, Link2, Plus, RefreshCcw, Rss, ShieldAlert, Target } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type { useResearchData } from "../hooks/useResearchData";
import type { EvidenceDto, InboxItemDto, SourceDto } from "../v2-model";

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

function SourceHealth({ source }: { source: SourceDto }) {
  const tone = source.lastError ? "bad" : source.lastSuccessAt ? "good" : "idle";
  const label = source.lastError ? "异常" : source.lastSuccessAt ? "正常" : "未同步";
  return <span className={`health-chip ${tone}`}><i />{label}</span>;
}

export function SourcesView({ research, notify }: { research: Research; notify: Notify }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"feed" | "page">("feed");
  function add(event: FormEvent) {
    event.preventDefault();
    notify(() => research.createSource({ name, ...(mode === "feed" ? { feedUrl: url } : { pageUrl: url }) }).then(() => { setName(""); setUrl(""); }), "来源已加入，启用前不会自动抓取");
  }
  function addPreset(preset: typeof SOURCE_PRESETS[number]) {
    if (!window.confirm(`确认添加并启用“${preset.name}”？启用后每天 08:30 抓取元数据，正式研究判断仍需人工审核。`)) return;
    notify(() => research.createSource({ ...preset, enabled: true, confirmEnable: true }), `${preset.name} 已确认启用`);
  }
  return <div className="view-stack">
    <section className="ops-intro"><Rss size={22} /><div><h2>订阅只是资料发现层</h2><p>只保存标题、摘要、作者、日期和原文链接；不抓全文或图片。任何条目都必须经你审核，才可成为信号草稿。</p></div></section>
    <section className="panel ops-panel"><div className="panel-title"><div><p>CURATED STARTERS</p><h2>建议来源预设</h2></div></div><div className="preset-grid">{SOURCE_PRESETS.map((preset) => <article key={preset.name}><strong>{preset.name}</strong><p>{preset.note}</p><button className="button secondary compact" onClick={() => addPreset(preset)}>确认并启用</button></article>)}</div></section>
    <section className="two-column equal">
      <form className="panel ops-form" onSubmit={add}><div className="panel-title"><div><p>ADD SOURCE</p><h2>添加订阅或网页</h2></div></div><label className="form-field"><span>来源名称</span><input required value={name} onChange={(event) => setName(event.target.value)} /></label><label className="form-field"><span>地址类型</span><select value={mode} onChange={(event) => setMode(event.target.value as "feed" | "page")}><option value="feed">直接 RSS / Atom</option><option value="page">网页自动发现</option></select></label><label className="form-field"><span>{mode === "feed" ? "订阅地址" : "网页地址"}</span><input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" /></label><button className="button primary" type="submit"><Plus size={15} />添加为停用状态</button></form>
      <section className="panel ops-panel"><div className="panel-title"><div><p>SAFETY BOUNDARY</p><h2>抓取限制</h2></div></div><ul className="plain-checks"><li><ShieldAlert size={15} />拒绝私网、本机和非 HTTP(S) 地址</li><li><Activity size={15} />10 秒超时、1 MB 响应、单次最多 100 条</li><li><RefreshCcw size={15} />ETag / Last-Modified 条件请求与三级去重</li></ul></section>
    </section>
    <section className="panel ops-panel"><div className="panel-title"><div><p>SOURCE HEALTH</p><h2>来源状态</h2></div><span className="count-chip">{research.data.sources.length} 个</span></div>{research.data.sources.length === 0 ? <p className="empty-note">尚未添加来源。</p> : <div className="source-list">{research.data.sources.map((source) => <article key={source.id}><div><SourceHealth source={source} /><strong>{source.name}</strong><small>{source.feedUrl ?? source.pageUrl ?? "人工来源"}</small></div><div className="source-metrics"><span>新增 {source.lastNewCount}</span><span>{source.lastDurationMs === null ? "未计时" : `${source.lastDurationMs} ms`}</span></div><div className="record-actions"><button onClick={() => { if (source.enabled || window.confirm(`确认启用“${source.name}”？`)) notify(() => research.updateSource(source.id, { enabled: !source.enabled }, !source.enabled), source.enabled ? "来源已停用" : "来源已启用"); }}>{source.enabled ? "停用" : "启用"}</button><button disabled={!source.feedUrl} onClick={() => notify(() => research.fetchSource(source.id), "手动同步完成")}>同步</button>{(source.feedUrl || source.pageUrl) && <a href={source.feedUrl ?? source.pageUrl ?? "#"} target="_blank" rel="noreferrer" aria-label="打开来源"><ExternalLink size={14} /></a>}</div>{source.lastError && <p className="source-error">{source.lastError}</p>}</article>)}</div>}</section>
  </div>;
}

function ReviewCard({ item, review }: { item: InboxItemDto; review: (input: Parameters<Research["reviewInbox"]>[1]) => void }) {
  const [relevance, setRelevance] = useState(3);
  const [stance, setStance] = useState<EvidenceDto["stance"]>("context");
  return <article className="inbox-card"><div className="inbox-copy"><span>{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString("zh-CN") : "日期未知"}</span><h2>{item.title}</h2><p>{item.summary || "此条目没有摘要，请打开原文后人工判断。"}</p>{item.canonicalUrl && <a href={item.canonicalUrl} target="_blank" rel="noreferrer">查看原文 <ExternalLink size={13} /></a>}</div><aside><label>相关度<select value={relevance} onChange={(event) => setRelevance(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option key={value}>{value}</option>)}</select></label><label>立场<select value={stance} onChange={(event) => setStance(event.target.value as EvidenceDto["stance"])}><option value="supports">支持</option><option value="opposes">反对</option><option value="context">背景</option></select></label><button className="button primary compact" onClick={() => review({ action: "convert", relevance, stance })}>转为信号草稿</button><div><button onClick={() => review({ action: "ignore" })}>忽略</button><button onClick={() => review({ action: "reject" })}>拒绝</button></div></aside></article>;
}

export function InboxView({ research, notify }: { research: Research; notify: Notify }) {
  const pending = research.data.inboxItems.filter((item) => item.reviewStatus === "pending");
  return <div className="view-stack"><section className="ops-intro"><Inbox size={22} /><div><h2>{pending.length} 条资料等待判断</h2><p>“转为信号”只生成默认可信度 50 的草稿，并附上来源证据；选择象限后才允许发布到行业雷达。</p></div></section><section className="inbox-list">{pending.length ? pending.map((item) => <ReviewCard key={item.id} item={item} review={(input) => notify(() => research.reviewInbox(item.id, input), input.action === "convert" ? "已生成信号草稿与证据" : "条目已处理")} />) : <div className="panel empty-ops"><Check size={24} /><h2>待审核箱已清空</h2><p>可在来源管理中手动同步，或等待每天 08:30 的定时抓取。</p></div>}</section></div>;
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
