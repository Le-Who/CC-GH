import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import { BUILDINGS } from "../src/games/settlement/gameData.js";
import { upgradeCost, useSettlementStore } from "../src/games/settlement/useSettlementStore.js";

function hearthHall() {
  return BUILDINGS.find((building) => building.id === "hearth-hall");
}

describe("Settlement building detail screen contract", () => {
  beforeEach(() => {
    useSettlementStore.getState().resetSettlement();
  });

  it("models the selected Hearth Hall detail values from the second mockup", () => {
    const building = hearthHall();

    assert.ok(building);
    assert.equal(building.name, "Очажный зал");
    assert.equal(building.level, 3);
    assert.equal(building.max, 12);
    assert.deepEqual(building.detail.levelProgress, { current: 320, max: 900 });
    assert.deepEqual(building.detail.productionPerMinute, {
      food: 12.4,
      wood: 9.6,
      stone: 6.2,
      culture: 3.1,
    });
    assert.deepEqual(upgradeCost(building, 3), {
      wood: 600,
      stone: 450,
      gold: 1200,
    });
    assert.equal(building.detail.upgradeDurationMs, 630000);
    assert.deepEqual(building.detail.benefits, {
      passiveGoldPerMinute: 48,
      morale: 8,
    });
  });

  it("selects a building into the building panel and starts a timed upgrade without immediately changing the level", () => {
    const state = useSettlementStore.getState();
    state.selectBuilding("hearth-hall");

    assert.equal(useSettlementStore.getState().activePanel, "build");
    assert.equal(useSettlementStore.getState().selectedBuildingId, "hearth-hall");

    const started = useSettlementStore.getState().upgradeBuilding("hearth-hall");
    const next = useSettlementStore.getState();

    assert.equal(started, true);
    assert.equal(next.activePanel, "build");
    assert.equal(next.levels["hearth-hall"], 3);
    assert.equal(next.activeUpgrade.buildingId, "hearth-hall");
    assert.equal(next.activeUpgrade.fromLevel, 3);
    assert.equal(next.activeUpgrade.toLevel, 4);
    assert.equal(next.activeUpgrade.durationMs, 630000);
    assert.equal(next.resources.wood, 850);
    assert.equal(next.resources.stone, 670);
    assert.equal(next.resources.gold, 2450);
    assert.equal(next.notices[0].type, "upgrade");
    assert.equal(next.notices[0].text, "Очажный зал: улучшение начато");
  });

  it("closes the right panel without replacing the selected building screen with overview", () => {
    const state = useSettlementStore.getState();
    state.selectBuilding("hearth-hall");

    useSettlementStore.getState().closePanel();
    const closed = useSettlementStore.getState();

    assert.equal(closed.rightPanelOpen, false);
    assert.equal(closed.activePanel, "build");
    assert.equal(closed.selectedBuildingId, "hearth-hall");

    closed.setPanel("goals");
    const reopened = useSettlementStore.getState();
    assert.equal(reopened.rightPanelOpen, true);
    assert.equal(reopened.activePanel, "goals");
  });
});
