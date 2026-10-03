import { createContext, useContext } from 'react';
import type { GameState } from '../types';
import type { PLANT_TYPES } from '../constants';

export interface GameContextType {
  r2?: any;
  r2Command?: (command: string, input?: object) => Promise<boolean>;
  accountingReady: boolean;
  state: GameState;
  addGold: (amount: number) => void;
  buyPlant: (type: keyof typeof PLANT_TYPES, shelfIndex: number, spotIndex: number) => void;
  upgradePlant: (plantId: string) => void; // still useful for upgrading base production once mature
  sellPlant: (plantId: string) => void;
  unlockShelf: () => void;
  unlockedPlants: string[];
  clearOfflineEarnings: () => void;
  waterPlant: (plantId: string) => void;
  tapPlant: (plantId: string) => void | Promise<boolean>;
  levelUp: () => void;
  claimQuest: (questId: string, reward: number) => void;
  renameGarden: (name: string) => void;
  movePlantToInventory: (plantId: string) => void;
  movePlantToShelf: (plantId: string, shelfIndex: number, spotIndex: number) => void;
}

export const GameContext = createContext<GameContextType | null>(null);

export const useGame = () => {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be inside GameProvider');
  return ctx;
};
