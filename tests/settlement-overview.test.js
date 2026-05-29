import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RESOURCES, TOP_HUD_RESOURCE_IDS, BUILDINGS } from "../src/games/settlement/gameData.js";
import { productionFrom, useSettlementStore } from "../src/games/settlement/useSettlementStore.js";

function startingLevels() {
  return Object.fromEntries(BUILDINGS.map((building) => [building.id, building.level]));
}

describe("Settlement overview screen contract", () => {
  it("opens map-first on the village overview with the mockup-aligned starting settlement state", () => {
    const state = useSettlementStore.getState();

    assert.equal(state.activePanel, "overview");
    assert.equal(state.rightPanelOpen, false);
    assert.equal(state.selectedBuildingId, "hearth-hall");
    assert.equal(state.population, 520);
    assert.deepEqual(
      {
        food: Math.floor(state.resources.food),
        wood: Math.floor(state.resources.wood),
        stone: Math.floor(state.resources.stone),
        goods: Math.floor(state.resources.goods),
        culture: Math.floor(state.resources.culture),
        gold: Math.floor(state.resources.gold),
        gems: Math.floor(state.resources.gems),
        prestige: Math.floor(state.resources.prestige),
        morale: Math.floor(state.resources.morale),
      },
      {
        food: 1240,
        wood: 850,
        stone: 670,
        goods: 410,
        culture: 310,
        gold: 2450,
        gems: 560,
        prestige: 885,
        morale: 78,
      }
    );
  });

  it("keeps the full resource catalog available for the warehouse", () => {
    assert.deepEqual(
      RESOURCES.map((resource) => resource.id),
      ["population", "food", "wood", "stone", "goods", "culture", "gold", "gems", "prestige"]
    );
  });

  it("limits the top HUD to a stable core resource set", () => {
    assert.deepEqual(
      TOP_HUD_RESOURCE_IDS,
      ["population", "food", "wood", "stone", "gold", "gems"]
    );
  });

  it("derives passive income values shown by the overview panel from building production", () => {
    const perMinute = productionFrom(startingLevels());
    const perHour = Object.fromEntries(
      ["food", "wood", "stone", "goods", "culture", "gold"].map((key) => [
        key,
        Math.round((perMinute[key] ?? 0) * 60),
      ])
    );

    assert.deepEqual(perHour, {
      food: 62,
      wood: 47,
      stone: 32,
      goods: 18,
      culture: 15,
      gold: 28,
    });
  });
});
