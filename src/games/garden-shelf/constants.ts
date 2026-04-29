import { Sprout, Clover, Flower, Leaf } from 'lucide-react';
import React from 'react';
import {
  GARDEN_ECONOMY_VERSION,
  GARDEN_LEVELS,
  GARDEN_OFFLINE_CAP_MS,
  GARDEN_OFFLINE_GOLD_RATIO,
  GARDEN_OFFLINE_XP_RATIO,
  GARDEN_STARTER_GOLD,
  GARDEN_TAP_REWARD_COOLDOWN_MS,
  getGardenLevelReward,
  getGardenXpRequired,
} from '../../../game-logic/garden-economy.js';

export {
  GARDEN_ECONOMY_VERSION,
  GARDEN_OFFLINE_CAP_MS,
  GARDEN_OFFLINE_GOLD_RATIO,
  GARDEN_OFFLINE_XP_RATIO,
  GARDEN_STARTER_GOLD,
  GARDEN_TAP_REWARD_COOLDOWN_MS,
  getGardenLevelReward,
  getGardenXpRequired,
};

export type PlantType = 'daisy' | 'lavender' | 'basil' | 'rosemary' | 'monstera' | 'succulent' | 'pothos' | 'strawberry';

export interface PlantDefinition {
  id: PlantType;
  name: string;
  icon: React.ElementType;
  baseCost: number;
  baseProduction: number;
  baseClick: number;
  baseXp: number;
  basePassiveXp: number;
  color: string;
  spriteIndex: number;
}

export interface GardenLevelDefinition {
  level: number;
  xpRequired: number;
  reward: number;
  unlocks: PlantType[];
}

export const PLANT_TYPES: Record<PlantType, PlantDefinition> = {
  daisy: { id: 'daisy', name: 'Daisy', icon: Flower, baseCost: 25, baseProduction: 0.035, baseClick: 1, baseXp: 4, basePassiveXp: 0.012, color: 'text-amber-400', spriteIndex: 0 },
  lavender: { id: 'lavender', name: 'Lavender', icon: Flower, baseCost: 90, baseProduction: 0.08, baseClick: 2, baseXp: 6, basePassiveXp: 0.025, color: 'text-purple-400', spriteIndex: 1 },
  basil: { id: 'basil', name: 'Basil', icon: Leaf, baseCost: 240, baseProduction: 0.16, baseClick: 4, baseXp: 9, basePassiveXp: 0.045, color: 'text-green-500', spriteIndex: 2 },
  rosemary: { id: 'rosemary', name: 'Rosemary', icon: Sprout, baseCost: 650, baseProduction: 0.32, baseClick: 7, baseXp: 13, basePassiveXp: 0.08, color: 'text-teal-500', spriteIndex: 3 },
  monstera: { id: 'monstera', name: 'Monstera', icon: Leaf, baseCost: 1600, baseProduction: 0.62, baseClick: 12, baseXp: 18, basePassiveXp: 0.13, color: 'text-emerald-500', spriteIndex: 4 },
  succulent: { id: 'succulent', name: 'Succulent', icon: Clover, baseCost: 4200, baseProduction: 1.1, baseClick: 20, baseXp: 25, basePassiveXp: 0.2, color: 'text-lime-400', spriteIndex: 5 },
  pothos: { id: 'pothos', name: 'Pothos', icon: Leaf, baseCost: 11000, baseProduction: 1.9, baseClick: 32, baseXp: 34, basePassiveXp: 0.32, color: 'text-green-400', spriteIndex: 6 },
  strawberry: { id: 'strawberry', name: 'Strawberry', icon: Flower, baseCost: 26000, baseProduction: 3.2, baseClick: 50, baseXp: 45, basePassiveXp: 0.5, color: 'text-red-400', spriteIndex: 7 },
};

export const LEVELS = GARDEN_LEVELS as GardenLevelDefinition[];

export const PHASE_DURATIONS_MS = [
  120000,    // Phase 0 -> 1: 2 min
  480000,    // Phase 1 -> 2: 8 min
  1800000    // Phase 2 -> 3: 30 min
];

export const TAP_GROWTH_ACCELERATION_MS = 2000;
export const WATER_COOLDOWN_MS = 8 * 60 * 1000;
export const WATER_GROWTH_ACCELERATION_RATIO = 0.08;

export const MAX_SHELVES = 5;
export const SPOTS_PER_SHELF = 3;
export const SHELF_UNLOCK_COSTS = [0, 1000, 8000, 45000, 220000];

export function getUpgradeCost(baseCost: number, level: number) {
  return Math.floor(baseCost * Math.pow(1.32, level - 1));
}

export function getProduction(baseProduction: number, level: number) {
  const multiplier = 1 + Math.sqrt(Math.max(0, level - 1)) * 0.28;
  return Math.max(0.01, Math.round(baseProduction * multiplier * 100) / 100);
}

export function getClickReward(baseClick: number, level: number) {
  const multiplier = 1 + Math.sqrt(Math.max(0, level - 1)) * 0.22;
  return Math.max(1, Math.floor(baseClick * multiplier));
}

export function getPassiveXpRate(basePassiveXp: number, level: number) {
  const multiplier = 1 + Math.sqrt(Math.max(0, level - 1)) * 0.18;
  return Math.max(0.005, Math.round(basePassiveXp * multiplier * 1000) / 1000);
}

export function getClickXpReward(baseXp: number, level: number) {
  const multiplier = 1 + Math.sqrt(Math.max(0, level - 1)) * 0.2;
  return Math.max(1, Math.floor(baseXp * multiplier));
}

export function getUnlockedPlantIds(level: number) {
  return LEVELS.filter((entry) => entry.level <= level).flatMap((entry) => entry.unlocks);
}

export function getPlantUnlockLevel(type: PlantType) {
  return LEVELS.find((entry) => entry.unlocks.includes(type))?.level || 1;
}
