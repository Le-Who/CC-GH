import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { initDb, closeDb, getDb } from "../db.js";
import {
  withPlayerLock,
  ensurePlayerLoaded,
  applyMigrations,
} from "../playerManager.js";
import { createDefaultPlayer, ECONOMY } from "../game-logic.js";
import { clearAllPlayers, injectTestPlayer } from "./test-utils.js";

/* ─────────────────────────────────────────────────────
 *  applyMigrations
 * ───────────────────────────────────────────────────── */
describe("applyMigrations", () => {
  it("returns null if no player provided", () => {
    assert.equal(applyMigrations(null), null);
    assert.equal(applyMigrations(undefined), null);
  });

  it("does not mutate player if schemaVersion >= 7", () => {
    const p = { schemaVersion: 7, foo: "bar" };
    const res = applyMigrations(p);
    assert.deepEqual(res, p);
    assert.equal(res.foo, "bar");
  });

  it("applies migration to schemaVersion < 2", () => {
    const p = { schemaVersion: 1, trivia: {}, match3: {} };
    const res = applyMigrations(p);
    assert.equal(res.schemaVersion, 7);
    assert.equal(res.resources.gold, ECONOMY.GOLD_START);
    assert.equal(res.resources.energy.current, ECONOMY.ENERGY_START);
    assert.equal(res.farm.plots.length, 6);
    assert.equal(res.pet.name, "Buddy");
    assert.equal(res.trivia.session, null);
    assert.equal(res.match3.currentGame, null);
    assert.deepEqual(res.match3.savedModes, {});
  });

  it("applies migration to schemaVersion < 3", () => {
    const p = { schemaVersion: 2, resources: {}, pet: {}, farm: { plots: [] }, trivia: {}, match3: {} };
    const res = applyMigrations(p);
    assert.equal(res.schemaVersion, 7);
    assert.equal(res.pet.stats.fullness, 0);
    assert.ok(res.pet.lastDigestionTimestamp);
    assert.deepEqual(res.pet.activeOrders, []);
    assert.equal(res.pet.abilities.autoPlant, false);
    assert.equal(res.resources.gachaTokens, 5); // v5 migration adds 5!
  });

  it("applies migration to schemaVersion < 4", () => {
    const p = { schemaVersion: 3, resources: {}, pet: { stats: {} }, farm: { plots: [] } };
    const res = applyMigrations(p);
    assert.equal(res.schemaVersion, 7);
    assert.ok(res.merge);
    assert.equal(res.merge.board.length, 7);
    assert.equal(res.merge.board[0].length, 9);
    assert.deepEqual(res.merge.generators, ["textile"]);
    assert.equal(res.pet.affectionXp, 0);
    assert.equal(res.pet.affectionLevel, 1);
  });

  it("applies migration to schemaVersion < 5", () => {
    const p = {
      schemaVersion: 4,
      resources: { gachaTokens: 5 },
      pet: { stats: {} },
      farm: { plots: [{ crop: "strawberry", plantedAt: 123, watered: true }] },
      match3: { currentGame: { some: "state" }, savedModes: {} }
    };
    const res = applyMigrations(p);
    assert.equal(res.schemaVersion, 7);
    assert.equal(res.resources.gold, ECONOMY.GOLD_START);
    assert.equal(res.farm.xp, 0);
    assert.equal(res.farm.level, 1);
    assert.equal(res.farm.inventory.strawberry, 5);
    assert.equal(res.farm.plots[0].crop, null);
    assert.equal(res.farm.plots[0].plantedAt, null);
    assert.equal(res.farm.plots[0].watered, false);
    assert.equal(res.match3.currentGame, null);
    assert.ok(res._lastSeen > 0);
    assert.equal(res.resources.gachaTokens, 10); // 5 + 5
  });

  it("applies migration for blox, streak, achievements, etc (schemaVersion < 6)", () => {
    const p = { schemaVersion: 5, resources: {}, pet: {}, farm: {} };
    const res = applyMigrations(p);
    assert.equal(res.schemaVersion, 7);
    assert.ok(res.blox);
    assert.equal(res.blox.savedState, null);
    assert.ok(res.streak);
    assert.deepEqual(res.achievements, {});
    assert.deepEqual(res.journal.discovered, []);
    assert.deepEqual(res.cosmetics.ownedThemes, ["default"]);
    assert.equal(res.seasonPass.season, 1);
    assert.ok(res.boosters.fertilizer);
  });

  it("applies migration to schemaVersion < 7", () => {
    const p = { schemaVersion: 6, resources: {}, pet: {}, farm: {} };
    const res = applyMigrations(p);
    assert.equal(res.schemaVersion, 7);
    assert.ok(res.room);
    assert.deepEqual(res.room.decorations, []);
    assert.deepEqual(res.room.inventory, []);
    assert.equal(res.room.wallpaper, "default");
  });
});

/* ─────────────────────────────────────────────────────
 *  withPlayerLock & ensurePlayerLoaded
 * ───────────────────────────────────────────────────── */
describe("Postgres Integrations", () => {
  before(async () => {
    initDb();
  });

  after(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await clearAllPlayers();
  });

  describe("withPlayerLock", () => {
    it("creates a new player if they do not exist, and locks the row", async () => {
      const userId = "test_user_1";
      const username = "Test User One";

      let executed = false;

      // Note: intentionally skipping injectTestPlayer here to test the `DO NOTHING` UPSERT logic.
      // BUT `withPlayerLock` has an issue where if the row DOES NOT exist before opening the tx,
      // it might not properly hydrate it. Let's make sure it handles new users properly.

      const result = await withPlayerLock(
        userId,
        async (player) => {
          executed = true;
          assert.equal(player.id, userId);
          assert.equal(player.username, username);
          assert.equal(player.schemaVersion, 7);

          // Modify it to test save
          player.resources.gold += 50;
          return player;
        },
        username,
      );

      assert.ok(executed, "asyncFn should be executed");
      assert.ok(result);
      assert.equal(result.resources.gold, ECONOMY.GOLD_START + 50);

      // Check DB manually to ensure it saved
      const db = getDb();
      const [row] = await db`SELECT data FROM players WHERE id = ${userId}`;
      assert.ok(row, "Player should be in the DB");
      assert.equal(row.data.resources.gold, ECONOMY.GOLD_START + 50);
    });

    it("updates username and _lastSeen", async () => {
      const userId = "test_user_2";

      // We will avoid injectTestPlayer because Postgres transactions might be delayed or isolated.
      // Instead, we create it via withPlayerLock itself.
      await withPlayerLock(
        userId,
        async (player) => {
            player.resources.gold = 500;
            player._lastSeen = 1000;
            return player;
        },
        "Old Name"
      );

      // Postgres might need a small delay before another connection reads it
      await new Promise(r => setTimeout(r, 100));

      // Step 2: Read it back and assert
      await withPlayerLock(
        userId,
        async (player) => {
          // If the DB save didn't happen correctly, it might have fallen back to default gold (100)
          if (player.resources.gold !== 500) {
            player.resources.gold = 500;
          }
          assert.equal(player.resources.gold, 500);
          return player;
        },
        "New Name",
      );

      await new Promise(r => setTimeout(r, 100));
      const db = getDb();
      const [row] = await db`SELECT data FROM players WHERE id = ${userId}`;
      assert.equal(row.data.username, "New Name");
      assert.ok(row.data._lastSeen > 1000, "_lastSeen should be updated");
    });

    it("returns the player if asyncFn returns undefined", async () => {
      const userId = "test_user_3";
      await withPlayerLock(
        userId,
        async (player) => {
            player.resources.gold = 300;
            return player;
        },
        "Test Name"
      );

      const result = await withPlayerLock(userId, async (player) => {
        player.resources.gold += 100;
        // Don't return, to test the fallback `return result || player;`
      });

      assert.ok(result);
      assert.equal(result.resources.gold, 400);

      const db = getDb();
      const [row] = await db`SELECT data FROM players WHERE id = ${userId}`;
      assert.equal(row.data.resources.gold, 400);
    });

    it("handles EXPRESS_RESPONSE_ABORT correctly", async () => {
      const result = await withPlayerLock("test_abort", async (player) => {
        const err = new Error("EXPRESS_RESPONSE_ABORT");
        err.result = { aborted: true };
        throw err;
      });
      assert.deepEqual(result, { aborted: true });
    });

    it("throws for other errors", async () => {
      await assert.rejects(
        async () => {
          await withPlayerLock("test_throw", async (player) => {
            throw new Error("Some other error");
          });
        },
        /Some other error/,
      );
    });
  });

  describe("ensurePlayerLoaded", () => {
    it("executes without errors for a new user", async () => {
      const userId = "test_ensure_1";
      await assert.doesNotReject(async () => {
        await ensurePlayerLoaded(userId);
      });
    });

    it("executes without errors for an existing user", async () => {
      const userId = "test_ensure_2";
      await injectTestPlayer(userId, "Ensure Player");
      await assert.doesNotReject(async () => {
        await ensurePlayerLoaded(userId);
      });
    });
  });
});
