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
  bonsai: { id: "bonsai", name: "Bonsai", baseCost: 62000, baseProduction: 5.1, baseClick: 78, baseXp: 58, basePassiveXp: 0.72, color: "text-cyan-400", spriteIndex: 8 },
  string_of_pearls: { id: "string_of_pearls", name: "String of Pearls", baseCost: 145000, baseProduction: 8, baseClick: 116, baseXp: 74, basePassiveXp: 1, color: "text-emerald-300", spriteIndex: 9 },
  orchid: { id: "orchid", name: "Orchid", baseCost: 330000, baseProduction: 12.4, baseClick: 170, baseXp: 92, basePassiveXp: 1.36, color: "text-fuchsia-300", spriteIndex: 10 },
  venus_flytrap: { id: "venus_flytrap", name: "Venus Flytrap", baseCost: 740000, baseProduction: 18.8, baseClick: 250, baseXp: 112, basePassiveXp: 1.82, color: "text-lime-300", spriteIndex: 11 },
  moon_cactus: { id: "moon_cactus", name: "Moon Cactus", baseCost: 1600000, baseProduction: 28.2, baseClick: 360, baseXp: 138, basePassiveXp: 2.42, color: "text-orange-300", spriteIndex: 12 },
  fern: { id: "fern", name: "Fern", baseCost: 3400000, baseProduction: 42, baseClick: 520, baseXp: 170, basePassiveXp: 3.2, color: "text-green-300", spriteIndex: 13 },
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
