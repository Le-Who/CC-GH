import { PlantType } from './constants';

export interface PlantData {
  id: string; // unique uuid
  type: PlantType;
  level: number;
  shelfIndex: number;
  spotIndex: number; // 0 to 3, or -1 if in inventory
  
  // Growth system
  phase: number; // 0, 1, 2, 3
  phaseProgress: number; // Time accumulated in current phase (ms)
  lastWatered?: number; // timestamp
}

export interface GameState {
  gold: number;
  totalGoldEarned: number;
  level: number;
  xp: number;
  shelvesUnlocked: number;
  plants: PlantData[];
  lastTick: number;
  offlineEarnings: number | null;
}

