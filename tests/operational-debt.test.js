import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { closeDb } from "../db.js";
import {
  afterPlayerCommit,
  withPlayerLock,
} from "../playerManager.js";
import {
  getMigrationFiles,
  runSqlMigrations,
} from "../db.js";
import { getRedisHealth } from "../redisAdapter.js";
import {
  getPlayerStatsRefreshStatus,
  refreshPlayerStatsView,
  resetPlayerStatsRefreshStatusForTests,
} from "../server.js";

const ORIGINAL_ENV = {
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  REDIS_URL: process.env.REDIS_URL,
};
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function createFakeSql(appliedVersions = []) {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ type: "tag", text, values });
    if (text.startsWith("SELECT version FROM schema_migrations")) {
      return Promise.resolve(appliedVersions.map((version) => ({ version })));
    }
    return Promise.resolve([]);
  };
  sql.begin = async (fn) => fn(sql);
  sql.unsafe = async (query, args = [], options = {}) => {
    calls.push({ type: "unsafe", query, args, options });
    return [];
  };
  return { sql, calls };
}

function withPlayerLockBodies(source) {
  const bodies = [];
  let cursor = 0;
  while (cursor < source.length) {
    const lockIndex = source.indexOf("withPlayerLock(", cursor);
    if (lockIndex < 0) break;
    const arrowIndex = source.indexOf("=>", lockIndex);
    const openIndex = source.indexOf("{", arrowIndex);
    if (arrowIndex < 0 || openIndex < 0) break;
    let depth = 0;
    let endIndex = openIndex;
    for (; endIndex < source.length; endIndex += 1) {
      const char = source[endIndex];
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    bodies.push(source.slice(openIndex + 1, endIndex));
    cursor = endIndex + 1;
  }
  return bodies;
}

describe("SQL migration runner", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccgh-migrations-"));
  });

  it("discovers ordered .sql migration files with numeric versions", async () => {
    await fs.writeFile(path.join(tmpDir, "002_second.sql"), "SELECT 2;");
    await fs.writeFile(path.join(tmpDir, "notes.sql"), "SELECT 'skip';");
    await fs.writeFile(path.join(tmpDir, "001_first.sql"), "SELECT 1;");

    const files = getMigrationFiles(tmpDir);

    assert.deepEqual(files.map((file) => file.name), ["001_first.sql", "002_second.sql"]);
    assert.deepEqual(files.map((file) => file.version), ["001", "002"]);
  });

  it("runs unapplied migrations once and records them in schema_migrations", async () => {
    await fs.writeFile(path.join(tmpDir, "001_accounts.sql"), "BEGIN;\nCREATE TABLE accounts(id text);\nCOMMIT;\n");
    await fs.writeFile(path.join(tmpDir, "002_events.sql"), "CREATE TABLE player_events(id bigint);");
    const { sql, calls } = createFakeSql(["001"]);

    const applied = await runSqlMigrations(sql, {
      migrationsDir: tmpDir,
      logger: { log() {} },
    });

    assert.deepEqual(applied.map((migration) => migration.version), ["002"]);
    assert.equal(calls.filter((call) => call.type === "unsafe").length, 1);
    assert.match(calls.find((call) => call.type === "unsafe").query, /CREATE TABLE player_events/);
    assert.equal(calls.find((call) => call.type === "unsafe").options.simple, true);
    assert.ok(calls.some((call) => call.type === "tag" && call.text.startsWith("INSERT INTO schema_migrations")));
  });

  it("keeps complete SQL bootstrap history in numbered migrations", async () => {
    const migrationDir = path.join(REPO_ROOT, "migrations");
    const files = getMigrationFiles(migrationDir);
    const combinedSql = (await Promise.all(
      files.map((file) => fs.readFile(file.path, "utf-8")),
    )).join("\n");

    assert.ok(files.length >= 2, "SQL bootstrap should be split into ordered numbered migrations");
    assert.match(combinedSql, /CREATE TABLE IF NOT EXISTS players/i);
    assert.match(combinedSql, /CREATE TABLE IF NOT EXISTS accounts/i);
    assert.match(combinedSql, /CREATE TABLE IF NOT EXISTS account_identities/i);
    assert.match(combinedSql, /CREATE TABLE IF NOT EXISTS player_events/i);
    assert.match(combinedSql, /CREATE MATERIALIZED VIEW IF NOT EXISTS player_stats_view/i);
  });
});

describe("route mutation response boundaries", () => {
  it("does not write Express responses inside withPlayerLock callbacks", async () => {
    const routesDir = path.join(REPO_ROOT, "routes");
    const files = (await fs.readdir(routesDir))
      .filter((name) => name.endsWith(".js"))
      .map((name) => path.join(routesDir, name));
    const offenders = [];

    for (const file of files) {
      const source = await fs.readFile(file, "utf-8");
      const bodies = withPlayerLockBodies(source);
      bodies.forEach((body, index) => {
        if (/\bres\.(?:json|status|send|sendStatus)\s*\(/.test(body)) {
          offenders.push(`${path.relative(REPO_ROOT, file)}#${index + 1}`);
        }
      });
    }

    assert.deepEqual(offenders, []);
  });
});

describe("player mutation commit hooks", () => {
  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    delete process.env.DATABASE_URL;
    await closeDb();
  });

  afterEach(async () => {
    await closeDb();
    restoreEnv();
  });

  it("runs registered side effects after a successful player save", async () => {
    const committedGold = [];

    const result = await withPlayerLock("commit-hook-user", async (player) => {
      player.resources.gold += 7;
      afterPlayerCommit(player, async (savedPlayer) => {
        committedGold.push(savedPlayer.resources.gold);
      });
      return { gold: player.resources.gold };
    }, "Hook");

    assert.equal(result.gold, 107);
    assert.deepEqual(committedGold, [107]);
  });

  it("does not run registered side effects when the mutation throws", async () => {
    const effects = [];

    await assert.rejects(
      () => withPlayerLock("failed-hook-user", async (player) => {
        afterPlayerCommit(player, async () => effects.push("ran"));
        throw new Error("mutation failed");
      }, "Hook"),
      /mutation failed/,
    );

    assert.deepEqual(effects, []);
  });
});

describe("operational health helpers", () => {
  afterEach(() => {
    resetPlayerStatsRefreshStatusForTests();
    restoreEnv();
  });

  it("reports Redis as disabled, not healthy, when REDIS_URL is absent", async () => {
    delete process.env.REDIS_URL;

    const health = await getRedisHealth();

    assert.deepEqual(health, {
      configured: false,
      connected: false,
      status: "disabled",
      distributedGuarantees: false,
    });
  });

  it("captures materialized-view refresh success and failure for health checks", async () => {
    let refreshes = 0;
    const okSql = async (strings) => {
      assert.match(strings.join(""), /REFRESH MATERIALIZED VIEW CONCURRENTLY player_stats_view/);
      refreshes += 1;
      return [];
    };

    assert.equal(await refreshPlayerStatsView(okSql, 1_800_000_000_000), true);
    assert.equal(refreshes, 1);
    assert.deepEqual(getPlayerStatsRefreshStatus(), {
      lastAttemptAt: "2027-01-15T08:00:00.000Z",
      lastSuccessAt: "2027-01-15T08:00:00.000Z",
      lastError: null,
    });

    const failingSql = async () => {
      throw new Error("refresh timeout");
    };

    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      assert.equal(await refreshPlayerStatsView(failingSql, 1_800_000_060_000), false);
    } finally {
      console.error = originalConsoleError;
    }
    assert.deepEqual(getPlayerStatsRefreshStatus(), {
      lastAttemptAt: "2027-01-15T08:01:00.000Z",
      lastSuccessAt: "2027-01-15T08:00:00.000Z",
      lastError: "refresh timeout",
    });
  });
});
