import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const RUNTIME_COPY_PATHS = [
  "package.json",
  "server.js",
  "game-logic.js",
  "game-logic",
  "db.js",
  "accountManager.js",
  "playerManager.js",
  "socketManager.js",
  "redisAdapter.js",
  "routes",
  "middleware",
  "data",
  "migrations",
  "scripts",
];

test("production Docker runtime copy can import the backend without the src tree", async () => {
  const repoRoot = process.cwd();
  const tempRoot = await mkdtemp(path.join(repoRoot, ".tmp-runtime-copy-"));
  const appRoot = path.join(tempRoot, "app");

  try {
    await mkdir(appRoot, { recursive: true });
    for (const relativePath of RUNTIME_COPY_PATHS) {
      await cp(path.join(repoRoot, relativePath), path.join(appRoot, relativePath), {
        recursive: true,
      });
    }

    await assert.doesNotReject(
      () => import(`${pathToFileURL(path.join(appRoot, "server.js")).href}?runtime-copy=${Date.now()}`),
      /ERR_MODULE_NOT_FOUND/,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
