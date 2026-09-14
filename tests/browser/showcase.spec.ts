import { expect, test } from "@playwright/test";

test.describe("public project presentation", () => {
  // Visitors can see the curated pitch without an owner session.
  test.use({ extraHTTPHeaders: {} });

  test("case review and discipline tasks work without reading or writing private APIs", async ({ page }) => {
    const errors: string[] = [];
    const apiRequests: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("request", req => { if (new URL(req.url()).pathname.startsWith("/api/")) apiRequests.push(req.url()); });
    await page.goto("/showcase");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("设计行动");
    await page.getByRole("link", { name: "用一个案例看懂", exact: true }).click();
    await expect(page.getByRole("button", { name: "上一步", exact: true })).toBeDisabled();
    for (const title of ["可维修设计，能否成为一个好课题？", "让不同专业，挑战同一个假设", "把一个趋势，变成一项可验收的行动"]) {
      await page.getByRole("button", { name: "下一步", exact: true }).click();
      await expect(page.locator("#case-detail h3")).toHaveText(title);
    }
    await expect(page.getByRole("button", { name: "下一步", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "认定市场机会成立", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("证据还不够");
    await page.getByRole("button", { name: "继续研究与验证", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("合理的下一步");
    for (const [discipline, output] of [["计算机", "可复现脚本"], ["人工智能", "模型误差分析"], ["经管", "反证备忘录"]]) {
      await page.locator(".pitch-role-grid button").filter({ has: page.getByRole("heading", { name: discipline, exact: true }) }).click();
      await expect(page.locator("#role-detail")).toContainText(output);
    }
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "下载共研方案", exact: true }).click();
    expect((await downloadPromise).suggestedFilename()).toBe("teacher-brief.md");
    await page.reload();
    await expect(page.getByRole("status")).toContainText("选择只在当前页面生效");
    expect(apiRequests).toEqual([]);
    expect(errors).toEqual([]);
    // Adding the presentation must not make the research data public.
    expect((await page.request.get("/api/bootstrap")).status()).toBe(401);
  });

  test("mobile layout and print contain all disciplines and all case stages", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/showcase");
    await page.getByRole("link", { name: "共研计划", exact: true }).click();
    await expect(page.getByRole("heading", { name: "先用六周，证明值得继续。", exact: true })).toBeInViewport();
    const width = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(width.scroll).toBeLessThanOrEqual(width.client);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".pitch-case-interactive")).toBeHidden();
    await expect(page.locator(".pitch-print-case article")).toHaveCount(4);
    await expect(page.locator(".pitch-print-case")).toBeVisible();
    await expect(page.locator(".pitch-print-role-list")).toContainText("人工智能");
    await expect(page.locator(".pitch-print-role-list")).toContainText("经管");
  });
});
