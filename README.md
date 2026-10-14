# 工业设计前瞻站 · v0.5 来源工作台

面向工业设计学生与从业者的个人研究系统，用于行业前瞻、知识技能储备、危机阶段推演，以及危机后的机会研究。

核心研究情景仍是可证伪假设：AI 行业可能在 2029 年左右出现泡沫破裂，工业设计相关机会可能在危机后 6–12 个月内进入恢复窗口。系统不会把它当作确定结论。

## v0.5 能力

- D1 是唯一业务数据源；`localStorage` 仅保存当前视图等界面偏好。
- ChatGPT 登录与服务端 `OWNER_EMAIL` 白名单共同限制唯一所有者。
- 信号、指标、假设、技能、机会和讨论使用统一记录模型。
- 新增、编辑、归档、软删除、恢复与完整修订历史。
- `expectedRevision` 乐观锁；版本冲突返回 `409`。
- 修改假设、置信度或证伪条件时必须填写理由。
- v1 JSON 导入向导按文件 SHA-256 拒绝重复导入。
- v2 完整 JSON 导出，用于迁移前手动备份。
- Workers Vitest 在隔离 D1 中实际应用 Drizzle 迁移。
- RSS / Atom 来源管理、网页 `rel="alternate"` 自动发现与手动同步。
- 每天北京时间 00:00（UTC `0 16 * * *`）执行幂等的 Worker 研究管线。
- RSS / Atom、BLS、FRED、SEC EDGAR 与 Eurostat 适配器；WIPO 等无稳定接口来源保留人工/RSS 路径。
- 来源可设每日、每周或每月节奏以及单次 1–100 条上限；单来源故障不会中断整批运行。
- 可选 DeepSeek JSON 整理：生成摘要、象限、相关度、立场、标签与假设关联建议。
- AI 调用具有超时、传输重试、条目抢占、崩溃恢复与最大尝试次数；密钥不进入来源配置或 Git。
- `pipeline_runs`、`sync_runs` 和待审核条目共同保留运行、来源与 AI 处理状态。
- 新增“自动化运营”应用层：集中显示 API 就绪状态、来源参数、整批运行、单来源日志与抓取数据。
- 运营台可安全编辑非密钥配置、测试单一来源、人工触发整条管线、筛选分页数据并重排失败 AI 条目。
- “来源管理”改为主从工作台：左侧搜索与筛选来源，右侧集中查看健康状态、错误诊断、运行记录和常用操作。
- 添加来源按推荐、RSS、官方 API 与普通网页分流；新来源默认停用，测试成功后再确认加入每日抓取。
- 全局管线锁阻止定时任务与人工运行重叠；过期锁会回收并留下失败审计记录。
- 运行时密钥只在服务端读取，浏览器只能看到已配置、缺失、可选或停用状态。
- 私网拦截、10 秒超时、1 MB 上限、100 条上限、条件请求与 GUID / URL / 内容哈希去重。
- 待审核条目可拒绝、忽略或转为信号草稿；选择象限并关联证据后才可发布到雷达。
- 证据库记录来源类别、可信度 1–5、相关度 1–5 和立场，但不自动修改假设置信度。
- 每周研究面板汇总待审核、来源健康、假设证据缺口、技能动作与机会触发器。

## 教师展示与跨学院共研

本地服务启动后访问 `/showcase`，可展示项目介绍、公开来源案例、计算机 / 人工智能 / 经管分工和六周试点提案。该页面使用独立的公开材料，不读取私有研究数据。原有工作台侧栏增加了项目介绍入口。

- [共研方案（可转发）](public/teacher-brief.md)
- [3 分钟讲稿与演示顺序](docs/TEACHER_PRESENTATION.md)
- [首周任务与证据 / AI 评估模板](docs/COLLABORATION_STARTER.md)

页面支持浏览器打印为 7 页横向 PDF。试点人数、周期和交付数量均为建议，未宣称团队已成立或产生研究成效。新版展示页须部署后才能通过公网访问；本地地址只供当前电脑演示。

本地服务运行在 3000 端口时，可用 `node scripts/export-showcase.mjs` 导出 `output/pdf/foresight-collaboration.pdf`；脚本同时将桌面与手机截图保存到忽略的 `work/showcase/`。如需其他地址，设置 `SHOWCASE_URL`。

## 本地运行

项目开发快照自动同步到 GitHub 的 [`sync/project-progress` 分支](https://github.com/lycorismmoonlights/industrial-design-foresight/tree/sync/project-progress)。查看[自动进度页](https://github.com/lycorismmoonlights/industrial-design-foresight/blob/sync/project-progress/docs/PROJECT_PROGRESS.md)；同步范围、手动运行和暂停方式见 [`docs/GITHUB_SYNC.md`](docs/GITHUB_SYNC.md)。

要求 Node.js 22.13+ 与 pnpm 11。

```powershell
Copy-Item .env.example .env.local
# 编辑 .env.local，把 OWNER_EMAIL 改成用于本地请求的登录邮箱
pnpm install
pnpm run db:migrate:local
pnpm run dev
```

`db:migrate:local` 把 `drizzle/` 中的迁移应用到 Vite/Miniflare 共用的 `.wrangler/state`。托管环境由 Sites 根据 `.openai/hosting.json` 创建并绑定 `DB`。

## 检查

```powershell
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm run test:browser
```

`pnpm run test` 使用 Cloudflare Workers Vitest 集成，并在 workerd 内应用实际迁移后测试 CRUD、RSS/Atom 与官方 API 规范化、网络边界、去重、单来源失败隔离、DeepSeek 结构化输出、AI 安全边界、管线幂等和 Cron 服务。`pnpm run test:browser` 使用 Playwright 验证所有者流程、跨刷新持久化、手机端布局和 API 身份拦截。

## 关键结构

- `app/components/ForesightApp.tsx`：研究视图与交互界面
- `app/hooks/useResearchData.ts`：客户端云端数据状态
- `app/data/api-client.ts`：统一 API 客户端
- `app/server/repository.ts`：D1 数据服务与并发控制
- `app/server/ingestion.ts`：来源、抓取、去重、审核与证据服务
- `app/server/source-adapters.ts`：BLS、FRED、SEC 与 Eurostat 官方 API 规范化
- `app/server/deepseek.ts`：DeepSeek 请求、JSON 校验与提示注入边界
- `app/server/ai-processing.ts`：AI 条目抢占、重试、恢复与结果持久化
- `app/server/daily-pipeline.ts`：每日管线运行锁、汇总状态与故障隔离
- `app/server/operations.ts`：运营概览、抓取数据分页查询和失败 AI 重排队
- `app/components/AutomationOperations.tsx`：API、来源、运行记录与抓取数据运营台
- `app/components/SourceEditor.tsx`：来源基础设置与高级适配器参数的共享编辑器
- `app/server/network-safety.ts`：订阅请求的 SSRF、超时和体积边界
- `app/server/feed.ts`：基于 `fast-xml-parser` 的 RSS / Atom 规范化
- `app/components/ResearchOperations.tsx`：来源、待审核、证据与每周面板
- `app/server/auth.ts`：所有者身份校验
- `app/api/`：v2 API 路由
- `db/schema.ts`：Drizzle/D1 Schema
- `drizzle/`：纳入版本管理的 SQL 迁移
- `tests/`：Workers/D1、订阅解析、网络边界和抓取审核测试

## 安全与数据边界

- `OWNER_EMAIL` 和平台凭据只在本地忽略文件或 Sites 运行时设置，不写入 Git。
- `DEEPSEEK_API_KEY`、`FRED_API_KEY`、`BLS_API_KEY` 只从环境变量读取；来源配置会拒绝疑似密钥字段。
- 生产库默认为空；可选择导入 v1 备份或示例数据。
- 正式迁移前先记录 D1 Time Travel bookmark，并导出一份 v2 JSON。
- 订阅只负责发现资料；正式行业信号必须人工审核。

部署、迁移、回滚和每周维护步骤见 [`docs/OPERATIONS.md`](docs/OPERATIONS.md)，来源 JSON 示例见 [`docs/SOURCE_ADAPTERS.md`](docs/SOURCE_ADAPTERS.md)。
