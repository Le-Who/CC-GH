import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import { CONSTRUCTION_PANEL_DATA } from "../src/games/settlement/gameData.js";
import { useSettlementStore } from "../src/games/settlement/useSettlementStore.js";

describe("Settlement construction screen contract", () => {
  beforeEach(() => {
    useSettlementStore.getState().resetSettlement();
  });

  it("models the construction catalog first page from the sixth mockup", () => {
    assert.equal(CONSTRUCTION_PANEL_DATA.pageSize, 9);
    assert.ok(CONSTRUCTION_PANEL_DATA.placementSlots.length >= 4);
    assert.deepEqual(
      CONSTRUCTION_PANEL_DATA.categories.map((category) => ({ id: category.id, label: category.label, icon: category.icon })),
      [
        { id: "production", label: "Производство", icon: "production" },
        { id: "storage", label: "Хранение", icon: "storage" },
        { id: "decor", label: "Декор", icon: "decor" },
        { id: "special", label: "Особые", icon: "special" },
      ]
    );

    const productionItems = CONSTRUCTION_PANEL_DATA.items.filter((item) => item.category === "production");
    assert.equal(Math.ceil(productionItems.length / CONSTRUCTION_PANEL_DATA.pageSize), 2);
    assert.deepEqual(
      productionItems.slice(0, 9).map((item) => ({ id: item.id, name: item.name, cost: item.cost })),
      [
        { id: "sawmill", name: "Лесопилка", cost: { wood: 150, stone: 80 } },
        { id: "stonecutters-yard", name: "Каменоломня", cost: { wood: 180, stone: 100 } },
        { id: "farm", name: "Ферма", cost: { wood: 120, stone: 60 } },
        { id: "mine", name: "Рудник", cost: { wood: 180, stone: 120 } },
        { id: "bakery", name: "Пекарня", cost: { wood: 140, stone: 60 } },
        { id: "smithy", name: "Кузница", cost: { wood: 200, stone: 120 } },
        { id: "mill", name: "Мельница", cost: { wood: 160, stone: 80 } },
        { id: "fishing-hut", name: "Рыбацкий домик", cost: { wood: 130, stone: 60 } },
        { id: "brewery", name: "Пивоварня", cost: { wood: 220, stone: 150 } },
      ]
    );
  });

  it("keeps construction selection in the construction panel and builds on the selected map slot", () => {
    const state = useSettlementStore.getState();
    state.setPanel("construction");
    const slotId = CONSTRUCTION_PANEL_DATA.placementSlots[0].id;

    assert.equal(useSettlementStore.getState().activePanel, "construction");
    assert.equal(useSettlementStore.getState().rightPanelOpen, true);
    assert.equal(useSettlementStore.getState().constructionCategoryId, "production");
    assert.equal(useSettlementStore.getState().constructionPage, 0);
    assert.equal(useSettlementStore.getState().selectedConstructionId, "sawmill");
    assert.equal(useSettlementStore.getState().selectedConstructionSlotId, slotId);

    useSettlementStore.getState().selectConstructionItem("smithy");
    const selected = useSettlementStore.getState();
    assert.equal(selected.activePanel, "construction");
    assert.equal(selected.selectedConstructionId, "smithy");
    assert.equal(selected.constructionPage, 0);

    useSettlementStore.getState().setConstructionPage(1);
    assert.equal(useSettlementStore.getState().constructionPage, 1);

    useSettlementStore.getState().setConstructionCategory("storage");
    const storage = useSettlementStore.getState();
    assert.equal(storage.constructionCategoryId, "storage");
    assert.equal(storage.constructionPage, 0);
    assert.equal(storage.selectedConstructionId, "warehouse");

    const confirmed = useSettlementStore.getState().confirmConstructionPlacement();
    const afterConfirm = useSettlementStore.getState();
    assert.equal(confirmed, true);
    assert.equal(afterConfirm.activePanel, "build");
    assert.equal(afterConfirm.rightPanelOpen, true);
    assert.equal(afterConfirm.selectedBuildingId, `built:${slotId}`);
    assert.deepEqual(afterConfirm.constructedBuildings[slotId], {
      id: `built:${slotId}`,
      slotId,
      itemId: "warehouse",
      level: 1,
      builtAt: afterConfirm.constructedBuildings[slotId].builtAt,
    });
    assert.equal(Math.floor(afterConfirm.resources.wood), 730);
    assert.equal(Math.floor(afterConfirm.resources.stone), 560);
    assert.equal(afterConfirm.notices[0].type, "upgrade");
    assert.equal(afterConfirm.notices[0].text, "Склад построен: Южная терраса");
  });

  it("prevents double-building on occupied plots and supports demolition with a partial refund", () => {
    const slotId = CONSTRUCTION_PANEL_DATA.placementSlots[0].id;
    useSettlementStore.getState().setConstructionCategory("storage");

    assert.equal(useSettlementStore.getState().confirmConstructionPlacement(slotId), true);
    assert.equal(useSettlementStore.getState().confirmConstructionPlacement(slotId), false);
    assert.equal(useSettlementStore.getState().notices[0].text, "Южная терраса: площадка уже занята");

    const beforeDemolish = useSettlementStore.getState().resources;
    assert.equal(useSettlementStore.getState().demolishConstructedBuilding(`built:${slotId}`), true);

    const afterDemolish = useSettlementStore.getState();
    assert.equal(afterDemolish.constructedBuildings[slotId], undefined);
    assert.equal(afterDemolish.activePanel, "construction");
    assert.equal(afterDemolish.selectedConstructionSlotId, slotId);
    assert.equal(Math.floor(afterDemolish.resources.wood), Math.floor(beforeDemolish.wood + 60));
    assert.equal(Math.floor(afterDemolish.resources.stone), Math.floor(beforeDemolish.stone + 55));
    assert.equal(afterDemolish.notices[0].text, "Склад снесён: Южная терраса");
  });
});
