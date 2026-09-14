"use client";

import { FormEvent, useState } from "react";
import type { SourceDto } from "../v2-model";

export type SourceEditorPatch = Partial<Pick<
  SourceDto,
  "name" | "adapterConfig" | "cadence" | "maxItemsPerRun" | "sourceCategory" | "defaultCredibility" | "enabled"
>>;

export function SourceEditor({ source, save, cancel }: {
  source: SourceDto;
  save: (patch: SourceEditorPatch, confirmEnable: boolean) => void;
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
    <details className="advanced-source-config"><summary>高级适配器参数</summary><label className="form-field"><span>JSON 配置</span><textarea className="json-editor" value={config} onChange={(event) => setConfig(event.target.value)} spellCheck={false} /><small>密钥不能写在这里；这里只填写系列 ID、CIK、数据集或筛选条件。</small></label></details>
    {error && <p className="form-error">{error}</p>}
    <div className="editor-actions"><button type="button" className="button ghost compact" onClick={cancel}>取消</button><button className="button primary compact" type="submit">保存配置</button></div>
  </form>;
}
