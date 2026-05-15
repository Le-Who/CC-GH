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

  it("keeps construction selection in the construction panel and confirms the highlighted map slot", () => {
    const state = useSettlementStore.getState();
    state.setPanel("construction");

    assert.equal(useSettlementStore.getState().activePanel, "construction");
    assert.equal(useSettlementStore.getState().rightPanelOpen, true);
    assert.equal(useSettlementStore.getState().constructionCategoryId, "production");
    assert.equal(useSettlementStore.getState().constructionPage, 0);
    assert.equal(useSettlementStore.getState().selectedConstructionId, "sawmill");

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
    assert.equal(afterConfirm.activePanel, "construction");
    assert.equal(afterConfirm.rightPanelOpen, true);
    assert.equal(afterConfirm.notices[0].type, "upgrade");
    assert.equal(afterConfirm.notices[0].text, "Склад: площадка выбрана");
  });
});
