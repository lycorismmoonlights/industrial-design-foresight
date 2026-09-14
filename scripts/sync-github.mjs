import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, rmdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reportPath = "docs/PROJECT_PROGRESS.md";
const statePath = "docs/github-sync-state.json";
const directories = new Set(["app", "db", "drizzle", "worker", "tests", "public", "scripts", "docs", "build", "examples", ".github"]);
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".jsonc", ".yaml", ".yml", ".md", ".mdx", ".css", ".scss", ".sql", ".html", ".svg", ".txt", ".toml", ".xml", ".sh", ".ps1", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".woff", ".woff2"]);

export function isSyncPath(path) {
  const parts = path.split("/");
  if (path === reportPath || path === statePath) return false;
  if (path === ".env.example" || path === ".openai/hosting.json") return true;
  if (parts.some((part) => /^(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|\.git|\.wrangler|node_modules|output|outputs|work|coverage|dist|test-results|playwright-report|secrets?|credentials?)(?:$)/i.test(part))) return false;
  if (/^(?:docs|public)\/(?:.*\/)?(?:backups?|exports?)\//i.test(path)) return false;
  if (/(?:^|\/)(?:[^/]*\.)?(?:secrets?|credentials?)(?:\.[^/]*)?$/i.test(path)) return false;
  if (parts.length === 1) return [".gitignore", ".gitattributes"].includes(path) || extensions.has(extname(path));
  return directories.has(parts[0]) && extensions.has(extname(path));
}

export function hasSecret(content) {
  return /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(content)
    || /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16})\b/.test(content)
    || /["']?(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|DEEPSEEK_API_KEY|FRED_API_KEY|BLS_API_KEY)["']?\s*[:=]\s*["'][A-Za-z0-9_+/=-]{24,}["']/i.test(content);
}

// A temporary index builds a snapshot without staging, committing, or checking out
// anything in the developer's branch. The remote branch is updated by normal push.
export function syncGithub({ repoDir, config, push = false }) {
  const environment = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never", GIT_OPTIONAL_LOCKS: "0" };
  delete environment.GIT_INDEX_FILE;
  const git = (args, { input, allowed = [0] } = {}) => {
    const result = spawnSync("git", args, { cwd: repoDir, env: environment, input, encoding: "utf8", timeout: 60_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
    if (result.error || !allowed.includes(result.status)) {
      // Do not echo command output: credentials may appear in remote errors.
      throw new Error(`Git ${args[0]} failed (${result.error?.code ?? result.status}); no force push or automatic conflict resolution was attempted.`);
    }
    return result.stdout.trimEnd();
  };
  const { remoteUrl, branch, baseBranch } = config;
  if (branch !== "sync/project-progress") throw new Error("Only sync/project-progress may be updated.");
  git(["check-ref-format", `refs/heads/${baseBranch}`]);
  if (git(["remote", "get-url", "origin"]) !== remoteUrl || git(["remote", "get-url", "--push", "--all", "origin"]) !== remoteUrl) {
    throw new Error("origin does not match the configured repository; review the remote before syncing.");
  }
  const sourceBranch = git(["symbolic-ref", "--short", "HEAD"]);
  if (sourceBranch === branch) throw new Error("Run from the development checkout, not the snapshot branch.");
  const sourceHead = git(["rev-parse", "HEAD"]);
  const gitDir = git(["rev-parse", "--absolute-git-dir"]);
  for (const marker of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "BISECT_LOG"]) {
    if (existsSync(join(gitDir, marker))) throw new Error("Finish the active Git operation before syncing.");
  }
  if (git(["ls-files", "--unmerged"])) throw new Error("Resolve unmerged files before syncing.");
  const lockDir = join(resolve(repoDir, git(["rev-parse", "--git-common-dir"])), "github-progress-sync.lock");
  try { mkdirSync(lockDir); } catch (error) {
    if (error.code === "EEXIST") throw new Error("Sync lock exists; another run may be active. Review before removing a stale lock.");
    throw error;
  }
  const indexFile = join(lockDir, "index");
  try {
    const candidates = git(["ls-files", "--cached", "--others", "--exclude-standard", "--deduplicate", "-z"]).split("\0").filter(Boolean);
    const ignored = new Set(git(["check-ignore", "--no-index", "--stdin", "-z"], { input: `${candidates.join("\0")}\0`, allowed: [0, 1] }).split("\0"));
    const selected = [];
    const excluded = [];
    for (const path of candidates) {
      if (!isSyncPath(path) || ignored.has(path)) { excluded.push(path); continue; }
      const absolute = resolve(repoDir, path);
      if (!existsSync(absolute)) continue;
      // Check every component so a directory symlink cannot expose outside files.
      let cursor = repoDir;
      for (const part of path.split("/")) {
        cursor = join(cursor, part);
        if (lstatSync(cursor).isSymbolicLink()) throw new Error(`Symlink needs manual review: ${path}`);
      }
      const stat = lstatSync(absolute);
      if (!stat.isFile() || stat.size > 5 * 1024 * 1024) throw new Error(`Unsupported or oversized file needs review: ${path}`);
      selected.push(path);
    }
    if (selected.length === 0) throw new Error("No eligible project files found.");
    environment.GIT_INDEX_FILE = indexFile;
    git(["read-tree", "--empty"]);
    git(["--literal-pathspecs", "add", "--pathspec-from-file=-", "--pathspec-file-nul"], { input: `${selected.join("\0")}\0` });
    // Scan the exact staged blobs, including any clean-filter transformation.
    for (const path of selected) {
      if (hasSecret(git(["show", `:${path}`]))) throw new Error(`Possible secret detected; sync stopped. Review ${path} locally.`);
    }
    const sourceTree = git(["write-tree"]);
    const remoteHead = git(["ls-remote", "--exit-code", "--heads", "origin", `refs/heads/${branch}`], { allowed: [0, 2] }).split(/\s/)[0];
    git(["fetch", "--quiet", "--no-tags", "origin", `refs/heads/${remoteHead ? branch : baseBranch}`]);
    const parent = git(["rev-parse", "FETCH_HEAD"]);
    const oldStateExists = remoteHead && git(["ls-tree", "--name-only", parent, statePath]) === statePath;
    if (oldStateExists) {
      const previous = JSON.parse(git(["show", `${parent}:${statePath}`]));
      if (previous.sourceTree === sourceTree && previous.sourceHead === sourceHead && previous.sourceBranch === sourceBranch) {
        return { status: "unchanged", branch, commit: parent, excluded };
      }
    }
    const changes = git(["diff", "--name-status", "--no-renames", parent, sourceTree, "--", ".", `:(exclude)${reportPath}`, `:(exclude)${statePath}`]);
    const timestamp = new Date().toISOString();
    const siteUrl = remoteUrl.startsWith("https://github.com/") ? remoteUrl.replace(/\.git$/, "") : null;
    const report = [
      "# 项目进度自动快照", "",
      "这是开发工作区的版本备份，包含尚未提交的代码；不表示已发布、部署或验收。", "",
      `- 同步时间（UTC）：${timestamp}`,
      `- 来源分支：\`${sourceBranch}\``,
      `- 来源 HEAD：\`${sourceHead}\``,
      `- 代码内容树：\`${sourceTree}\``,
      `- 同步文件：${selected.length} 个`,
      "- 同步范围：代码、配置、测试、公开资源与进度文档。", "",
      "## 本次变更（相对上一快照；首次相对 main）", "",
      "```text", changes || "代码内容未变化，仅来源提交或分支变化。", "```", "",
      "## 项目说明与验证", "",
      "- [项目能力与本地运行](../README.md)",
      "- [教师展示版验证记录](SHOWCASE_VALIDATION.md)（历史记录，非本次自动验证）",
      "- [自动同步说明](GITHUB_SYNC.md)",
      siteUrl ? `- [本分支 CI](${siteUrl}/actions/workflows/ci.yml?query=branch%3Async%2Fproject-progress)：查看与本次快照提交对应的运行结果。` : "- 本地测试仓库不运行 GitHub Actions。",
      "- 自动快照不运行应用验收，不自动判断研究完成度或修改研究结论。", "",
    ].join("\n");
    const state = `${JSON.stringify({ sourceTree, sourceHead, sourceBranch, timestamp }, null, 2)}\n`;
    for (const [path, content] of [[reportPath, report], [statePath, state]]) {
      const blob = git(["hash-object", "-w", "--stdin"], { input: content });
      git(["update-index", "--add", "--cacheinfo", "100644", blob, path]);
    }
    const tree = git(["write-tree"]);
    if (!push) return { status: "preview", branch, selected: selected.length, excluded, changes, report };
    if (git(["rev-parse", "HEAD"]) !== sourceHead || git(["symbolic-ref", "--short", "HEAD"]) !== sourceBranch) {
      throw new Error("Development branch changed during snapshot; retry next run.");
    }
    // Use an explicit bot identity without changing the developer's Git config.
    environment.GIT_AUTHOR_NAME = environment.GIT_COMMITTER_NAME = "Project Progress Sync";
    environment.GIT_AUTHOR_EMAIL = environment.GIT_COMMITTER_EMAIL = "project-progress-sync@users.noreply.github.com";
    const commit = git(["-c", "commit.gpgSign=false", "commit-tree", tree, "-p", parent], { input: `chore(sync): project progress ${timestamp}\n\nSource-Head: ${sourceHead}\n` });
    git(["push", "--porcelain", "origin", `${commit}:refs/heads/${branch}`]);
    const verified = git(["ls-remote", "--exit-code", "--heads", "origin", `refs/heads/${branch}`]).split(/\s/)[0];
    if (verified !== commit) throw new Error("Push completed but remote head differs; inspect remote history before retrying.");
    return { status: "synced", branch, commit, selected: selected.length, excluded, changes };
  } finally {
    rmSync(indexFile, { force: true });
    rmSync(`${indexFile}.lock`, { force: true });
    // Only this run's freshly created lock directory is removed.
    rmdirSync(lockDir);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => !["--push", "--dry-run"].includes(arg)) || (args.includes("--push") && args.includes("--dry-run"))) throw new Error("Usage: node scripts/sync-github.mjs [--dry-run | --push]");
    const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const config = JSON.parse(readFileSync(join(repoDir, "scripts/github-sync.config.json"), "utf8"));
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/.test(config.remoteUrl)) throw new Error("A GitHub HTTPS repository URL without credentials is required.");
    console.log(JSON.stringify(syncGithub({ repoDir, config, push: args.includes("--push") }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
