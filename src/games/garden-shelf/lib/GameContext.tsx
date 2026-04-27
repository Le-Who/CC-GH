import React, { createContext, useCallback, useContext, useState, useEffect, ReactNode } from 'react';
import { GameState, PlantData } from '../types';
import {
  PLANT_TYPES,
  LEVELS,
  getUpgradeCost,
  getProduction,
  getClickReward,
  getUnlockedPlantIds,
  SHELF_UNLOCK_COSTS,
  PHASE_DURATIONS_MS,
  TAP_GROWTH_ACCELERATION_MS,
  WATER_COOLDOWN_MS,
  WATER_GROWTH_ACCELERATION_RATIO,
} from '../constants';
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
  persistedState?: Partial<GameState> | null;
  onGoldDelta?: (amount: number, reason?: string) => Promise<GoldDeltaResult | void>;
  onStateSync?: (state: Omit<GameState, 'gold'>) => Promise<GoldDeltaResult | void>;
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

function withoutSharedGold(state: GameState): Omit<GameState, 'gold'> {
  const { gold: _gold, offlineEarnings: _offlineEarnings, ...persistedState } = state;
  return { ...persistedState, offlineEarnings: null };
}

function normalizePersistedGardenState(raw: any, hubGold: number): GameState {
  const source = raw && typeof raw === 'object' ? { ...raw } : {};
  if (source.oxygen !== undefined) {
    source.totalGoldEarned = source.totalOxygenEarned;
    delete source.oxygen;
    delete source.totalOxygenEarned;
  }
  delete source.gold;
  const plants = Array.isArray(source.plants)
    ? source.plants.map((p: any) => ({
        ...p,
        type: p.type || 'daisy',
        level: Math.max(1, Math.floor(Number(p.level) || 1)),
        shelfIndex: Number.isFinite(Number(p.shelfIndex)) ? Math.floor(Number(p.shelfIndex)) : -1,
        spotIndex: Number.isFinite(Number(p.spotIndex)) ? Math.floor(Number(p.spotIndex)) : -1,
        phase: Math.max(0, Math.min(3, Math.floor(Number(p.phase ?? Math.min(3, Math.floor(((p.level || 1) - 1) / 3))) || 0))),
        phaseProgress: Math.max(0, Math.floor(Number(p.phaseProgress) || 0)),
      }))
    : [];

  return {
    ...defaultState,
    ...source,
    plants,
    totalGoldEarned: Math.max(0, Math.floor(Number(source.totalGoldEarned) || 0)),
    level: Math.max(1, Math.floor(Number(source.level) || 1)),
    xp: Math.max(0, Math.floor(Number(source.xp) || 0)),
    shelvesUnlocked: Math.max(1, Math.floor(Number(source.shelvesUnlocked) || 1)),
    lastTick: Math.max(0, Math.floor(Number(source.lastTick) || Date.now())),
    offlineEarnings: null,
    gold: hubGold,
  };
}

function readLocalGardenState(hubGold: number): GameState | null {
  try {
    const saved = localStorage.getItem('terrarium_save');
    return saved ? normalizePersistedGardenState(JSON.parse(saved), hubGold) : null;
  } catch {
    return null;
  }
}

function hasGardenProgress(state: GameState | null) {
  return !!state && (
    state.plants.length > 0 ||
    state.level > 1 ||
    state.xp > 0 ||
    state.shelvesUnlocked > 1 ||
    state.totalGoldEarned > 0
  );
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

export function GameProvider({ children, hubGold, persistedState, onGoldDelta, onStateSync, onHudChange }: GameProviderProps) {
  const [state, setState] = useState<GameState>(() => {
    const gold = normalizeHubGold(hubGold);
    const serverState = normalizePersistedGardenState(persistedState, gold);
    const localState = readLocalGardenState(gold);
    return hasGardenProgress(serverState) || !hasGardenProgress(localState) ? serverState : localState!;
  });
  const initialServerStateKey = JSON.stringify(withoutSharedGold(
    normalizePersistedGardenState(persistedState, normalizeHubGold(hubGold)),
  ));
  const externalStateKeyRef = React.useRef(initialServerStateKey);
  const syncedEarnedRef = React.useRef(state.totalGoldEarned);
  const syncRef = React.useRef<{
    timer: number | null;
    lastAt: number;
    lastSent: string;
    pending: Omit<GameState, 'gold'> | null;
    pendingKey: string;
    inFlight: boolean;
  }>({
    timer: null,
    lastAt: 0,
    lastSent: initialServerStateKey,
    pending: null,
    pendingKey: '',
    inFlight: false,
  });
  const persistedStateKey = React.useMemo(() => JSON.stringify(persistedState || null), [persistedState]);

  useEffect(() => {
    const gold = normalizeHubGold(hubGold);
    setState((prev) => (prev.gold === gold ? prev : { ...prev, gold }));
  }, [hubGold]);

  useEffect(() => {
    if (!persistedState) return;
    const next = normalizePersistedGardenState(persistedState, state.gold);
    const nextKey = JSON.stringify(withoutSharedGold(next));
    if (nextKey === syncRef.current.lastSent) {
      externalStateKeyRef.current = nextKey;
      return;
    }
    if (nextKey === externalStateKeyRef.current) return;
    externalStateKeyRef.current = nextKey;
    syncedEarnedRef.current = next.totalGoldEarned;
    setState((prev) => ({
      ...next,
      gold: prev.gold,
      offlineEarnings: prev.offlineEarnings,
    }));
  }, [persistedState, persistedStateKey, state.gold]);

  useEffect(() => {
    const nextPersisted = withoutSharedGold(state);
    const nextKey = JSON.stringify(nextPersisted);
    try {
      localStorage.setItem('terrarium_save', nextKey);
    } catch {
      // Local persistence is a best-effort fallback; server state remains authoritative.
    }
    if (!onStateSync || nextKey === syncRef.current.lastSent) return;

    syncRef.current.pending = nextPersisted;
    syncRef.current.pendingKey = nextKey;

    const flush = async () => {
      if (syncRef.current.timer) {
        window.clearTimeout(syncRef.current.timer);
        syncRef.current.timer = null;
      }
      if (!syncRef.current.pending || syncRef.current.inFlight) return;
      const outgoing = syncRef.current.pending;
      const outgoingKey = syncRef.current.pendingKey;
      syncRef.current.pending = null;
      syncRef.current.pendingKey = '';
      syncRef.current.inFlight = true;
      syncRef.current.lastAt = Date.now();
      const result = await onStateSync(outgoing);
      syncRef.current.inFlight = false;
      if (!result?.error) {
        syncRef.current.lastSent = outgoingKey;
        externalStateKeyRef.current = outgoingKey;
      }
      if (syncRef.current.pending) {
        syncRef.current.timer = window.setTimeout(flush, 2500);
      }
    };

    const delay = Math.max(0, 2500 - (Date.now() - syncRef.current.lastAt));
    if (delay === 0) {
      void flush();
    } else if (!syncRef.current.timer) {
      syncRef.current.timer = window.setTimeout(flush, delay);
    }
  }, [state, onStateSync]);

  useEffect(() => () => {
    if (syncRef.current.timer) {
      window.clearTimeout(syncRef.current.timer);
      syncRef.current.timer = null;
    }
    if (syncRef.current.pending && onStateSync) {
      void onStateSync(syncRef.current.pending);
    }
  }, [onStateSync]);

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
    if (!getUnlockedPlantIds(state.level).includes(type)) return;
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
            const amount = getClickReward(def.baseClick, plant.level);
            return applyGardenProgress(prev, amount);
        } else {
            // Not grown. Tap accelerates growth by a fixed amount.
            const duration = PHASE_DURATIONS_MS[plant.phase];
            let newProgress = plant.phaseProgress + TAP_GROWTH_ACCELERATION_MS;
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
        if (plant.lastWatered && now - plant.lastWatered < WATER_COOLDOWN_MS) {
            return prev;
        }

        const duration = PHASE_DURATIONS_MS[plant.phase];
        const accAmount = duration * WATER_GROWTH_ACCELERATION_RATIO;
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

  const unlockedPlants = getUnlockedPlantIds(state.level);

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
