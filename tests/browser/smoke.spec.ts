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
  await expect(page.getByRole("button", { name: "确认并启用" })).toHaveCount(3);

  const sourceName = `CI 冒烟来源 ${Date.now()}`;
  await page.getByLabel("来源名称", { exact: true }).fill(sourceName);
  await page.getByLabel("订阅地址", { exact: true }).fill(`https://example.com/${Date.now()}.xml`);
  await page.getByRole("button", { name: "添加为停用状态", exact: true }).click();
  await expect(page.getByText(sourceName, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(sourceName, { exact: true })).toBeVisible();

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
  await anonymous.dispose();
  await nonOwner.dispose();
});
