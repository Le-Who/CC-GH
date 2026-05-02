import { useMemo } from "react";

function count(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

export function buildGameHudDescriptors(activeTab, snapshot = {}, localState = {}) {
  localState ||= {};
  const resources = snapshot?.resources || {};
  const energy = resources.energy || {};

  if (activeTab === "garden") return null;

  if (activeTab === "blox") {
    const saved = snapshot?.blox?.savedState || {};
    return [
      { id: "score", labelKey: "common.score", value: count(firstDefined(localState.score, saved.score)) },
      { id: "lines", labelKey: "common.lines", value: count(firstDefined(localState.linesCleared, saved.linesCleared)) },
      { id: "reward", labelKey: "common.reward", value: count(localState.currentReward) },
    ];
  }

  if (activeTab === "match3") {
    const current = snapshot?.match3?.currentGame || {};
    return [
      { id: "score", labelKey: "common.score", value: count(firstDefined(localState.score, current.score)) },
      { id: "moves", labelKey: localState.mode === "timed" ? "common.time" : "common.moves", value: count(firstDefined(localState.movesLeft, current.movesLeft)) },
      { id: "combo", labelKey: "common.combo", value: `x${Math.max(1, count(firstDefined(localState.combo, current.combo)) || 1)}` },
    ];
  }

  if (activeTab === "merge") {
    const merge = snapshot?.merge || {};
    const harvested = snapshot?.farm?.harvested || resources.harvested || {};
    const fuel = Object.values(harvested).reduce((sum, value) => sum + count(value), 0);
    return [
      { id: "essence", labelKey: "merge.essence", value: count(merge.alchemyEssence) },
      { id: "freeTaps", labelKey: "merge.freeTaps", value: count(merge.freeTapCharges) },
      { id: "fuel", labelKey: "merge.fuel", value: fuel },
    ];
  }

  if (activeTab === "bubbo") {
    const current = snapshot?.bubbo?.currentGame || {};
    return [
      { id: "score", labelKey: "common.score", value: count(firstDefined(localState.score, current.score)) },
      { id: "shots", labelKey: "bubbo.shots", value: count(firstDefined(localState.shotsLeft, current.shotsLeft)) },
      { id: "pressure", labelKey: "bubbo.pressure", value: firstDefined(localState.pressureLabel, current.pressureLabel, "Calm") },
    ];
  }

  if (activeTab === "trivia") {
    const trivia = snapshot?.trivia || {};
    return [
      { id: "score", labelKey: "common.score", value: count(firstDefined(localState.score, trivia.sessionScore)) },
      { id: "streak", labelKey: "trivia.streak", value: count(firstDefined(localState.streak, trivia.streak)) },
      { id: "time", labelKey: "common.time", value: count(firstDefined(localState.timeLeft, localState.timeMs && Math.ceil(localState.timeMs / 1000))) },
    ];
  }

  return [
    { id: "gold", labelKey: "common.gold", value: count(resources.gold) },
    { id: "energy", labelKey: "common.energy", value: `${energy.current ?? 0}/${energy.max ?? 0}` },
    { id: "tokens", labelKey: "common.tokens", value: count(resources.gachaTokens) },
  ];
}

export function useGameHudDescriptors(activeTab, snapshot, localState) {
  return useMemo(
    () => buildGameHudDescriptors(activeTab, snapshot, localState),
    [activeTab, snapshot, localState],
  );
}
