import { Sprout, Clover, Flower, Leaf } from 'lucide-react';
import React from 'react';

export type PlantType = 'daisy' | 'lavender' | 'basil' | 'rosemary' | 'monstera' | 'succulent' | 'pothos' | 'strawberry';

export interface PlantDefinition {
  id: PlantType;
  name: string;
  icon: React.ElementType;
  baseCost: number;
  baseProduction: number;
  baseClick: number;
  color: string;
  spriteIndex: number;
}

export interface GardenLevelDefinition {
  level: number;
  xpRequired: number;
  unlocks: PlantType[];
}

export const PLANT_TYPES: Record<PlantType, PlantDefinition> = {
  daisy: { id: 'daisy', name: 'Daisy', icon: Flower, baseCost: 25, baseProduction: 1, baseClick: 1, color: 'text-amber-400', spriteIndex: 0 },
  lavender: { id: 'lavender', name: 'Lavender', icon: Flower, baseCost: 220, baseProduction: 4, baseClick: 2, color: 'text-purple-400', spriteIndex: 1 },
  basil: { id: 'basil', name: 'Basil', icon: Leaf, baseCost: 1800, baseProduction: 11, baseClick: 5, color: 'text-green-500', spriteIndex: 2 },
  rosemary: { id: 'rosemary', name: 'Rosemary', icon: Sprout, baseCost: 12000, baseProduction: 30, baseClick: 12, color: 'text-teal-500', spriteIndex: 3 },
  monstera: { id: 'monstera', name: 'Monstera', icon: Leaf, baseCost: 85000, baseProduction: 80, baseClick: 30, color: 'text-emerald-500', spriteIndex: 4 },
  succulent: { id: 'succulent', name: 'Succulent', icon: Clover, baseCost: 500000, baseProduction: 210, baseClick: 70, color: 'text-lime-400', spriteIndex: 5 },
  pothos: { id: 'pothos', name: 'Pothos', icon: Leaf, baseCost: 3200000, baseProduction: 550, baseClick: 160, color: 'text-green-400', spriteIndex: 6 },
  strawberry: { id: 'strawberry', name: 'Strawberry', icon: Flower, baseCost: 20000000, baseProduction: 1400, baseClick: 360, color: 'text-red-400', spriteIndex: 7 },
};

export const LEVELS: GardenLevelDefinition[] = [
  { level: 1, xpRequired: 0, unlocks: ['daisy'] },
  { level: 2, xpRequired: 250, unlocks: [] },
  { level: 3, xpRequired: 650, unlocks: [] },
  { level: 4, xpRequired: 1200, unlocks: ['lavender'] },
  { level: 5, xpRequired: 2500, unlocks: [] },
  { level: 6, xpRequired: 5200, unlocks: [] },
  { level: 7, xpRequired: 10000, unlocks: ['basil'] },
  { level: 8, xpRequired: 18000, unlocks: [] },
  { level: 9, xpRequired: 32000, unlocks: [] },
  { level: 10, xpRequired: 55000, unlocks: ['rosemary'] },
  { level: 11, xpRequired: 90000, unlocks: [] },
  { level: 12, xpRequired: 150000, unlocks: [] },
  { level: 13, xpRequired: 260000, unlocks: ['monstera'] },
  { level: 14, xpRequired: 420000, unlocks: [] },
  { level: 15, xpRequired: 680000, unlocks: [] },
  { level: 16, xpRequired: 1100000, unlocks: ['succulent'] },
  { level: 17, xpRequired: 1750000, unlocks: [] },
  { level: 18, xpRequired: 2600000, unlocks: [] },
  { level: 19, xpRequired: 3800000, unlocks: ['pothos'] },
  { level: 20, xpRequired: 5400000, unlocks: [] },
  { level: 21, xpRequired: 7800000, unlocks: [] },
  { level: 22, xpRequired: 12000000, unlocks: ['strawberry'] },
  { level: 23, xpRequired: 17000000, unlocks: [] },
  { level: 24, xpRequired: 24000000, unlocks: [] },
];

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
  return Math.floor(baseCost * Math.pow(1.22, level - 1));
}

export function getProduction(baseProduction: number, level: number) {
  return Math.max(1, Math.floor(baseProduction * Math.pow(1.08, level - 1)));
}

export function getClickReward(baseClick: number, level: number) {
  return Math.max(1, Math.floor(baseClick * (1 + Math.max(0, level - 1) * 0.25)));
}

export function getUnlockedPlantIds(level: number) {
  return LEVELS.filter((entry) => entry.level <= level).flatMap((entry) => entry.unlocks);
}

export function getPlantUnlockLevel(type: PlantType) {
  return LEVELS.find((entry) => entry.unlocks.includes(type))?.level || 1;
}
