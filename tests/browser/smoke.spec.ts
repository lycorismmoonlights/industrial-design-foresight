import { expect, request, test } from "@playwright/test";

test("owner research flow persists in D1 and remains usable on mobile", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "工业设计前瞻总览" })).toBeVisible();
  await expect(page.locator("[data-nextjs-dialog], .vite-error-overlay")).toHaveCount(0);

  await page.getByRole("button", { name: "来源管理", exact: true }).click();
  await expect(page.getByRole("heading", { name: "来源管理", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "添加来源", exact: true })).toBeVisible();
  await expect(page.getByText(/个来源/, { exact: false }).first()).toBeVisible();

  const sourceName = `CI 冒烟来源 ${Date.now()}`;
  await page.getByRole("button", { name: "添加来源", exact: true }).click();
  await expect(page.getByRole("heading", { name: "添加来源", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "RSS 订阅", exact: true }).click();
  await page.getByLabel("来源名称", { exact: true }).fill(sourceName);
  await page.getByLabel("RSS / Atom 地址", { exact: true }).fill(`https://example.com/${Date.now()}.xml`);
  await page.getByRole("button", { name: "添加并去测试", exact: true }).click();
  await expect(page.getByText(sourceName, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "测试连接", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "编辑设置", exact: true }).click();
  await expect(page.getByRole("button", { name: "保存配置", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.reload();
  await expect(page.getByText(sourceName, { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "自动化运营", exact: true }).click();
  await expect(page.getByRole("heading", { name: "API 与抓取数据运营台", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "接口就绪状态", exact: true })).toBeVisible();
  await expect(page.locator("strong", { hasText: sourceName })).toBeVisible();
  await page.getByRole("button", { name: "配置", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "保存配置", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "打开菜单", exact: true })).toBeVisible();
  const widths = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  expect(consoleErrors).toEqual([]);
});

test("business API rejects anonymous and non-owner requests", async () => {
  const anonymous = await request.newContext({
    baseURL: "http://localhost:4173",
    extraHTTPHeaders: {
      // Override the owner headers from the shared Playwright configuration.
      "oai-authenticated-user-id": "",
      "oai-authenticated-user-email": "",
    },
  });
  const nonOwner = await request.newContext({
    baseURL: "http://localhost:4173",
    extraHTTPHeaders: {
      "oai-authenticated-user-id": "not-owner",
      "oai-authenticated-user-email": "not-owner@example.com",
    },
  });
  expect((await anonymous.get("/api/bootstrap")).status()).toBe(401);
  expect((await nonOwner.get("/api/bootstrap")).status()).toBe(403);
  expect((await anonymous.get("/api/operations")).status()).toBe(401);
  expect((await nonOwner.get("/api/operations")).status()).toBe(403);
  await anonymous.dispose();
  await nonOwner.dispose();
});
