import React, { createContext, useCallback, useContext, useState, useEffect, ReactNode } from 'react';
import { GameState, PlantData } from '../types';
import { PLANT_TYPES, LEVELS, getUpgradeCost, getProduction, SHELF_UNLOCK_COSTS, PHASE_DURATIONS_MS } from '../constants';
import { useInterval } from './useInterval';

interface GardenHudState {
  level: number;
  plants: number;
  slots: number;
  shelvesUnlocked: number;
  incomePerSecond: number;
}

interface GoldDeltaResult {
  error?: string;
}

interface GameProviderProps {
  children: ReactNode;
  hubGold?: number;
  onGoldDelta?: (amount: number, reason?: string) => Promise<GoldDeltaResult | void>;
  onHudChange?: (hud: GardenHudState | null) => void;
}

interface GameContextType {
  state: GameState;
  addGold: (amount: number) => void;
  buyPlant: (type: keyof typeof PLANT_TYPES, shelfIndex: number, spotIndex: number) => void;
  upgradePlant: (plantId: string) => void; // still useful for upgrading base production once mature
  sellPlant: (plantId: string) => void;
  unlockShelf: () => void;
  unlockedPlants: string[];
  clearOfflineEarnings: () => void;
  waterPlant: (plantId: string) => void;
  tapPlant: (plantId: string) => void;
  movePlantToInventory: (plantId: string) => void;
  movePlantToShelf: (plantId: string, shelfIndex: number, spotIndex: number) => void;
}

const defaultState: GameState = {
  gold: 0,
  totalGoldEarned: 0,
  level: 1,
  xp: 0,
  shelvesUnlocked: 1,
  plants: [],
  lastTick: Date.now(),
  offlineEarnings: null
};

const GameContext = createContext<GameContextType | null>(null);

function normalizeHubGold(value: number | undefined) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function applyGardenProgress(prev: GameState, amount: number) {
  const earned = Math.max(0, Math.floor(Number(amount) || 0));
  if (!earned) return prev;

  let newXp = prev.xp + earned;
  let newLevel = prev.level;
  let targetXp = LEVELS.find((l) => l.level === newLevel + 1)?.xpRequired;

  while (targetXp && newXp >= targetXp) {
    newLevel++;
    targetXp = LEVELS.find((l) => l.level === newLevel + 1)?.xpRequired;
  }

  return {
    ...prev,
    totalGoldEarned: prev.totalGoldEarned + earned,
    xp: newXp,
    level: Math.min(newLevel, LEVELS[LEVELS.length - 1].level),
  };
}

function getGardenIncomePerSecond(plants: PlantData[]) {
  return plants.reduce((total, plant) => {
    if (plant.phase !== 3 || plant.spotIndex < 0 || plant.shelfIndex < 0) return total;
    const def = PLANT_TYPES[plant.type] || PLANT_TYPES.daisy;
    return total + getProduction(def.baseProduction, plant.level);
  }, 0);
}

export function GameProvider({ children, hubGold, onGoldDelta, onHudChange }: GameProviderProps) {
  const [state, setState] = useState<GameState>(() => {
    const saved = localStorage.getItem('terrarium_save');
    const gold = normalizeHubGold(hubGold);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Rename legacy fields if needed
        if (parsed.oxygen !== undefined) {
          parsed.gold = parsed.oxygen;
          parsed.totalGoldEarned = parsed.totalOxygenEarned;
          delete parsed.oxygen;
          delete parsed.totalOxygenEarned;
        }
        delete parsed.gold;
        // Init missing properties on old plants
        parsed.plants = (parsed.plants || []).map((p: any) => ({
          ...p,
          phase: p.phase ?? Math.min(3, Math.floor(((p.level || 1) - 1) / 3)),
          phaseProgress: p.phaseProgress ?? 0
        }));
        return { ...defaultState, ...parsed, gold };
      } catch (e) {
        return { ...defaultState, gold };
      }
    }
    return { ...defaultState, gold };
  });

  useEffect(() => {
    const gold = normalizeHubGold(hubGold);
    setState((prev) => (prev.gold === gold ? prev : { ...prev, gold }));
  }, [hubGold]);

  useEffect(() => {
    const { gold: _gold, ...persistedState } = state;
    localStorage.setItem('terrarium_save', JSON.stringify(persistedState));
  }, [state]);

  useEffect(() => {
    onHudChange?.({
      level: state.level,
      plants: state.plants.filter((plant) => plant.shelfIndex >= 0 && plant.spotIndex >= 0).length,
      slots: state.shelvesUnlocked * 3,
      shelvesUnlocked: state.shelvesUnlocked,
      incomePerSecond: getGardenIncomePerSecond(state.plants),
    });
  }, [onHudChange, state.level, state.plants, state.shelvesUnlocked]);

  useEffect(() => () => onHudChange?.(null), [onHudChange]);

  const commitGoldDelta = useCallback(
    async (amount: number, reason: string) => {
      const delta = Math.trunc(Number(amount) || 0);
      if (!delta) return { error: 'zero delta' };
      if (!onGoldDelta) return {};
      return (await onGoldDelta(delta, reason)) || {};
    },
    [onGoldDelta],
  );

  const addGold = (amount: number) => {
    const earned = Math.floor(Number(amount) || 0);
    if (!earned) return;
    setState((prev) => applyGardenProgress(prev, earned));
  };

  const syncedEarnedRef = React.useRef(state.totalGoldEarned);
  useEffect(() => {
    const earnedDelta = Math.floor(state.totalGoldEarned - syncedEarnedRef.current);
    if (earnedDelta > 0) {
      void commitGoldDelta(earnedDelta, 'earned');
      syncedEarnedRef.current += earnedDelta;
    }
  }, [commitGoldDelta, state.totalGoldEarned]);

  useInterval(() => {
    setState((s) => {
      const now = Date.now();
      const dtMs = now - s.lastTick;
      const dtSeconds = dtMs / 1000;

      if (dtSeconds < 1 && s.lastTick !== defaultState.lastTick) return s;

      let totalProd = 0;
      let newPlants = [...s.plants];
      let needsPlantUpdate = false;

      const occupiedSpots = new Set<string>();

      for (let i = 0; i < newPlants.length; i++) {
         const p = newPlants[i];

         // Fix overlap bug: if multiple plants are on the same spot, move the extras to stash
         if (p.shelfIndex >= 0 && p.spotIndex >= 0) {
             const key = `${p.shelfIndex}-${p.spotIndex}`;
             if (occupiedSpots.has(key)) {
                 newPlants[i] = { ...p, shelfIndex: -1, spotIndex: -1 };
                 needsPlantUpdate = true;
                 continue; // Plant is now in stash, doesn't generate gold or grow
             }
             occupiedSpots.add(key);
         }

         // Only phase 3 brings passive gold
         if (newPlants[i].phase === 3 && newPlants[i].spotIndex >= 0 && newPlants[i].shelfIndex >= 0) {
             const def = PLANT_TYPES[newPlants[i].type] || PLANT_TYPES.daisy;
             totalProd += getProduction(def.baseProduction, newPlants[i].level);
         } else if (newPlants[i].phase < 3 && newPlants[i].spotIndex >= 0 && newPlants[i].shelfIndex >= 0) {
             // Grow!
             const duration = PHASE_DURATIONS_MS[p.phase];
             const newProgress = p.phaseProgress + dtMs;

             if (newProgress >= duration) {
                 newPlants[i] = {
                   ...p,
                   phase: p.phase + 1,
                   phaseProgress: 0
                 };
             } else {
                 newPlants[i] = {
                   ...p,
                   phaseProgress: newProgress
                 };
             }
             needsPlantUpdate = true;
         }
      }

      const generated = Math.floor(totalProd * dtSeconds);

      let newOfflineEarnings = s.offlineEarnings;
      if (dtSeconds > 60 && generated > 0 && s.lastTick !== defaultState.lastTick) {
         newOfflineEarnings = (s.offlineEarnings || 0) + generated;
      }

      if (generated > 0 || needsPlantUpdate) {
        return {
          ...applyGardenProgress(s, generated),
          lastTick: now,
          offlineEarnings: newOfflineEarnings,
          plants: needsPlantUpdate ? newPlants : s.plants
        };
      }

      return { ...s, lastTick: now };
    });
  }, 1000);

  const clearOfflineEarnings = () => {
    setState(s => ({ ...s, offlineEarnings: null }));
  };

  const buyPlant = async (type: keyof typeof PLANT_TYPES, shelfIndex: number, spotIndex: number) => {
    const def = PLANT_TYPES[type];
    if (state.gold >= def.baseCost) {
      const result = await commitGoldDelta(-def.baseCost, 'buyPlant');
      if (result.error) return;
      setState((prev) => ({
        ...prev,
        plants: [
          ...prev.plants,
          {
            id: crypto.randomUUID(),
            type,
            level: 1,
            shelfIndex,
            spotIndex,
            phase: 0,
            phaseProgress: 0
          },
        ],
      }));
    }
  };

  const upgradePlant = async (plantId: string) => {
    const plant = state.plants.find((p) => p.id === plantId);
    if (!plant) return;
    const def = PLANT_TYPES[plant.type] || PLANT_TYPES.daisy;
    const cost = getUpgradeCost(def.baseCost, plant.level);
    if (state.gold < cost) return;

    const result = await commitGoldDelta(-cost, 'upgradePlant');
    if (result.error) return;

    setState((prev) => ({
      ...prev,
      plants: prev.plants.map((p) =>
        p.id === plantId ? { ...p, level: p.level + 1 } : p
      ),
    }));
  };

  const sellPlant = async (plantId: string) => {
    const plant = state.plants.find((p) => p.id === plantId);
    if (!plant) return;
    const def = PLANT_TYPES[plant.type] || PLANT_TYPES.daisy;
    const refund = Math.floor(def.baseCost / 2);
    const result = await commitGoldDelta(refund, 'sellPlant');
    if (result.error) return;

    setState((prev) => ({
      ...prev,
      plants: prev.plants.filter((p) => p.id !== plantId),
    }));
  };

  const unlockShelf = async () => {
    const unlockCost = SHELF_UNLOCK_COSTS[state.shelvesUnlocked] || 999999;
    if (state.gold < unlockCost) return;

    const result = await commitGoldDelta(-unlockCost, 'unlockShelf');
    if (result.error) return;

    setState((prev) => ({
      ...prev,
      shelvesUnlocked: prev.shelvesUnlocked + 1,
    }));
  };

  const tapPlant = (plantId: string) => {
     setState(prev => {
        const plant = prev.plants.find(p => p.id === plantId);
        if (!plant) return prev;

        if (plant.phase === 3) {
            // It's fully grown. Tap generates gold directly.
            const def = PLANT_TYPES[plant.type] || PLANT_TYPES.daisy;
            const amount = def.baseClick * plant.level;
            return applyGardenProgress(prev, amount);
        } else {
            // Not grown. Tap accelerates growth by a fixed amount (e.g. 5 seconds)
            const duration = PHASE_DURATIONS_MS[plant.phase];
            const accAmount = 5000; 
            let newProgress = plant.phaseProgress + accAmount;
            let newPhase = plant.phase;
            if (newProgress >= duration) {
               newPhase++;
               newProgress = 0;
            }

            return {
               ...prev,
               plants: prev.plants.map(p => p.id === plantId ? { ...p, phase: newPhase, phaseProgress: newProgress } : p)
            };
        }
     });
  };

  const waterPlant = (plantId: string) => {
     setState(prev => {
        const plant = prev.plants.find(p => p.id === plantId);
        if (!plant || plant.phase === 3) return prev; // Cannot water fully grown plant, or maybe you can? Let's say it just works for growth.

        const now = Date.now();
        // Cooldown: can apply water once every 5 minutes
        if (plant.lastWatered && now - plant.lastWatered < 5 * 60 * 1000) {
            return prev;
        }

        const duration = PHASE_DURATIONS_MS[plant.phase];
        // Reduce phase time by 5%
        const accAmount = duration * 0.05;
        let newProgress = plant.phaseProgress + accAmount;
        let newPhase = plant.phase;
        if (newProgress >= duration) {
           newPhase++;
           newProgress = 0;
        }

        return {
           ...prev,
           plants: prev.plants.map(p => p.id === plantId ? { ...p, phase: newPhase, phaseProgress: newProgress, lastWatered: now } : p)
        };
     })
  };

  const movePlantToInventory = (plantId: string) => {
     setState(prev => ({
        ...prev,
        plants: prev.plants.map(p => p.id === plantId ? { ...p, spotIndex: -1, shelfIndex: -1 } : p)
     }));
  };

  const movePlantToShelf = (plantId: string, shelfIndex: number, spotIndex: number) => {
     setState(prev => ({
        ...prev,
        plants: prev.plants.map(p => p.id === plantId ? { ...p, spotIndex, shelfIndex } : p)
     }));
  };

  const unlockedPlants = LEVELS.filter(l => l.level <= state.level)
    .flatMap(l => l.unlocks);

  return (
    <GameContext.Provider
      value={{
        state,
        addGold,
        buyPlant,
        upgradePlant,
        sellPlant,
        unlockShelf,
        unlockedPlants,
        clearOfflineEarnings,
        waterPlant,
        tapPlant,
        movePlantToInventory,
        movePlantToShelf
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export const useGame = () => {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be inside GameProvider');
  return ctx;
};
