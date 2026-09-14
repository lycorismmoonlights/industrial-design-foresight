# 项目进度自动快照

这是开发工作区的版本备份，包含尚未提交的代码；不表示已发布、部署或验收。

- 同步时间（UTC）：2026-09-14T14:26:46.016Z
- 来源分支：`feat/source-management-redesign`
- 来源 HEAD：`64bfc1a5b1710d9b5581efb598152873838e8657`
- 代码内容树：`9be8bb7be28ccbb37ce1224ef06195b6dae2f412`
- 同步文件：100 个
- 同步范围：代码、配置、测试、公开资源与进度文档。

## 本次变更（相对上一快照；首次相对 main）

```text
M	.env.example
M	.github/workflows/ci.yml
M	README.md
A	app/api/operations/inbox/route.ts
A	app/api/operations/route.ts
A	app/api/operations/run/route.ts
M	app/api/sources/route.ts
A	app/components/AutomationOperations.tsx
M	app/components/ForesightApp.tsx
M	app/components/ResearchOperations.tsx
A	app/components/SourceEditor.tsx
M	app/globals.css
M	app/hooks/useResearchData.ts
M	app/model.ts
A	app/operations-model.ts
A	app/server/ai-processing.ts
A	app/server/daily-pipeline.ts
A	app/server/deepseek.ts
M	app/server/ingestion.ts
A	app/server/operations.ts
M	app/server/repository.ts
A	app/server/source-adapters.ts
A	app/showcase/ProjectShowcase.tsx
A	app/showcase/page.tsx
A	app/showcase/showcase.css
M	app/v2-model.ts
M	db/index.ts
M	db/schema.ts
A	design-qa.md
A	docs/COLLABORATION_STARTER.md
A	docs/GITHUB_SYNC.md
M	docs/OPERATIONS.md
A	docs/SHOWCASE_VALIDATION.md
A	docs/SOURCE_ADAPTERS.md
A	docs/TEACHER_PRESENTATION.md
A	drizzle/0001_numerous_pestilence.sql
A	drizzle/0002_special_brood.sql
A	drizzle/meta/0001_snapshot.json
A	drizzle/meta/0002_snapshot.json
M	drizzle/meta/_journal.json
M	package.json
A	public/teacher-brief.md
A	scripts/export-showcase.mjs
A	scripts/github-sync.config.json
A	scripts/sync-github.mjs
A	scripts/sync-github.test.mjs
A	tests/browser/showcase.spec.ts
M	tests/browser/smoke.spec.ts
A	tests/operations.test.ts
A	tests/research-pipeline.test.ts
M	vite.config.ts
M	worker/index.ts
M	worker/scheduled.ts
```

## 项目说明与验证

- [项目能力与本地运行](../README.md)
- [教师展示版验证记录](SHOWCASE_VALIDATION.md)（历史记录，非本次自动验证）
- [自动同步说明](GITHUB_SYNC.md)
- [本分支 CI](https://github.com/lycorismmoonlights/industrial-design-foresight/actions/workflows/ci.yml?query=branch%3Async%2Fproject-progress)：查看与本次快照提交对应的运行结果。
- 自动快照不运行应用验收，不自动判断研究完成度或修改研究结论。
