"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ResearchStore } from "../model";
import { apiRequest } from "../data/api-client";
import { recordsToV1, titleForV1, type BootstrapDto, type RecordDto, type RecordKind, type RecordStatus, type RevisionDto } from "../v2-model";

const EMPTY_STORE: ResearchStore = {
  version: 1,
  updatedAt: new Date(0).toISOString(),
  signals: [], indicators: [], hypotheses: [], skills: [], opportunities: [], discussions: [],
};
const EMPTY_RECORDS: RecordDto[] = [];

export interface InitialUser {
  userId: string;
  email: string;
  displayName: string;
}

function summaryFor(kind: RecordKind, payload: Record<string, unknown>) {
  if (kind === "hypothesis") return String(payload.statement ?? "");
  if (kind === "indicator") return String(payload.note ?? "");
  if (kind === "discussion") return String(payload.body ?? "");
  return String(payload.summary ?? payload.nextAction ?? payload.trigger ?? "");
}

function withoutId(payload: Record<string, unknown>) {
  const copy = { ...payload };
  delete copy.id;
  return copy;
}

export function useResearchData(initialUser: InitialUser) {
  const [data, setData] = useState<BootstrapDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiRequest<BootstrapDto>("/api/bootstrap"));
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法载入云端研究数据。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void apiRequest<BootstrapDto>("/api/bootstrap")
      .then((bootstrap) => {
        if (!active) return;
        setData(bootstrap);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "无法载入云端研究数据。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const records = data?.records ?? EMPTY_RECORDS;
  const store = useMemo(() => records.length ? recordsToV1(records) : EMPTY_STORE, [records]);

  function replaceRecord(record: RecordDto) {
    setData((current) => current ? {
      ...current,
      records: current.records.some((item) => item.id === record.id)
        ? current.records.map((item) => item.id === record.id ? record : item)
        : [record, ...current.records],
    } : current);
  }

  async function createLegacy(kind: RecordKind, value: Record<string, unknown>, options?: { status?: RecordStatus; changeReason?: string }) {
    const payload = withoutId(value);
    const record = await apiRequest<RecordDto>("/api/records", {
      method: "POST",
      body: JSON.stringify({
        kind,
        status: options?.status ?? "published",
        title: titleForV1(kind, value),
        summary: summaryFor(kind, value),
        payload,
        changeReason: options?.changeReason,
      }),
    });
    replaceRecord(record);
    return record;
  }

  async function patchLegacy(kind: RecordKind, id: string, patch: Record<string, unknown>, changeReason?: string) {
    const current = records.find((item) => item.kind === kind && item.id === id);
    if (!current) throw new Error("记录已不存在，请刷新页面。");
    const payload = { ...current.payload, ...withoutId(patch) };
    const record = await apiRequest<RecordDto>("/api/records", {
      method: "PATCH",
      body: JSON.stringify({
        id,
        expectedRevision: current.revision,
        patch: { title: titleForV1(kind, { ...payload, ...patch }), summary: summaryFor(kind, payload), payload },
        changeReason,
      }),
    });
    replaceRecord(record);
    return record;
  }

  async function setStatus(record: RecordDto, status: RecordStatus, changeReason?: string) {
    const updated = await apiRequest<RecordDto>("/api/records", {
      method: "PATCH",
      body: JSON.stringify({ id: record.id, expectedRevision: record.revision, patch: { status }, changeReason }),
    });
    replaceRecord(updated);
  }

  async function updateRecord(record: RecordDto, patch: { title?: string; summary?: string; payload?: Record<string, unknown>; status?: RecordStatus }, changeReason?: string) {
    const updated = await apiRequest<RecordDto>("/api/records", {
      method: "PATCH",
      body: JSON.stringify({ id: record.id, expectedRevision: record.revision, patch, changeReason }),
    });
    replaceRecord(updated);
    return updated;
  }

  async function softDelete(record: RecordDto) {
    const updated = await apiRequest<RecordDto>("/api/records", {
      method: "DELETE",
      body: JSON.stringify({ id: record.id, expectedRevision: record.revision }),
    });
    replaceRecord(updated);
  }

  async function restore(record: RecordDto) {
    const updated = await apiRequest<RecordDto>("/api/records", {
      method: "PATCH",
      body: JSON.stringify({ id: record.id, expectedRevision: record.revision, restore: true }),
    });
    replaceRecord(updated);
  }

  async function revisions(id: string) {
    return apiRequest<RevisionDto[]>(`/api/records?id=${encodeURIComponent(id)}`);
  }

  async function importV1(raw: string) {
    const result = await apiRequest<{ batchId: string; counts: Record<string, number> }>("/api/import/v1", { method: "POST", body: raw });
    await refresh();
    return result;
  }

  async function exportV2() {
    return apiRequest<Record<string, unknown>>("/api/export");
  }

  return {
    data: data ?? { user: initialUser, records: [], sources: [], inboxStats: { pending: 0, reviewed: 0 }, inboxItems: [], evidence: [], settings: {} },
    records,
    store,
    loading,
    error,
    refresh,
    createLegacy,
    patchLegacy,
    setStatus,
    updateRecord,
    softDelete,
    restore,
    revisions,
    importV1,
    exportV2,
  };
}
