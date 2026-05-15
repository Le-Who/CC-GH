import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import { WORLD_MAP_PANEL_DATA } from "../src/games/settlement/gameData.js";
import { useSettlementStore } from "../src/games/settlement/useSettlementStore.js";

describe("Settlement world map screen contract", () => {
  beforeEach(() => {
    useSettlementStore.getState().resetSettlement();
  });

  it("models the world map filters and expeditions from the eighth mockup", () => {
    assert.deepEqual(
      WORLD_MAP_PANEL_DATA.filters.map((filter) => ({ id: filter.id, label: filter.label, icon: filter.icon })),
      [
        { id: "all", label: "Все", icon: "world" },
        { id: "nature", label: "Леса", icon: "wood" },
        { id: "ruins", label: "Руины", icon: "gems" },
        { id: "danger", label: "Опасно", icon: "prestige" },
      ]
    );

    assert.deepEqual(
      WORLD_MAP_PANEL_DATA.expeditions.map((expedition) => ({
        id: expedition.id,
        title: expedition.title,
        category: expedition.category,
        difficulty: expedition.difficulty,
        rewards: expedition.rewards,
        unlocked: expedition.unlocked,
      })),
      [
        { id: "ancient-forest", title: "Древний лес", category: "nature", difficulty: "Лёгкая", rewards: { wood: 400, food: 200, gems: 1 }, unlocked: true },
        { id: "drowned-ruins", title: "Затонувшие руины", category: "ruins", difficulty: "Средняя", rewards: { stone: 600, gold: 300, gems: 1 }, unlocked: true },
        { id: "volcanic-mountains", title: "Вулканические горы", category: "danger", difficulty: "Сложная", rewards: { stone: 800, gold: 400, prestige: 2 }, unlocked: true },
        { id: "ice-wastes", title: "Ледяные пустоши", category: "danger", difficulty: "Закрыто", rewards: { gems: 2, culture: 240, prestige: 4 }, unlocked: false },
      ]
    );

    assert.deepEqual(
      WORLD_MAP_PANEL_DATA.mapMarkers.map((marker) => ({ id: marker.id, expeditionId: marker.expeditionId, tone: marker.tone })),
      [
        { id: "marker-forest", expeditionId: "ancient-forest", tone: "forest" },
        { id: "marker-ruins", expeditionId: "drowned-ruins", tone: "ruins" },
        { id: "marker-volcano", expeditionId: "volcanic-mountains", tone: "danger" },
        { id: "marker-ice", expeditionId: "ice-wastes", tone: "locked" },
      ]
    );
  });

  it("keeps world map selection and filters inside the right panel route", () => {
    const state = useSettlementStore.getState();
    state.setPanel("world");

    assert.equal(useSettlementStore.getState().activePanel, "world");
    assert.equal(useSettlementStore.getState().rightPanelOpen, true);
    assert.equal(useSettlementStore.getState().worldMapFilterId, "all");
    assert.equal(useSettlementStore.getState().selectedExpeditionId, "ancient-forest");

    useSettlementStore.getState().setWorldMapFilter("ruins");
    assert.equal(useSettlementStore.getState().worldMapFilterId, "ruins");
    assert.equal(useSettlementStore.getState().selectedExpeditionId, "drowned-ruins");

    useSettlementStore.getState().selectExpedition("volcanic-mountains");
    const selected = useSettlementStore.getState();
    assert.equal(selected.activePanel, "world");
    assert.equal(selected.rightPanelOpen, true);
    assert.equal(selected.worldMapFilterId, "all");
    assert.equal(selected.selectedExpeditionId, "volcanic-mountains");

    selected.closePanel();
    const closed = useSettlementStore.getState();
    assert.equal(closed.rightPanelOpen, false);
    assert.equal(closed.activePanel, "world");
  });

  it("starts one expedition, blocks locked routes, and grants rewards on completion", () => {
    useSettlementStore.getState().setPanel("world");
    useSettlementStore.getState().selectExpedition("ice-wastes");
    assert.equal(useSettlementStore.getState().startSelectedExpedition(), false);
    assert.equal(useSettlementStore.getState().activeExpedition, null);
    assert.match(useSettlementStore.getState().notices[0].key, /^expedition:locked:ice-wastes/);

    useSettlementStore.getState().selectExpedition("volcanic-mountains");
    const beforeStart = useSettlementStore.getState();
    const started = beforeStart.startSelectedExpedition();
    const active = useSettlementStore.getState();

    assert.equal(started, true);
    assert.equal(active.activePanel, "world");
    assert.equal(active.rightPanelOpen, true);
    assert.equal(active.activeExpedition.expeditionId, "volcanic-mountains");
    assert.equal(active.resources.stone, beforeStart.resources.stone);
    assert.equal(active.resources.gold, beforeStart.resources.gold);

    active.selectExpedition("ancient-forest");
    assert.equal(useSettlementStore.getState().startSelectedExpedition(), false);
    assert.match(useSettlementStore.getState().notices[0].key, /^expedition:busy:volcanic-mountains/);

    const beforeComplete = useSettlementStore.getState();
    useSettlementStore.setState((current) => ({
      activeExpedition: { ...current.activeExpedition, completesAt: Date.now() - 1 },
      lastTick: Date.now() - 1000,
    }));
    useSettlementStore.getState().tick();
    const completed = useSettlementStore.getState();

    assert.equal(completed.activeExpedition, null);
    assert.ok(completed.resources.stone >= beforeComplete.resources.stone + 800);
    assert.ok(completed.resources.gold >= beforeComplete.resources.gold + 400);
    assert.ok(completed.resources.prestige >= beforeComplete.resources.prestige + 2);
    assert.match(completed.notices[0].key, /^expedition:complete:volcanic-mountains/);
  });
});
