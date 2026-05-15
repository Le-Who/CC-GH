import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import { GOAL_PANEL_DATA } from "../src/games/settlement/gameData.js";
import { useSettlementStore } from "../src/games/settlement/useSettlementStore.js";

describe("Settlement goals screen contract", () => {
  beforeEach(() => {
    useSettlementStore.getState().resetSettlement();
  });

  it("models the goals panel values from the third mockup", () => {
    assert.equal(GOAL_PANEL_DATA.dailyRefreshLabel, "12ч. 45м.");
    assert.deepEqual(
      GOAL_PANEL_DATA.longTermGoals.map((goal) => ({
        id: goal.id,
        title: goal.title,
        current: goal.progress.current,
        max: goal.progress.max,
        rewardType: goal.reward.type,
        rewardAmount: goal.reward.amount,
      })),
      [
        { id: "settlement-level-15", title: "Достигнуть уровня поселения 15", current: 12, max: 15, rewardType: "gems", rewardAmount: 200 },
        { id: "town-hall-level-10", title: "Улучшить Ратушу до уровня 10", current: 7, max: 10, rewardType: "culture", rewardAmount: 150 },
        { id: "population-600", title: "Население 600 жителей", current: 520, max: 600, rewardType: "gold", rewardAmount: 1000 },
        { id: "prestige-5000", title: "Заработать 5 000 престижа", current: 3420, max: 5000, rewardType: "prestige", rewardAmount: 250 },
      ]
    );
    assert.deepEqual(
      GOAL_PANEL_DATA.dailyTasks.map((task) => ({
        id: task.id,
        title: task.title,
        current: task.progress.current,
        max: task.progress.max,
        rewardType: task.reward.type,
        rewardAmount: task.reward.amount,
      })),
      [
        { id: "daily-wood-800", title: "Соберите дерево", current: 800, max: 800, rewardType: "gold", rewardAmount: 150 },
        { id: "daily-stone-600", title: "Добыть камень", current: 600, max: 600, rewardType: "food", rewardAmount: 120 },
        { id: "daily-enemies-3", title: "Победите врагов", current: 3, max: 3, rewardType: "gems", rewardAmount: 80 },
      ]
    );
  });

  it("claims the ready daily rewards and keeps the goals screen open", () => {
    const state = useSettlementStore.getState();
    state.setPanel("goals");

    const claimed = useSettlementStore.getState().claimGoalRewards();
    const afterClaim = useSettlementStore.getState();

    assert.equal(claimed, 3);
    assert.equal(afterClaim.activePanel, "goals");
    assert.equal(afterClaim.rightPanelOpen, true);
    assert.equal(afterClaim.resources.food, 1360);
    assert.equal(afterClaim.resources.gold, 2600);
    assert.equal(afterClaim.resources.gems, 640);
    assert.deepEqual([...afterClaim.claimedGoalRewardIds].sort(), ["daily-enemies-3", "daily-stone-600", "daily-wood-800"]);
    assert.equal(afterClaim.notices[0].type, "collect");
    assert.equal(afterClaim.notices[0].text, "Цели: забрано 3");

    const secondClaim = useSettlementStore.getState().claimGoalRewards();
    const afterSecond = useSettlementStore.getState();

    assert.equal(secondClaim, 0);
    assert.equal(afterSecond.notices[0].type, "warn");
    assert.equal(afterSecond.notices[0].text, "Награды уже забраны");
  });
});
