import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import { COUNCIL_PANEL_DATA, INVENTORY_PANEL_DATA, RESEARCH_PANEL_DATA } from "../src/games/settlement/gameData.js";
import { useSettlementStore } from "../src/games/settlement/useSettlementStore.js";

describe("Settlement inventory and council screen contract", () => {
  beforeEach(() => {
    useSettlementStore.getState().resetSettlement();
  });

  it("models the inventory panel values from the fourth mockup", () => {
    assert.deepEqual(
      INVENTORY_PANEL_DATA.resourceRows.map((row) => ({
        id: row.id,
        label: row.label,
        initialCap: row.initialCap,
        step: row.step,
        boostStep: row.boostStep,
        minCap: row.minCap,
        maxCap: row.maxCap,
      })),
      [
        { id: "food", label: "Еда", initialCap: 10000, step: 500, boostStep: 1000, minCap: 5000, maxCap: 20000 },
        { id: "wood", label: "Дерево", initialCap: 10000, step: 500, boostStep: 1000, minCap: 5000, maxCap: 20000 },
        { id: "stone", label: "Камень", initialCap: 10000, step: 500, boostStep: 1000, minCap: 5000, maxCap: 20000 },
        { id: "goods", label: "Товары", initialCap: 10000, step: 500, boostStep: 1000, minCap: 5000, maxCap: 20000 },
        { id: "gold", label: "Золото", initialCap: 20000, step: 1000, boostStep: 2000, minCap: 10000, maxCap: 40000 },
        { id: "culture", label: "Культура", initialCap: 5000, step: 500, boostStep: 1000, minCap: 2500, maxCap: 10000 },
        { id: "gems", label: "Кристаллы", initialCap: 5000, step: 500, boostStep: 1000, minCap: 2500, maxCap: 10000 },
        { id: "prestige", label: "Престиж", initialCap: 5000, step: 500, boostStep: 1000, minCap: 2500, maxCap: 10000 },
      ]
    );

    assert.deepEqual(
      INVENTORY_PANEL_DATA.specialItems.map((item) => ({ id: item.id, title: item.title, amount: item.amount, icon: item.icon })),
      [
        { id: "settlement-cart", title: "Транспортный сундук", amount: 12, icon: "starterPack" },
        { id: "warehouse-barrel", title: "Бочка хранения", amount: 8, icon: "inventory" },
        { id: "sealed-scroll", title: "Опечатанный свиток", amount: 6, icon: "quest" },
        { id: "navigation-compass", title: "Навигационный компас", amount: 3, icon: "world" },
        { id: "reward-medallion", title: "Памятный знак", amount: 2, icon: "achievement" },
      ]
    );

    const state = useSettlementStore.getState();
    assert.deepEqual(
      Object.fromEntries(INVENTORY_PANEL_DATA.resourceRows.map((row) => [row.id, state.inventoryCaps[row.id]])),
      {
        food: 10000,
        wood: 10000,
        stone: 10000,
        goods: 10000,
        gold: 20000,
        culture: 5000,
        gems: 5000,
        prestige: 5000,
      }
    );
    assert.equal(state.inventorySelectedResourceId, null);
  });

  it("clamps inventory capacity changes and trims stored resources to the selected cap", () => {
    useSettlementStore.setState((state) => ({
      resources: { ...state.resources, food: 11800 },
      inventoryCaps: { ...state.inventoryCaps, food: 10000 },
    }));

    useSettlementStore.getState().adjustInventoryCap("food", -10000);
    const afterClamp = useSettlementStore.getState();

    assert.equal(afterClamp.inventorySelectedResourceId, "food");
    assert.equal(afterClamp.inventoryCaps.food, 5000);
    assert.equal(afterClamp.resources.food, 5000);
    assert.match(afterClamp.notices[0].key, /^inventory:cap:food:5000/);

    afterClamp.boostInventoryCap("food");
    const afterBoost = useSettlementStore.getState();

    assert.equal(afterBoost.inventoryCaps.food, 6000);
    assert.equal(afterBoost.inventorySelectedResourceId, "food");
  });

  it("models the council panel values and keeps the right panel routing live", () => {
    assert.deepEqual(
      COUNCIL_PANEL_DATA.stage,
      {
        title: "Устойчивая деревня",
        phaseLabel: "Этап 3 из 5",
        progress: { current: 1850, max: 2500 },
        description: "Развивайте поселение, выполняя цели и следуя советам.",
      }
    );

    assert.deepEqual(
      COUNCIL_PANEL_DATA.recommendations.map((item) => ({
        id: item.id,
        title: item.title,
        icon: item.icon,
        portrait: item.portrait,
        actionKind: item.action.kind,
        actionTarget: item.action.buildingId ?? item.action.panel,
      })),
      [
        { id: "upgrade-lumber-camp", title: "Улучшите лесопилку до ур. 3", icon: "wood", portrait: "elder", actionKind: "building", actionTarget: "lumber-camp" },
        { id: "increase-food", title: "Увеличьте производство еды", icon: "food", portrait: "keeper", actionKind: "building", actionTarget: "common-garden" },
        { id: "strengthen-defense", title: "Укрепите оборону", icon: "stone", portrait: "guard", actionKind: "panel", actionTarget: "construction" },
      ]
    );

    assert.deepEqual(
      COUNCIL_PANEL_DATA.buildPriorities.map((item) => ({
        id: item.id,
        title: item.title,
        priority: item.priority,
        trend: item.trend,
        icon: item.icon,
      })),
      [
        { id: "lumber-camp", title: "Лесопилка ур. 3", priority: "Высокий приоритет", trend: "up", icon: "wood" },
        { id: "common-garden", title: "Ферма", priority: "Средний приоритет", trend: "flat", icon: "food" },
        { id: "watchtower", title: "Сторожевая башня", priority: "Средний приоритет", trend: "flat", icon: "stone" },
      ]
    );

    const state = useSettlementStore.getState();
    state.setPanel("council");
    assert.equal(useSettlementStore.getState().activePanel, "council");
    assert.equal(useSettlementStore.getState().rightPanelOpen, true);

    state.selectBuilding("lumber-camp");
    const buildingState = useSettlementStore.getState();
    assert.equal(buildingState.activePanel, "build");
    assert.equal(buildingState.selectedBuildingId, "lumber-camp");

    buildingState.setPanel("research");
    const researchState = useSettlementStore.getState();
    assert.equal(researchState.activePanel, "research");
    assert.equal(researchState.rightPanelOpen, true);

    researchState.closePanel();
    const closedState = useSettlementStore.getState();
    assert.equal(closedState.rightPanelOpen, false);
    assert.equal(closedState.activePanel, "research");
  });

  it("models the research tree values from the seventh mockup", () => {
    assert.deepEqual(
      RESEARCH_PANEL_DATA.categories.map((category) => ({ id: category.id, label: category.label, defaultNodeId: category.defaultNodeId })),
      [
        { id: "farming", label: "Хозяйство", defaultNodeId: "stone-masonry" },
        { id: "trade", label: "Торговля", defaultNodeId: "trade-routes" },
        { id: "culture", label: "Культура", defaultNodeId: "civic-chronicles" },
      ]
    );

    const farmingNodes = RESEARCH_PANEL_DATA.nodes.filter((node) => node.category === "farming");
    assert.equal(farmingNodes.length, 9);
    assert.deepEqual(
      farmingNodes.map((node) => ({ id: node.id, title: node.title, level: node.level, maxLevel: node.maxLevel, state: node.initialState })),
      [
        { id: "improved-fields", title: "Улучшенные поля", level: 3, maxLevel: 5, state: "complete" },
        { id: "irrigation", title: "Ирригация", level: 2, maxLevel: 3, state: "complete" },
        { id: "fertile-soils", title: "Плодородие почв", level: 0, maxLevel: 3, state: "locked" },
        { id: "lumber-processing", title: "Лесопиление", level: 3, maxLevel: 5, state: "complete" },
        { id: "stone-masonry", title: "Каменная кладка", level: 1, maxLevel: 3, state: "available" },
        { id: "improved-tools", title: "Улучшенные инструменты", level: 0, maxLevel: 3, state: "locked" },
        { id: "storage-yards", title: "Хранилища", level: 2, maxLevel: 3, state: "complete" },
        { id: "resource-management", title: "Управление ресурсами", level: 1, maxLevel: 3, state: "available" },
        { id: "farming-mastery", title: "Мастерство земледелия", level: 0, maxLevel: 3, state: "locked" },
      ]
    );

    const masonry = farmingNodes.find((node) => node.id === "stone-masonry");
    assert.deepEqual(masonry.progress, { current: 150, max: 250, type: "gems" });
    assert.deepEqual(masonry.cost, { wood: 250, stone: 250, culture: 50 });
    assert.equal(masonry.durationMs, 900000);
    assert.deepEqual(masonry.benefits, ["+10% к прочности зданий", "+1 к вместимости Каменоломни"]);

    const state = useSettlementStore.getState();
    assert.equal(state.researchCategoryId, "farming");
    assert.equal(state.selectedResearchId, "stone-masonry");
    assert.equal(state.researchLevels["stone-masonry"], 1);
    assert.equal(state.activeResearch, null);
  });

  it("keeps research interactions in the research panel and completes the study timer", () => {
    const state = useSettlementStore.getState();
    state.setPanel("research");
    assert.equal(useSettlementStore.getState().activePanel, "research");
    assert.equal(useSettlementStore.getState().rightPanelOpen, true);

    useSettlementStore.getState().setResearchCategory("trade");
    assert.equal(useSettlementStore.getState().researchCategoryId, "trade");
    assert.equal(useSettlementStore.getState().selectedResearchId, "trade-routes");

    useSettlementStore.getState().setResearchCategory("farming");
    useSettlementStore.getState().selectResearchNode("stone-masonry");
    const before = useSettlementStore.getState();
    const started = before.studySelectedResearch();
    const active = useSettlementStore.getState();

    assert.equal(started, true);
    assert.equal(active.activePanel, "research");
    assert.equal(active.rightPanelOpen, true);
    assert.equal(active.activeResearch.nodeId, "stone-masonry");
    assert.equal(active.resources.wood, before.resources.wood - 250);
    assert.equal(active.resources.stone, before.resources.stone - 250);
    assert.equal(active.resources.culture, before.resources.culture - 50);

    active.closePanel();
    assert.equal(useSettlementStore.getState().rightPanelOpen, false);
    assert.equal(useSettlementStore.getState().activePanel, "research");

    useSettlementStore.setState((current) => ({
      activeResearch: { ...current.activeResearch, completesAt: Date.now() - 1 },
      lastTick: Date.now() - 1000,
    }));
    useSettlementStore.getState().tick();
    const completed = useSettlementStore.getState();

    assert.equal(completed.activeResearch, null);
    assert.equal(completed.researchLevels["stone-masonry"], 2);
    assert.match(completed.notices[0].key, /^research:complete:stone-masonry:2/);
  });
});
