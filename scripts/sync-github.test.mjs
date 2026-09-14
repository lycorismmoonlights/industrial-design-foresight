import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { hasSecret, isSyncPath, syncGithub } from "./sync-github.mjs";

function fixture(t) {
  const parent = resolve(tmpdir());
  const root = mkdtempSync(join(parent, "foresight-sync-test-"));
  t.after(() => {
    assert.equal(dirname(root), parent);
    assert.ok(root.startsWith(join(parent, "foresight-sync-test-")));
    rmSync(root, { recursive: true, force: true });
  });
  const repoDir = join(root, "工作 空间");
  const remoteUrl = join(root, "remote.git");
  mkdirSync(repoDir);
  const git = (...args) => execFileSync("git", args, { cwd: repoDir, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }, encoding: "utf8", windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }).trimEnd();
  const write = (path, content) => { const file = join(repoDir, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, content); };
  git("init", "--bare", remoteUrl);
  git("init", "--initial-branch=main");
  git("config", "user.name", "Sync Test");
  git("config", "user.email", "sync-test@example.com");
  git("config", "commit.gpgSign", "false");
  git("config", "core.autocrlf", "false");
  write(".gitignore", ".env*\n!.env.example\nnode_modules/\nwork/\n");
  write("README.md", "# Test project\n");
  write("app/page.ts", "export const value = 1;\n");
  git("add", ".");
  git("commit", "-m", "Initial project");
  git("remote", "add", "origin", remoteUrl);
  git("push", "origin", "main");
  git("checkout", "-b", "feature/local");
  const config = { remoteUrl, branch: "sync/project-progress", baseBranch: "main" };
  const sync = (push = true) => syncGithub({ repoDir, config, push });
  const remoteHead = () => git("ls-remote", "--heads", "origin", "refs/heads/sync/project-progress").split(/\s/)[0];
  return { repoDir, remoteUrl, config, git, write, sync, remoteHead };
}

test("allowlist excludes runtime data, credentials and exports", () => {
  for (const path of ["app/page.tsx", "app/api/export/route.ts", "docs/进度 记录.md", "pnpm-lock.yaml", ".env.example", ".github/workflows/ci.yml", ".openai/hosting.json"]) assert.equal(isSyncPath(path), true, path);
  for (const path of [".env.local", ".dev.vars", "app/.env.production", "docs/secrets.json", "docs/my.credentials.json", "docs/backups/data.json", "output/report.pdf", ".wrangler/state/db.sqlite", "public/data.db", "node_modules/code.js", "unreviewed/info.md", "docs/PROJECT_PROGRESS.md"]) assert.equal(isSyncPath(path), false, path);
});

test("secret scanning recognizes tokens without rejecting environment references", () => {
  assert.equal(hasSecret(["ghp", "_", "A".repeat(40)].join("")), true);
  assert.equal(hasSecret(["sk", "-", "a".repeat(32)].join("")), true);
  assert.equal(hasSecret(["-----BEGIN ", "PRIVATE KEY-----"].join("")), true);
  assert.equal(hasSecret(`api_key: "${"b".repeat(32)}"`), true);
  assert.equal(hasSecret("const key = process.env.DEEPSEEK_API_KEY;"), false);
});

test("snapshots uncommitted files, preserves real index and HEAD, then skips unchanged runs", (t) => {
  const f = fixture(t);
  f.write("app/page.ts", "export const value = 2;\n");
  f.git("add", "app/page.ts");
  f.write("app/page.ts", "export const value = 3;\n");
  f.write("docs/进度 记录.md", "当前工作\n");
  f.write(".env.local", "private local value\n");
  f.write("output/report.pdf", "local generated output\n");
  f.write("docs/credentials.json", "private config\n");
  const head = f.git("rev-parse", "HEAD");
  const indexFile = join(f.repoDir, ".git/index");
  const indexHash = () => createHash("sha256").update(readFileSync(indexFile)).digest("hex");
  const beforeIndex = indexHash();
  const beforeStatus = f.git("status", "--porcelain=v1", "-uall");
  const result = f.sync();
  assert.equal(result.status, "synced");
  assert.equal(f.git("rev-parse", "HEAD"), head);
  assert.equal(f.git("symbolic-ref", "--short", "HEAD"), "feature/local");
  assert.equal(indexHash(), beforeIndex);
  assert.equal(f.git("status", "--porcelain=v1", "-uall"), beforeStatus);
  assert.equal(f.git("show", `${result.commit}:app/page.ts`), "export const value = 3;");
  assert.equal(f.git("show", `${result.commit}:docs/进度 记录.md`), "当前工作");
  const paths = f.git("ls-tree", "-r", "--name-only", result.commit);
  assert.ok(!paths.includes(".env.local") && !paths.includes("output/") && !paths.includes("credentials.json"));
  assert.ok(paths.includes("docs/PROJECT_PROGRESS.md"));
  assert.equal(existsSync(join(f.repoDir, "docs/PROJECT_PROGRESS.md")), false);
  assert.equal(f.sync().status, "unchanged");
  assert.equal(f.remoteHead(), result.commit);
  assert.equal(indexHash(), beforeIndex);
});

test("previews never push; edits and deletions are appended to remote history", (t) => {
  const f = fixture(t);
  assert.equal(f.sync(false).status, "preview");
  assert.equal(f.remoteHead(), "");
  const first = f.sync();
  rmSync(join(f.repoDir, "app/page.ts"));
  f.write("app/new.ts", "export const next = true;\n");
  const second = f.sync();
  assert.notEqual(first.commit, second.commit);
  assert.equal(f.git("rev-parse", `${second.commit}^`), first.commit);
  assert.equal(f.git("ls-tree", "--name-only", second.commit, "app/page.ts"), "");
  assert.match(f.git("show", `${second.commit}:docs/PROJECT_PROGRESS.md`), /app\/new.ts/);
});

test("suspected secrets block all uploads and release the run lock", (t) => {
  const f = fixture(t);
  f.write("app/config.ts", `export const key = "${["ghp", "_", "A".repeat(40)].join("")}";\n`);
  assert.throws(() => f.sync(), /Possible secret detected/);
  assert.equal(f.remoteHead(), "");
  assert.equal(existsSync(join(f.repoDir, ".git/github-progress-sync.lock")), false);
  f.write("app/config.ts", "export const key = process.env.API_KEY;\n");
  assert.equal(f.sync().status, "synced");
});

test("rejects a changed destination and active Git operations", (t) => {
  const f = fixture(t);
  assert.throws(() => syncGithub({ repoDir: f.repoDir, config: { ...f.config, branch: "main" }, push: true }), /Only sync/);
  f.git("remote", "set-url", "--push", "origin", join(f.repoDir, "other.git"));
  assert.throws(() => f.sync(), /origin does not match/);
  f.git("remote", "set-url", "--push", "origin", f.remoteUrl);
  f.write(".git/MERGE_HEAD", f.git("rev-parse", "HEAD"));
  assert.throws(() => f.sync(), /active Git operation/);
  rmSync(join(f.repoDir, ".git/MERGE_HEAD"));
  f.write(".git/github-progress-sync.lock/in-progress", "active");
  assert.throws(() => f.sync(), /Sync lock exists/);
});

test("remote push rejection leaves developer work untouched and next run can retry", (t) => {
  const f = fixture(t);
  const before = f.git("rev-parse", "HEAD");
  const hook = join(f.remoteUrl, "hooks/pre-receive");
  writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  assert.throws(() => f.sync(), /Git push failed/);
  assert.equal(f.git("rev-parse", "HEAD"), before);
  assert.equal(f.remoteHead(), "");
  assert.equal(existsSync(join(f.repoDir, ".git/github-progress-sync.lock")), false);
  rmSync(hook);
  assert.equal(f.sync().status, "synced");
});

test("a concurrent remote update is not overwritten by force", (t) => {
  const f = fixture(t);
  const first = f.sync();
  f.write("app/page.ts", "export const value = 4;\n");
  const tree = f.git("rev-parse", `${first.commit}^{tree}`);
  const concurrent = f.git(`--git-dir=${f.remoteUrl}`, "-c", "user.name=Sync Test", "-c", "user.email=sync-test@example.com", "commit-tree", tree, "-p", first.commit, "-m", "Concurrent snapshot");
  const hook = join(f.repoDir, ".git/hooks/pre-push");
  const quotedRemote = `'${f.remoteUrl.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`;
  writeFileSync(hook, `#!/bin/sh\ngit --git-dir=${quotedRemote} update-ref refs/heads/sync/project-progress ${concurrent}\n`, { mode: 0o755 });
  assert.throws(() => f.sync(), /Git push failed/);
  assert.equal(f.remoteHead(), concurrent);
  rmSync(hook);
  const retry = f.sync();
  assert.equal(retry.status, "synced");
  assert.equal(f.git("rev-parse", `${retry.commit}^`), concurrent);
});
