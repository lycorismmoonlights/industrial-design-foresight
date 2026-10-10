import { describe, expect, it } from "vitest";
import { isViewId, WORKSPACES, workspaceForView } from "../app/navigation";

describe("task-based navigation", () => {
  it("keeps all twelve legacy views under five unique primary entries", () => {
    expect(WORKSPACES).toHaveLength(5);
    const views = WORKSPACES.flatMap((workspace) => workspace.views.map((view) => view.id));
    expect(new Set(views).size).toBe(12);
    expect(views).toHaveLength(12);
    expect(views.slice().sort()).toEqual([
      "dashboard", "data", "discussions", "evidence", "forecast", "inbox",
      "operations", "opportunities", "radar", "skills", "sources", "weekly",
    ].sort());
  });

  it("restores every old view to the correct workspace", () => {
    for (const workspace of WORKSPACES) {
      for (const view of workspace.views) {
        expect(isViewId(view.id)).toBe(true);
        expect(workspaceForView(view.id).id).toBe(workspace.id);
      }
    }
    expect(workspaceForView("sources").id).toBe("library");
    expect(workspaceForView("operations").id).toBe("settings");
    expect(isViewId("removed-view")).toBe(false);
    expect(isViewId(null)).toBe(false);
  });
});
