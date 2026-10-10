import { expect, test } from "@playwright/test";

test("five workspaces keep every view reachable with keyboard tabs and mobile navigation", async ({ page }) => {
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "主导航", exact: true });
  await expect(navigation.getByRole("button")).toHaveCount(5);
  await expect(navigation.getByRole("button")).toHaveText(["总览", "经济研究", /^资料中心/, "行动计划", "设置与备份"]);

  const workspaces = [
    { label: "总览", tabs: ["研究概览", "每周复盘"] },
    { label: "经济研究", tabs: ["信号雷达", "指标与假设", "讨论与决策"] },
    { label: "资料中心", tabs: [/^待审核/, "证据库", "来源管理"] },
    { label: "行动计划", tabs: ["机会库", "技能库"] },
    { label: "设置与备份", tabs: ["运行监控", "数据与备份"] },
  ];
  for (const workspace of workspaces) {
    await navigation.getByRole("button", { name: workspace.label, exact: true }).click();
    await expect(page.getByRole("tab")).toHaveCount(workspace.tabs.length);
    for (const label of workspace.tabs) {
      const tab = page.getByRole("tab", { name: label, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tabpanel")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(navigation.getByRole("button", { name: workspace.label, exact: true })).toHaveAttribute("aria-current", "page");
    }
  }

  await navigation.getByRole("button", { name: "经济研究", exact: true }).click();
  const radar = page.getByRole("tab", { name: "信号雷达", exact: true });
  await radar.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "指标与假设", exact: true })).toBeFocused();
  await page.getByRole("tab", { name: "指标与假设", exact: true }).press("End");
  await expect(page.getByRole("tab", { name: "讨论与决策", exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByRole("tab", { name: "讨论与决策", exact: true })).toHaveAttribute("aria-selected", "true");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "打开菜单", exact: true }).click();
  await navigation.getByRole("button", { name: "资料中心", exact: true }).click();
  await expect(page.locator(".mobile-scrim")).toHaveCount(0);
  await expect(page.locator(".sidebar")).not.toBeInViewport();
  await page.getByRole("tab", { name: "来源管理", exact: true }).click();
  const widths = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  await page.screenshot({ path: "test-results/navigation-mobile.png", fullPage: true, animations: "disabled" });
});

test("a legacy saved view opens its new parent instead of being reset", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("id-foresight-ui-view", "sources"));
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "来源管理", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "资料中心", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "来源管理", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/navigation-desktop.png", fullPage: true, animations: "disabled" });
});
