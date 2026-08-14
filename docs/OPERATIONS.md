# v0.2 私有研究版运行手册

## 部署前

1. 确认 Git 工作区干净，CI 的 TypeScript、Lint、Workers/D1 测试和生产构建全部通过。
2. 在部署环境交互式设置 `OWNER_EMAIL`；它必须与唯一所有者的 ChatGPT 登录邮箱一致。不要把邮箱、令牌或 Cloudflare 凭据提交到 Git。
3. 确认 D1 绑定名为 `DB`，并在正式库应用 `drizzle/` 内的迁移。
4. 生产库默认为空。首次登录后可导入 v1 JSON 或示例数据；同一原始文件只允许导入一次。

本地首次启动或新增迁移后先运行：

```powershell
pnpm run db:migrate:local
```

## 正式迁移保护

先在应用“数据与备份”中导出 v2 JSON，再记录迁移前 bookmark：

```powershell
pnpm wrangler d1 info YOUR_DATABASE
pnpm wrangler d1 time-travel info YOUR_DATABASE
```

把命令输出的 bookmark、执行时间、Git commit 和操作者记录在变更单中。Time Travel 自动开启；免费计划恢复窗口为 7 天，付费计划最长 30 天。

发生迁移事故时，先停止继续写入并导出仍可访问的数据。D1 原地恢复是破坏性操作，必须由项目所有者确认后才执行：

```powershell
pnpm wrangler d1 time-travel restore YOUR_DATABASE --bookmark=BOOKMARK
```

## 订阅与 Cron

- Worker Cron：`30 0 * * *`，即北京时间每天 08:30。
- 本地开发可用 Cloudflare 的 scheduled handler 模拟能力；集成测试直接运行同一调度服务。
- 新来源默认停用。首次启用必须在界面确认。
- 只允许 HTTP/HTTPS；每来源 10 秒、1 MB、100 条，最多 3 次安全重定向。
- 抓取保存元数据，不保存全文或图片。
- ETag / Last-Modified 用于条件请求；GUID、规范 URL、内容哈希依次参与去重。
- 单来源异常写入 `sync_runs` 和来源健康状态，不中断其他来源。

## 每周复盘

建议固定 30–45 分钟：

1. 清理待审核箱，拒绝噪声或转为信号草稿。
2. 查看启用来源的异常与最近新增数量。
3. 为没有关联证据的假设补一条支持或反方资料。
4. 只选择一个技能“下一动作”，产出可验证结果。
5. 检查机会触发器是否真正发生，避免仅凭趋势入场。
6. 对 2029 泡沫破裂与危机后 6–12 个月复苏窗口的假设，记录新证据和变更理由；不要把它们当作自动结论。

## 发布验收

- 非所有者页面与 API 均不能访问业务数据。
- 刷新后记录、修订、来源和待审核条目仍存在于 D1。
- 同一订阅连续抓取两次不会产生重复条目。
- 信号草稿没有象限或证据时不能发布。
- v1 导入前后六类记录数量一致。
- JSON 导出可下载；手机宽度无横向页面溢出；控制台无错误。

参考：

- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare Workers Vitest](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [Cloudflare D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
