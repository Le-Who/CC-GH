import { Sprout, Clover, Flower, Leaf, TreeDeciduous, TreePine } from 'lucide-react';
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

export const PLANT_TYPES: Record<PlantType, PlantDefinition> = {
  daisy: { id: 'daisy', name: 'Daisy', icon: Flower, baseCost: 10, baseProduction: 1, baseClick: 1, color: 'text-amber-400', spriteIndex: 0 },
  lavender: { id: 'lavender', name: 'Lavender', icon: Flower, baseCost: 50, baseProduction: 5, baseClick: 3, color: 'text-purple-400', spriteIndex: 1 },
  basil: { id: 'basil', name: 'Basil', icon: Leaf, baseCost: 250, baseProduction: 20, baseClick: 10, color: 'text-green-500', spriteIndex: 2 },
  rosemary: { id: 'rosemary', name: 'Rosemary', icon: Sprout, baseCost: 1000, baseProduction: 75, baseClick: 40, color: 'text-teal-500', spriteIndex: 3 },
  monstera: { id: 'monstera', name: 'Monstera', icon: Leaf, baseCost: 5000, baseProduction: 300, baseClick: 150, color: 'text-emerald-500', spriteIndex: 4 },
  succulent: { id: 'succulent', name: 'Succulent', icon: Clover, baseCost: 25000, baseProduction: 1200, baseClick: 600, color: 'text-lime-400', spriteIndex: 5 },
  pothos: { id: 'pothos', name: 'Pothos', icon: Leaf, baseCost: 100000, baseProduction: 5000, baseClick: 2500, color: 'text-green-400', spriteIndex: 6 },
  strawberry: { id: 'strawberry', name: 'Strawberry', icon: Flower, baseCost: 500000, baseProduction: 20000, baseClick: 10000, color: 'text-red-400', spriteIndex: 7 },
};

export const LEVELS = [
  { level: 1, xpRequired: 0, unlocks: ['daisy'] },
  { level: 2, xpRequired: 50, unlocks: [] },
  { level: 3, xpRequired: 150, unlocks: ['lavender'] },
  { level: 4, xpRequired: 400, unlocks: [] },
  { level: 5, xpRequired: 1000, unlocks: ['basil'] },
  { level: 6, xpRequired: 2500, unlocks: [] },
  { level: 7, xpRequired: 6000, unlocks: ['rosemary'] },
  { level: 8, xpRequired: 15000, unlocks: [] },
  { level: 9, xpRequired: 35000, unlocks: ['monstera'] },
  { level: 10, xpRequired: 80000, unlocks: ['succulent'] },
  { level: 11, xpRequired: 200000, unlocks: ['pothos'] },
  { level: 12, xpRequired: 500000, unlocks: ['strawberry'] },
];

export const PHASE_DURATIONS_MS = [
  60000,    // Phase 0 -> 1: 1 min
  300000,   // Phase 1 -> 2: 5 min
  900000    // Phase 2 -> 3: 15 min
];

export const MAX_SHELVES = 5;
export const SPOTS_PER_SHELF = 3;
export const SHELF_UNLOCK_COSTS = [0, 500, 2500, 10000, 50000];

export function getUpgradeCost(baseCost: number, level: number) {
  return Math.floor(baseCost * Math.pow(1.15, level - 1));
}

export function getProduction(baseProduction: number, level: number) {
  return Math.floor(baseProduction * Math.pow(1.1, level - 1));
}
