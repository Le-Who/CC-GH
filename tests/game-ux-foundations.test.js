import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GAME_REGISTRY, PIXI_GAME_IDS, VISIBLE_GAME_IDS } from "../src/app/gameRegistry.js";
import { buildGameHudDescriptors } from "../src/app/useGameHudDescriptors.js";
import { createClientActionId, shouldUseDurableOutbox } from "../src/game-state/reliableActions.js";
import { selectMatch3InitialRun } from "../src/games/match3/selectMatch3Run.js";
import { deriveServerNow } from "../src/games/merge/useServerClock.js";
import { getQuestionTiming } from "../src/games/trivia/useQuestionTimer.js";

describe("Telegram Mini App game UX foundations", () => {
  it("keeps Farm registered for runtime compatibility but hidden from navigation", () => {
    assert.equal(GAME_REGISTRY.farm.visible, false);
    assert.equal(GAME_REGISTRY.farm.pixiScene, true);
    assert.ok(!VISIBLE_GAME_IDS.includes("farm"));
    assert.ok(PIXI_GAME_IDS.includes("farm"));
  });

  it("separates durable outbox actions from receipt-only gameplay actions", () => {
    assert.equal(shouldUseDurableOutbox("yard.collectGifts"), true);
    assert.equal(shouldUseDurableOutbox("garden.levelUp"), true);
    assert.equal(shouldUseDurableOutbox("blox.place"), false);

    const id = createClientActionId("blox.place", "blox", ["piece 1", "0:2"]);
    assert.match(id, /^blox:/);
    assert.ok(id.includes("blox-place"));
    assert.ok(!id.includes("piece 1"));
  });

  it("uses semantic game HUD descriptors instead of generic currency chips", () => {
    const descriptors = buildGameHudDescriptors("merge", {
      merge: { alchemyEssence: 12, freeTapCharges: 3 },
      farm: { harvested: { carrot: 2, wheat: 4 } },
      resources: {},
    });

    assert.deepEqual(descriptors.map((item) => item.id), ["essence", "freeTaps", "fuel"]);
    assert.deepEqual(descriptors.map((item) => item.value), [12, 3, 6]);
  });

  it("builds active-game HUD descriptors when shell-local state is not available yet", () => {
    const descriptors = buildGameHudDescriptors("bubbo", {
      bubbo: { currentGame: { score: 70, shotsLeft: 8, pressureLabel: "Danger" } },
      resources: {},
    }, null);

    assert.deepEqual(descriptors.map((item) => item.id), ["score", "shots", "pressure"]);
    assert.deepEqual(descriptors.map((item) => item.value), [70, 8, "Danger"]);
  });

  it("restores Match-3 runs from snapshot currentGame before creating defaults", () => {
    const restored = selectMatch3InitialRun({
      match3: {
        currentGame: {
          board: [["fire", "water"]],
          score: 42,
          movesLeft: 9,
          combo: 2,
          mode: "timed",
        },
      },
    }, () => ({ board: [["fallback"]], score: 0, movesLeft: 30, combo: 0, mode: "classic" }));

    assert.equal(restored.restored, true);
    assert.equal(restored.mode, "timed");
    assert.equal(restored.score, 42);
    assert.deepEqual(restored.board, [["fire", "water"]]);
  });

  it("derives server clock and question timing from real elapsed time", () => {
    assert.equal(deriveServerNow({ serverTime: 1000, receivedAt: 900 }, 1400), 1500);
    const timing = getQuestionTiming(10_000, 12_450, 15_000);
    assert.equal(timing.timeMs, 2450);
    assert.equal(timing.remainingMs, 12_550);
    assert.ok(timing.progress < 1 && timing.progress > 0.8);
  });
});
