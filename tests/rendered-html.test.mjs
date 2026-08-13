import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the industrial design foresight dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<title>工业设计前瞻站 · 测试版<\/title>/);
  assert.match(html, /工业设计前瞻总览/);
  assert.match(html, /2029 左右可能破裂/);
  assert.match(html, /6–12 个月或出现复苏窗口/);
  assert.match(html, /演示数据 · 非实时监测/);
  assert.match(html, /行业雷达/);
  assert.match(html, /讨论与决策/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps core data assumptions and local-first behavior explicit", async () => {
  const [model, data, app] = await Promise.all([
    readFile(new URL("../app/model.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/demo-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ForesightApp.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(model, /STORAGE_KEY = "id-foresight-demo-v1"/);
  assert.match(model, /function calculatePhase/);
  assert.match(model, /function isResearchStore/);
  assert.match(data, /2028 Q2 — 2030 Q1/);
  assert.match(data, /危机触发后 6–12 个月/);
  assert.match(data, /scenarioPresets/);
  assert.match(app, /window\.localStorage/);
  assert.match(app, /JSON\.stringify\(store, null, 2\)/);
  assert.match(app, /讨论已转为可追溯决策/);
});
