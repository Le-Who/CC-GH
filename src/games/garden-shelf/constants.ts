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
import {
  GARDEN_GOLD_DISPLAY_MULTIPLIER,
  PLANT_TYPES as BASE_PLANT_TYPES,
  formatGardenGoldAmount,
  formatGardenRate,
  getClickReward,
  getClickXpReward,
  getPassiveXpRate,
  getPlantUnlockLevel,
  getProduction,
  getUnlockedPlantIds,
  getUpgradeCost,
  toGardenGoldDisplayValue,
} from '../../../game-logic/garden-shelf-plants.js';

export {
  GARDEN_ECONOMY_VERSION,
  GARDEN_OFFLINE_CAP_MS,
  GARDEN_OFFLINE_GOLD_RATIO,
  GARDEN_OFFLINE_XP_RATIO,
  GARDEN_STARTER_GOLD,
  GARDEN_TAP_REWARD_COOLDOWN_MS,
  getGardenLevelReward,
  getGardenXpRequired,
  GARDEN_GOLD_DISPLAY_MULTIPLIER,
  formatGardenGoldAmount,
  formatGardenRate,
  getClickReward,
  getClickXpReward,
  getPassiveXpRate,
  getPlantUnlockLevel,
  getProduction,
  getUnlockedPlantIds,
  getUpgradeCost,
  toGardenGoldDisplayValue,
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

const PLANT_ICONS: Record<PlantType, React.ElementType> = {
  daisy: Flower,
  lavender: Flower,
  basil: Leaf,
  rosemary: Sprout,
  monstera: Leaf,
  succulent: Clover,
  pothos: Leaf,
  strawberry: Flower,
};

export const PLANT_TYPES: Record<PlantType, PlantDefinition> = Object.fromEntries(
  Object.entries(BASE_PLANT_TYPES).map(([id, definition]) => [
    id,
    {
      ...definition,
      icon: PLANT_ICONS[id as PlantType] || Flower,
    },
  ]),
) as Record<PlantType, PlantDefinition>;

export const LEVELS = GARDEN_LEVELS as GardenLevelDefinition[];

export const PHASE_DURATIONS_MS = [120000, 480000, 1800000];

export const TAP_GROWTH_ACCELERATION_MS = 2000;
export const GARDEN_GROWTH_TAP_COOLDOWN_MS = 500;
export const WATER_COOLDOWN_MS = 8 * 60 * 1000;
export const WATER_GROWTH_ACCELERATION_RATIO = 0.08;

export function getGardenTapCooldownMs(phase: number) {
  return phase < 3 ? GARDEN_GROWTH_TAP_COOLDOWN_MS : GARDEN_TAP_REWARD_COOLDOWN_MS;
}

export const MAX_SHELVES = 5;
export const SPOTS_PER_SHELF = 3;
export const SHELF_UNLOCK_COSTS = [0, 1000, 8000, 45000, 220000];
