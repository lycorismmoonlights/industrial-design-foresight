# GitHub 项目进度自动同步

## 查看进度

- [最新代码与文档快照](https://github.com/lycorismmoonlights/industrial-design-foresight/tree/sync/project-progress)
- [自动进度页](https://github.com/lycorismmoonlights/industrial-design-foresight/blob/sync/project-progress/docs/PROJECT_PROGRESS.md)
- [历史快照](https://github.com/lycorismmoonlights/industrial-design-foresight/commits/sync/project-progress)
- [快照 CI](https://github.com/lycorismmoonlights/industrial-design-foresight/actions/workflows/ci.yml?query=branch%3Async%2Fproject-progress)

本仓库公开；同步内容在 GitHub 上公开可见。同步分支包含未提交的开发成果，供备份和人工查看，不代表发布版本。

## 自动运行

Codex 当前任务中的“项目进度同步到 GitHub”自动化每小时调用 `pnpm run sync:github`。本地电脑须开机、联网且 Codex 应用保持运行；关闭后无法读取本机工作区。无变化时不产生提交，不重复报告；推送失败、发现疑似密钥或有需要处理的 CI 失败时提醒。

频率与暂停开关在 Codex 自动化界面管理。此任务不受研究系统每天北京时间 00:00 的 Cloudflare Cron 控制。

## 手动运行

在项目根目录执行：

```powershell
pnpm run sync:github:preview
pnpm run sync:github
```

预览会构建本地临时 Git 对象并读取远端，不推送。`sync:github` 使用现有 Git 凭据，检查 origin 与 `scripts/github-sync.config.json` 一致，仅向 `sync/project-progress` 普通推送。首次快照以远端 main 为父提交，以后按快照顺序保留历史。

## 文件范围与保护

- 包含 `app/`、`db/`、`drizzle/`、`worker/`、`tests/`、`public/`、`scripts/`、`docs/`、`build/`、`examples/`、`.github/` 下白名单扩展名，以及根目录代码、说明与配置；保留 `.env.example` 和 `.openai/hosting.json`。
- 排除 `.env*`、`.dev.vars*`、密钥和凭据文件、数据库文件、依赖、构建目录、截图和 PDF 导出、备份及工作临时文件。D1 业务数据不会通过此任务读取。
- 扫描待上传 Git blob 中常见的令牌、API key 和私钥格式；发现时整轮停止，仅报告路径。规则无法识别所有私密文字，请勿把个人资料或内部业务数据写进公开代码和文档。
- 新目录或新文件类型须先检查 `isSyncPath` 白名单；预览输出 `excluded` 可查看本轮排除项。
- 使用独立临时 Git index，保留开发分支、用户暂存区、未提交修改和本地文件。不会 checkout、reset、stash、merge 或 force push。
- 正在合并、变基或存在冲突时停止。并发运行由 Git 公共目录内的 `github-progress-sync.lock` 阻止；进程异常退出后，先确认没有同步进程，再人工删除残留锁目录。
- 网络或认证失败保留所有本地成果，下个周期重试；远端并发写入导致推送被拒绝时，不覆盖远端。
- 快照采集期间仍在编辑的文件可能包含中间状态；CI 用于检查快照，正式发布需人工审核。

`docs/PROJECT_PROGRESS.md` 和 `docs/github-sync-state.json` 直接生成到快照提交中，不写回工作区。内容哈希、来源提交与分支都未变化时跳过提交，避免时间戳制造空更新。进度页列出实际变更，不自动编造完成百分比或验证结果。

## 验证与维护

```powershell
pnpm run test:sync
pnpm run lint
```

专用测试使用临时本地 Git 仓库，检查文件排除、密钥拦截、暂存区保护、变更和删除同步、重复运行、远端冲突与运行失败。推送后 GitHub Actions 对快照运行同步测试、TypeScript、Lint、Workers/D1 测试、构建和浏览器测试；以对应提交的实际 CI 结果为准。

脚本或配置缺失、远端变更、认证过期时应修复具体原因，不绕过白名单、秘密扫描或普通推送约束。恢复文件时先比较并按需取回，不自动覆盖当前开发工作。

本地运行条件参考：[OpenAI 官方定时任务说明](https://learn.chatgpt.com/docs/automations?surface=app)。
