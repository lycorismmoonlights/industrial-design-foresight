# 工业设计前瞻站 · v0.2 私有研究版

面向工业设计学生与从业者的个人研究系统，用于行业前瞻、知识技能储备、危机阶段推演，以及危机后的机会研究。

核心研究情景仍是可证伪假设：AI 行业可能在 2029 年左右出现泡沫破裂，工业设计相关机会可能在危机后 6–12 个月内进入恢复窗口。系统不会把它当作确定结论。

## v0.2 能力

- D1 是唯一业务数据源；`localStorage` 仅保存当前视图等界面偏好。
- ChatGPT 登录与服务端 `OWNER_EMAIL` 白名单共同限制唯一所有者。
- 信号、指标、假设、技能、机会和讨论使用统一记录模型。
- 新增、编辑、归档、软删除、恢复与完整修订历史。
- `expectedRevision` 乐观锁；版本冲突返回 `409`。
- 修改假设、置信度或证伪条件时必须填写理由。
- v1 JSON 导入向导按文件 SHA-256 拒绝重复导入。
- v2 完整 JSON 导出，用于迁移前手动备份。
- Workers Vitest 在隔离 D1 中实际应用 Drizzle 迁移。

订阅来源、待审核箱、证据关联、Cron 与每周研究面板在第二功能分支实现。

## 本地运行

要求 Node.js 22.13+ 与 pnpm 11。

```powershell
Copy-Item .env.example .env.local
# 编辑 .env.local，把 OWNER_EMAIL 改成用于本地请求的登录邮箱
pnpm install
pnpm run dev
```

首次启动前，D1 迁移位于 `drizzle/`。托管环境由 Sites 根据 `.openai/hosting.json` 创建并绑定 `DB`。

## 检查

```powershell
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

`pnpm run test` 使用 Cloudflare Workers Vitest 集成，并在 workerd 内应用实际迁移后测试 CRUD、软删除恢复、版本冲突、假设变更理由与 v1 导入。

## 关键结构

- `app/components/ForesightApp.tsx`：研究视图与交互界面
- `app/hooks/useResearchData.ts`：客户端云端数据状态
- `app/data/api-client.ts`：统一 API 客户端
- `app/server/repository.ts`：D1 数据服务与并发控制
- `app/server/auth.ts`：所有者身份校验
- `app/api/`：v2 API 路由
- `db/schema.ts`：Drizzle/D1 Schema
- `drizzle/`：纳入版本管理的 SQL 迁移
- `tests/records.test.ts`：Workers/D1 集成测试

## 安全与数据边界

- `OWNER_EMAIL` 和平台凭据只在本地忽略文件或 Sites 运行时设置，不写入 Git。
- 生产库默认为空；可选择导入 v1 备份或示例数据。
- 正式迁移前先记录 D1 Time Travel bookmark，并导出一份 v2 JSON。
- 订阅只负责发现资料；正式行业信号必须人工审核。
