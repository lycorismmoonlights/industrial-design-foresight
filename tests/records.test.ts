import { describe, expect, it } from "vitest";
import { demoStore } from "../app/demo-data";
import {
  createRecord,
  exportAll,
  importV1,
  listRevisions,
  softDeleteRecord,
  updateRecord,
} from "../app/server/repository";

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
});
