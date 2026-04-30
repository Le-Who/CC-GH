import { GARDEN_LEVELS } from "./garden-economy.js";

export const GARDEN_GOLD_DISPLAY_MULTIPLIER = 100;

export const PLANT_TYPES = {
  daisy: { id: "daisy", name: "Daisy", baseCost: 25, baseProduction: 0.035, baseClick: 1, baseXp: 4, basePassiveXp: 0.012, color: "text-amber-400", spriteIndex: 0 },
  lavender: { id: "lavender", name: "Lavender", baseCost: 90, baseProduction: 0.08, baseClick: 2, baseXp: 6, basePassiveXp: 0.025, color: "text-purple-400", spriteIndex: 1 },
  basil: { id: "basil", name: "Basil", baseCost: 240, baseProduction: 0.16, baseClick: 4, baseXp: 9, basePassiveXp: 0.045, color: "text-green-500", spriteIndex: 2 },
  rosemary: { id: "rosemary", name: "Rosemary", baseCost: 650, baseProduction: 0.32, baseClick: 7, baseXp: 13, basePassiveXp: 0.08, color: "text-teal-500", spriteIndex: 3 },
  monstera: { id: "monstera", name: "Monstera", baseCost: 1600, baseProduction: 0.62, baseClick: 12, baseXp: 18, basePassiveXp: 0.13, color: "text-emerald-500", spriteIndex: 4 },
  succulent: { id: "succulent", name: "Succulent", baseCost: 4200, baseProduction: 1.1, baseClick: 20, baseXp: 25, basePassiveXp: 0.2, color: "text-lime-400", spriteIndex: 5 },
  pothos: { id: "pothos", name: "Pothos", baseCost: 11000, baseProduction: 1.9, baseClick: 32, baseXp: 34, basePassiveXp: 0.32, color: "text-green-400", spriteIndex: 6 },
  strawberry: { id: "strawberry", name: "Strawberry", baseCost: 26000, baseProduction: 3.2, baseClick: 50, baseXp: 45, basePassiveXp: 0.5, color: "text-red-400", spriteIndex: 7 },
};

function formatDisplayNumber(value, fractionDigits = 0) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: 0,
  }).format(safeValue);
}

export function toGardenGoldDisplayValue(value) {
  return (Number(value) || 0) * GARDEN_GOLD_DISPLAY_MULTIPLIER;
}

export function formatGardenGoldAmount(value) {
  return formatDisplayNumber(toGardenGoldDisplayValue(value), 0);
}

export function formatGardenRate(value) {
  return formatDisplayNumber(toGardenGoldDisplayValue(value), 2);
}

export function getUpgradeCost(baseCost, level) {
  return Math.floor(baseCost * Math.pow(1.32, level - 1));
}

export function getProduction(baseProduction, level) {
  const multiplier = 1 + Math.sqrt(Math.max(0, level - 1)) * 0.28;
  return Math.max(0.01, Math.round(baseProduction * multiplier * 100) / 100);
}

export function getClickReward(baseClick, level) {
  const multiplier = 1 + Math.sqrt(Math.max(0, level - 1)) * 0.22;
  return Math.max(1, Math.floor(baseClick * multiplier));
}

export function getPassiveXpRate(basePassiveXp, level) {
  const multiplier = 1 + Math.sqrt(Math.max(0, level - 1)) * 0.18;
  return Math.max(0.005, Math.round(basePassiveXp * multiplier * 1000) / 1000);
}

export function getClickXpReward(baseXp, level) {
  const multiplier = 1 + Math.sqrt(Math.max(0, level - 1)) * 0.2;
  return Math.max(1, Math.floor(baseXp * multiplier));
}

export function getUnlockedPlantIds(level) {
  return GARDEN_LEVELS.filter((entry) => entry.level <= level).flatMap((entry) => entry.unlocks);
}

export function getPlantUnlockLevel(type) {
  return GARDEN_LEVELS.find((entry) => entry.unlocks.includes(type))?.level || 1;
}
