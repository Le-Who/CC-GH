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
  lastTapped?: number; // timestamp for mature reward cooldown
}

export interface GameState {
  economyVersion: number;
  name: string;
  gold: number;
  totalGoldEarned: number;
  level: number;
  xp: number;
  xpRequired: number;
  levelReady: boolean;
  shelvesUnlocked: number;
  plants: PlantData[];
  passiveGoldBuffer: number;
  passiveXpBuffer: number;
  lastTick: number;
  offlineEarnings: number | null;
  offlineXp: number | null;
}
