import { describe, expect, it } from "vitest";
import { demoStore } from "../app/demo-data";
import {
  createRecord,
  exportAll,
  importV1,
  importV2,
  listRevisions,
  softDeleteRecord,
  updateRecord,
} from "../app/server/repository";
import { createEvidence } from "../app/server/ingestion";

const ownerId = "owner-test";
const ownerEmail = "owner@example.com";

describe("D1 record service", () => {
  it("creates, versions, archives, soft-deletes and restores a record", async () => {
    const created = await createRecord(ownerId, ownerEmail, {
      kind: "skill",
      title: "DFM 验证",
      payload: { name: "DFM 验证", level: 1, target: 3 },
    });
    expect(created.revision).toBe(1);

    const updated = await updateRecord(ownerId, ownerEmail, created.id, 1, {
      payload: { name: "DFM 验证", level: 2, target: 3 },
    });
    expect(updated.revision).toBe(2);

    await expect(updateRecord(ownerId, ownerEmail, created.id, 1, { title: "过期修改" }))
      .rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });

    const archived = await updateRecord(ownerId, ownerEmail, created.id, 2, { status: "archived" });
    expect(archived.archivedAt).toBeTruthy();
    const deleted = await softDeleteRecord(ownerId, ownerEmail, created.id, 3);
    expect(deleted.deletedAt).toBeTruthy();
    const restored = await softDeleteRecord(ownerId, ownerEmail, created.id, 4, true);
    expect(restored.deletedAt).toBeNull();

    const history = await listRevisions(ownerId, created.id);
    expect(history.map((item) => item.revision)).toEqual([5, 4, 3, 2, 1]);
  });

  it("requires reasons for critical hypothesis changes", async () => {
    const hypothesis = await createRecord(ownerId, ownerEmail, {
      kind: "hypothesis",
      title: "2029 泡沫破裂",
      payload: { statement: "2029 左右破裂", confidence: 56, falsifier: "盈利持续增长" },
      changeReason: "建立核心研究假设",
    });
    await expect(updateRecord(ownerId, ownerEmail, hypothesis.id, 1, {
      payload: { ...hypothesis.payload, confidence: 60 },
    })).rejects.toMatchObject({ code: "CHANGE_REASON_REQUIRED" });
    const updated = await updateRecord(ownerId, ownerEmail, hypothesis.id, 1, {
      payload: { ...hypothesis.payload, confidence: 60 },
    }, "补充了资本开支证据");
    expect(updated.payload.confidence).toBe(60);
  });

  it("keeps top-level titles and summaries canonical in legacy payloads", async () => {
    const canonicalOwner = crypto.randomUUID();
    const created = await createRecord(canonicalOwner, ownerEmail, {
      kind: "skill",
      title: "结构验证",
      summary: "完成一次跌落测试",
      payload: { name: "旧名称", nextAction: "旧动作", level: 1, target: 3 },
    });
    expect(created.payload).toMatchObject({ name: "结构验证", nextAction: "完成一次跌落测试" });

    const updated = await updateRecord(canonicalOwner, ownerEmail, created.id, 1, {
      title: "量产结构验证",
      summary: "完成一次装配和跌落测试",
      payload: { ...created.payload, name: "冲突名称", nextAction: "冲突动作" },
    });
    expect(updated.payload).toMatchObject({ name: "量产结构验证", nextAction: "完成一次装配和跌落测试" });
  });

  it("imports all six v1 collections once and exports a v2 backup", async () => {
    const raw = JSON.stringify(demoStore);
    const imported = await importV1(ownerId, ownerEmail, raw);
    expect(imported.counts).toEqual({
      signal: demoStore.signals.length,
      indicator: demoStore.indicators.length,
      hypothesis: demoStore.hypotheses.length,
      skill: demoStore.skills.length,
      opportunity: demoStore.opportunities.length,
      discussion: demoStore.discussions.length,
    });
    await expect(importV1(ownerId, ownerEmail, raw)).rejects.toMatchObject({ code: "IMPORT_ALREADY_APPLIED" });
    const backup = await exportAll(ownerId);
    expect(backup.version).toBe(2);
    expect(backup.data.records.length).toBeGreaterThan(0);
    expect(backup.data.record_revisions.length).toBeGreaterThanOrEqual(backup.data.records.length);
  });

  it("restores a v2 backup into an empty owner with remapped relationships", async () => {
    const sourceOwner = crypto.randomUUID();
    const targetOwner = crypto.randomUUID();
    const record = await createRecord(sourceOwner, ownerEmail, {
      kind: "skill",
      title: "恢复测试",
      summary: "验证备份关系",
      payload: { level: 1, target: 3 },
    });
    await createEvidence(sourceOwner, {
      title: "恢复证据",
      sourceName: "测试来源",
      sourceCategory: "test",
      credibility: 4,
      relevance: 5,
      stance: "supports",
      recordId: record.id,
    });
    const backup = await exportAll(sourceOwner);
    const restored = await importV2(targetOwner, JSON.stringify(backup));
    expect(restored.counts.records).toBe(1);
    expect(restored.counts.evidence_links).toBe(1);

    const targetBackup = await exportAll(targetOwner);
    expect(targetBackup.data.records).toHaveLength(1);
    expect(targetBackup.data.evidence).toHaveLength(1);
    expect(targetBackup.data.evidence_links).toHaveLength(1);
    expect(targetBackup.data.records[0].id).not.toBe(record.id);
    expect(targetBackup.data.evidence_links[0].record_id).toBe(targetBackup.data.records[0].id);
    expect(targetBackup.data.evidence_links[0].evidence_id).toBe(targetBackup.data.evidence[0].id);
    await expect(importV2(targetOwner, JSON.stringify(backup))).rejects.toMatchObject({ code: "RESTORE_REQUIRES_EMPTY_DATABASE" });
  });
});
