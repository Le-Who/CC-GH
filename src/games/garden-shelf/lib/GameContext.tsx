import React, { createContext, useCallback, useContext, useState, useEffect, ReactNode } from 'react';
import { GameState, PlantData } from '../types';
import {
  PLANT_TYPES,
  getUpgradeCost,
  getProduction,
  getClickReward,
  getClickXpReward,
  getPassiveXpRate,
  getUnlockedPlantIds,
  SHELF_UNLOCK_COSTS,
  PHASE_DURATIONS_MS,
  TAP_GROWTH_ACCELERATION_MS,
  WATER_GROWTH_ACCELERATION_RATIO,
  GARDEN_ECONOMY_VERSION,
  GARDEN_OFFLINE_CAP_MS,
  GARDEN_OFFLINE_GOLD_RATIO,
  GARDEN_OFFLINE_XP_RATIO,
  getGardenTapCooldownMs,
  getGardenWaterCooldownMs,
  getGardenLevelReward,
  getGardenXpRequired,
  normalizeGardenLevel,
  normalizeGardenPlantLevel,
  getMatureWaterReward,
} from '../constants';
import { reconcileGardenCheckpoint } from './gardenTransactions.js';
import { selectGardenInitialState, writeGardenLocalState } from './gardenLocalState.js';
import { useInterval } from './useInterval';
import { createGardenEconomyState, shouldResetGardenEconomy } from '../../../../game-logic/garden-economy.js';
import {
  getGardenReadyQuestCount,
  isGardenDailyQuestId,
  normalizeGardenDailyQuestState,
  recordGardenDailyProgress,
} from '../../../../game-logic/garden-quests.js';

interface GardenHudState {
  level: number;
  plants: number;
  slots: number;
  shelvesUnlocked: number;
  incomePerSecond: number;
  xp: number;
  xpRequired: number;
  levelReady: boolean;
  questReadyCount: number;
}

interface GoldDeltaResult {
  error?: string;
  garden?: Partial<GameState>;
  snapshot?: { garden?: Partial<GameState> };
  receiptConfirmed?: boolean;
  pending?: boolean;
  recoveredIntent?: boolean;
  recoveredAction?: string;
  acknowledgedEarnedTotal?: number;
}

interface GardenResetResult extends GoldDeltaResult {
  debit?: number;
  grant?: number;
}

interface GameProviderProps {
  accountId: string;
  halted?: boolean;
  children: ReactNode;
  hubGold?: number;
  persistedState?: Partial<GameState> | null;
  onGoldDelta?: (amount: number, reason?: string) => Promise<GoldDeltaResult | void>;
  onStateSync?: (state: Omit<GameState, 'gold'>) => Promise<GoldDeltaResult | void>;
  onGardenReset?: () => Promise<GardenResetResult | void>;
  onGardenLevelUp?: () => Promise<GoldDeltaResult | void>;
  accountingReady?: boolean;
  reconciledState?: { garden: Partial<GameState>; nonce: number } | null;
  onEconomicAction?: (action: string, payload: object, state: Omit<GameState, 'gold'>) => Promise<GoldDeltaResult>;
  onEarnedCredit?: (state: Omit<GameState, 'gold'>) => Promise<GoldDeltaResult>;
  onHudChange?: (hud: GardenHudState | null) => void;
}

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

const defaultState: GameState = {
  ...(createGardenEconomyState(Date.now()) as Omit<GameState, 'gold'>),
  gold: 0,
};

export const GameContext = createContext<GameContextType | null>(null);
const OFFLINE_EARNINGS_MIN_AWAY_MS = 30 * 60 * 1000;

function normalizeHubGold(value: number | undefined) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function normalizeGardenName(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 22);
}

function normalizeClaimedQuests(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((id) => String(id || '').trim())
    .filter((id) => /^[a-z0-9_-]{1,48}$/.test(id))
  )].slice(0, 80);
}

function withoutSharedGold(state: GameState): Omit<GameState, 'gold'> {
  const { gold: _gold, offlineEarnings: _offlineEarnings, offlineXp: _offlineXp, ...persistedState } = state;
  return { ...persistedState, offlineEarnings: null, offlineXp: null };
}

function normalizePersistedGardenState(raw: any, hubGold: number): GameState {
  const source = raw && typeof raw === 'object' ? { ...raw } : {};
  if (shouldResetGardenEconomy(source)) {
    return {
      ...defaultState,
      ...(createGardenEconomyState(Date.now(), { starter: true }) as Omit<GameState, 'gold'>),
      gold: hubGold,
    };
  }
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
        level: normalizeGardenPlantLevel(p.level),
        shelfIndex: Number.isFinite(Number(p.shelfIndex)) ? Math.floor(Number(p.shelfIndex)) : -1,
        spotIndex: Number.isFinite(Number(p.spotIndex)) ? Math.floor(Number(p.spotIndex)) : -1,
        phase: Math.max(0, Math.min(3, Math.floor(Number(p.phase ?? Math.min(3, Math.floor(((p.level || 1) - 1) / 3))) || 0))),
        phaseProgress: Math.max(0, Math.floor(Number(p.phaseProgress) || 0)),
        lastTapped: Math.max(0, Math.floor(Number(p.lastTapped) || 0)),
      }))
    : [];
  const level = normalizeGardenLevel(source.level);
  const xpRequired = getGardenXpRequired(level);
  const xp = Math.max(0, Math.min(xpRequired, Math.floor(Number(source.xp) || 0)));

  return {
    ...defaultState,
    ...source,
    economyVersion: GARDEN_ECONOMY_VERSION,
    economicRevision: Math.max(0, Math.floor(Number(source.economicRevision) || 0)),
    acknowledgedEarnedTotal: Math.max(0, Math.floor(Number(source.acknowledgedEarnedTotal ?? source.totalGoldEarned) || 0)),
    name: normalizeGardenName(source.name),
    plants,
    totalGoldEarned: Math.max(0, Math.floor(Number(source.totalGoldEarned) || 0)),
    level,
    xp,
    xpRequired,
    levelReady: xp >= xpRequired,
    shelvesUnlocked: Math.max(1, Math.floor(Number(source.shelvesUnlocked) || 1)),
    claimedQuests: normalizeClaimedQuests(source.claimedQuests),
    dailyQuests: normalizeGardenDailyQuestState(source.dailyQuests),
    passiveGoldBuffer: Math.max(0, Math.min(1, Number(source.passiveGoldBuffer) || 0)),
    passiveXpBuffer: Math.max(0, Math.min(1, Number(source.passiveXpBuffer) || 0)),
    lastTick: Math.max(0, Math.floor(Number(source.lastTick) || Date.now())),
    offlineEarnings: null,
    offlineXp: null,
    gold: hubGold,
  };
}

function applyGardenRewards(prev: GameState, rewards: { gold?: number; xp?: number }, options: { trackDaily?: boolean } = {}) {
  const earnedGold = Math.max(0, Math.floor(Number(rewards.gold) || 0));
  const earnedXp = Math.max(0, Math.floor(Number(rewards.xp) || 0));
  if (!earnedGold && !earnedXp) return prev;

  const xpRequired = getGardenXpRequired(prev.level);
  const newXp = !prev.levelReady
    ? Math.min(xpRequired, prev.xp + earnedXp)
    : prev.xp;
  return {
    ...prev,
    dailyQuests: options.trackDaily === false
      ? prev.dailyQuests
      : recordGardenDailyProgress(prev.dailyQuests, { goldEarned: earnedGold, xpEarned: earnedXp }),
    totalGoldEarned: prev.totalGoldEarned + earnedGold,
    xp: newXp,
    xpRequired,
    levelReady: prev.levelReady || newXp >= xpRequired,
  };
}

function getGardenIncomePerSecond(plants: PlantData[]) {
  return plants.reduce((total, plant) => {
    if (plant.phase !== 3 || plant.spotIndex < 0 || plant.shelfIndex < 0) return total;
    const def = PLANT_TYPES[plant.type] || PLANT_TYPES.daisy;
    return total + getProduction(def.baseProduction, plant.level);
  }, 0);
}

function getGardenXpPerSecond(plants: PlantData[]) {
  return plants.reduce((total, plant) => {
    if (plant.phase !== 3 || plant.spotIndex < 0 || plant.shelfIndex < 0) return total;
    const def = PLANT_TYPES[plant.type] || PLANT_TYPES.daisy;
    return total + getPassiveXpRate(def.basePassiveXp, plant.level);
  }, 0);
}

export function GameProvider({ children, accountId, hubGold, persistedState, onGoldDelta, onStateSync, onGardenReset, onGardenLevelUp, onHudChange, accountingReady = true, onEconomicAction, onEarnedCredit, reconciledState, halted = false }: GameProviderProps) {
  const haltedRef = React.useRef(halted);
  haltedRef.current = halted;
  const initialResetNeeded = shouldResetGardenEconomy(persistedState || {});
  const [state, setState] = useState<GameState>(() => {
    const gold = normalizeHubGold(hubGold);
    return normalizePersistedGardenState(selectGardenInitialState(accountId, persistedState), gold);
  });
  const initialServerStateKey = JSON.stringify(withoutSharedGold(
    normalizePersistedGardenState(persistedState, normalizeHubGold(hubGold)),
  ));
  const externalStateKeyRef = React.useRef(initialServerStateKey);
  const currentStateKeyRef = React.useRef(initialServerStateKey);
  const syncedEarnedRef = React.useRef(state.acknowledgedEarnedTotal ?? state.totalGoldEarned);
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const mountedRef = React.useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const economicPendingRef = React.useRef(false);
  const creditPendingRef = React.useRef(false);
  const syncPromiseRef = React.useRef<Promise<any> | null>(null);
  const [creditRetry, setCreditRetry] = useState(0);
  const resetPendingRef = React.useRef(initialResetNeeded);
  const levelUpPendingRef = React.useRef(false);
  const questPendingRef = React.useRef(new Set<string>());
  const syncRef = React.useRef<{
    timer: number | null;
    lastAt: number;
    lastSent: string;
    inFlightKey: string;
    pending: Omit<GameState, 'gold'> | null;
    pendingKey: string;
    inFlight: boolean;
  }>({
    timer: null,
    lastAt: 0,
    lastSent: initialServerStateKey,
    inFlightKey: '',
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
    if (shouldResetGardenEconomy(persistedState || {})) {
      resetPendingRef.current = true;
      const resetState = normalizePersistedGardenState(persistedState, state.gold);
      setState((prev) => ({ ...resetState, gold: prev.gold }));
      return;
    }
    if (!persistedState) return;
    const next = normalizePersistedGardenState(persistedState, state.gold);
    const nextKey = JSON.stringify(withoutSharedGold(next));
    const sync = syncRef.current;
    const isAckEcho = nextKey === sync.lastSent || nextKey === sync.inFlightKey || nextKey === sync.pendingKey;
    if (isAckEcho) {
      externalStateKeyRef.current = nextKey;
      return;
    }
    if (nextKey === externalStateKeyRef.current) return;
    if (Number(next.economicRevision || 0) > Number(stateRef.current.economicRevision || 0)) {
      syncedEarnedRef.current = next.acknowledgedEarnedTotal ?? next.totalGoldEarned;
      sync.lastSent = nextKey; sync.pending = null; sync.pendingKey = '';
      externalStateKeyRef.current = nextKey;
      setState(prev => ({ ...reconcileGardenCheckpoint(prev, next), gold: prev.gold, offlineEarnings: prev.offlineEarnings, offlineXp: prev.offlineXp }));
      return;
    }
    const hasLocalUnsyncedState =
      currentStateKeyRef.current !== sync.lastSent ||
      !!sync.pending ||
      !!sync.inFlight ||
      !!sync.inFlightKey;
    if (hasLocalUnsyncedState) {
      externalStateKeyRef.current = nextKey;
      return;
    }
    externalStateKeyRef.current = nextKey;
    syncedEarnedRef.current = next.acknowledgedEarnedTotal ?? next.totalGoldEarned;
    setState((prev) => ({
      ...next,
      gold: prev.gold,
      offlineEarnings: prev.offlineEarnings,
    }));
  }, [persistedState, persistedStateKey, state.gold]);

  useEffect(() => {
    if (haltedRef.current || !resetPendingRef.current || !onGardenReset) return;
    let cancelled = false;
    const runReset = async () => {
      const result = await onGardenReset();
      if (cancelled) return;
      resetPendingRef.current = false;
      if (result && !result.error && result.garden) {
        const next = normalizePersistedGardenState(result.garden, state.gold);
        syncedEarnedRef.current = next.acknowledgedEarnedTotal ?? next.totalGoldEarned;
        setState((prev) => ({ ...next, gold: prev.gold }));
      }
    };
    void runReset();
    return () => {
      cancelled = true;
    };
  }, [onGardenReset, persistedStateKey, state.gold]);

  useEffect(() => {
    if (haltedRef.current) return;
    const nextPersisted = withoutSharedGold(state);
    const nextKey = JSON.stringify(nextPersisted);
    currentStateKeyRef.current = nextKey;
    try {
      writeGardenLocalState(localStorage, accountId, nextPersisted);
    } catch {
      // Account-bound recovery copies are best-effort; legacy unscoped data stays untouched.
    }
    if (resetPendingRef.current) return;
    if (economicPendingRef.current || creditPendingRef.current || !onStateSync || nextKey === syncRef.current.lastSent) return;

    syncRef.current.pending = nextPersisted;
    syncRef.current.pendingKey = nextKey;

    const flush = async () => {
      if (haltedRef.current || economicPendingRef.current || creditPendingRef.current) return;
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
      syncRef.current.inFlightKey = outgoingKey;
      syncRef.current.lastAt = Date.now();
      let result: any;
      try {
        syncPromiseRef.current = Promise.resolve(onStateSync(outgoing));
        result = await syncPromiseRef.current;
      } catch { result = { error: 'NETWORK_ERROR' }; }
      finally { syncPromiseRef.current = null; }
      syncRef.current.inFlight = false;
      syncRef.current.inFlightKey = '';
      if (!result?.error) {
        syncRef.current.lastSent = outgoingKey;
        externalStateKeyRef.current = outgoingKey;
      } else if (result?.snapshot?.garden && ['GARDEN_REVISION_CONFLICT','GARDEN_ECONOMIC_STATE_CONFLICT','GARDEN_STATE_STALE'].includes(result.error)) {
        adoptServerGarden(result, true);
      } else if (!syncRef.current.pending) {
        syncRef.current.pending = outgoing;
        syncRef.current.pendingKey = outgoingKey;
      }
      if (syncRef.current.pending && !haltedRef.current) {
        syncRef.current.timer = window.setTimeout(flush, 2500);
      }
    };

    const delay = Math.max(0, 2500 - (Date.now() - syncRef.current.lastAt));
    if (delay === 0) {
      void flush();
    } else if (!syncRef.current.timer) {
      syncRef.current.timer = window.setTimeout(flush, delay);
    }
  }, [accountId, state, onStateSync, accountingReady]);

  useEffect(() => () => {
    if (syncRef.current.timer) {
      window.clearTimeout(syncRef.current.timer);
      syncRef.current.timer = null;
    }
    if (!haltedRef.current && !economicPendingRef.current && !creditPendingRef.current && syncRef.current.pending && onStateSync) {
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
      xp: state.xp,
      xpRequired: state.xpRequired,
      levelReady: state.levelReady,
      questReadyCount: getGardenReadyQuestCount(state),
    });
  }, [onHudChange, state.claimedQuests, state.dailyQuests, state.level, state.levelReady, state.plants, state.shelvesUnlocked, state.xp, state.xpRequired]);

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
    setState((prev) => applyGardenRewards(prev, { gold: earned }));
  };

  const adoptServerGarden = (result: GoldDeltaResult, preserveGrowth = false) => {
    const raw = result.snapshot?.garden || result.garden;
    if (!raw) return;
    const next = normalizePersistedGardenState(raw, stateRef.current.gold);
    syncedEarnedRef.current = next.acknowledgedEarnedTotal ?? next.totalGoldEarned;
    const value = preserveGrowth ? reconcileGardenCheckpoint(stateRef.current, next) : next;
    const key = JSON.stringify(withoutSharedGold(next));
    syncRef.current.lastSent = key;
    syncRef.current.pending = null; syncRef.current.pendingKey = '';
    externalStateKeyRef.current = key;
    setState(prev => ({ ...value, gold: prev.gold, offlineEarnings: prev.offlineEarnings, offlineXp: prev.offlineXp }));
  };
  useEffect(() => {
    if (reconciledState?.garden) adoptServerGarden({ garden: reconciledState.garden });
  }, [reconciledState?.nonce]);
  const runEconomicAction = async (action: string, payload: object) => {
    if (!onEconomicAction || !accountingReady || economicPendingRef.current || creditPendingRef.current) return false;
    economicPendingRef.current = true;
    if (syncRef.current.timer) { clearTimeout(syncRef.current.timer); syncRef.current.timer = null; }
    try {
      await syncPromiseRef.current;
      const result = await onEconomicAction(action, payload, withoutSharedGold(stateRef.current));
      if (result?.error || result?.pending || result?.receiptConfirmed !== true) {
        if (result?.snapshot?.garden) adoptServerGarden(result, true);
        return false;
      }
      adoptServerGarden(result);
      return !result.recoveredAction || result.recoveredAction === action;
    } finally { economicPendingRef.current = false; if (mountedRef.current) setCreditRetry(value => value + 1); }
  };
  useEffect(() => {
    if (!onEarnedCredit) {
      // The production Hub explicitly supplies the durable credit coordinator;
      // never silently fall back to an unacknowledged fire-and-forget credit.
      return;
    }
    if (haltedRef.current || economicPendingRef.current) return;
    if (!accountingReady || creditPendingRef.current) return;
    const total = stateRef.current.totalGoldEarned;
    if (total <= syncedEarnedRef.current) return;
    creditPendingRef.current = true;
    if (syncRef.current.timer) { clearTimeout(syncRef.current.timer); syncRef.current.timer = null; }
    let timer: ReturnType<typeof setTimeout>;
    const credit = async () => {
      try {
        await syncPromiseRef.current;
        const result = await onEarnedCredit(withoutSharedGold(stateRef.current));
        if (!mountedRef.current) return;
        if (!result?.error && !result?.pending && result?.receiptConfirmed === true) {
          if (result.recoveredAction && result.recoveredAction !== 'garden.creditEarned') adoptServerGarden(result, true);
          const confirmed = result.snapshot?.garden || result.garden;
          const acknowledged = Number(confirmed?.acknowledgedEarnedTotal ?? result.acknowledgedEarnedTotal);
          if (Number.isFinite(acknowledged)) syncedEarnedRef.current = Math.max(syncedEarnedRef.current, acknowledged);
          setState(prev => ({ ...prev, acknowledgedEarnedTotal: syncedEarnedRef.current }));
        } else if (result?.snapshot?.garden) adoptServerGarden(result, true);
      } catch {
        // Leave the durable batch unacknowledged; the next retry keeps its ID.
      } finally {
        creditPendingRef.current = false;
        if (mountedRef.current && !haltedRef.current) timer = setTimeout(() => setCreditRetry(value => value + 1), 2500);
      }
    };
    void credit();
    return () => { if (timer) clearTimeout(timer); };
  }, [accountingReady, onEarnedCredit, state.totalGoldEarned, creditRetry]);

  useInterval(() => {
    if (haltedRef.current || economicPendingRef.current) return;
    setState((s) => {
      const now = Date.now();
      const dtMs = now - s.lastTick;
      const dtSeconds = dtMs / 1000;

      if (dtSeconds < 1 && s.lastTick !== defaultState.lastTick) return s;

      let totalProd = 0;
      let totalXpRate = 0;
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
             totalXpRate += getPassiveXpRate(def.basePassiveXp, newPlants[i].level);
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

      const offline = dtMs >= OFFLINE_EARNINGS_MIN_AWAY_MS && s.lastTick !== defaultState.lastTick;
      const effectiveDtMs = offline ? Math.min(dtMs, GARDEN_OFFLINE_CAP_MS) : dtMs;
      const effectiveSeconds = Math.max(0, effectiveDtMs / 1000);
      const goldRatio = offline ? GARDEN_OFFLINE_GOLD_RATIO : 1;
      const xpRatio = offline ? GARDEN_OFFLINE_XP_RATIO : 1;
      const goldRaw = (Number(s.passiveGoldBuffer) || 0) + totalProd * effectiveSeconds * goldRatio;
      const xpRaw = (Number(s.passiveXpBuffer) || 0) + totalXpRate * effectiveSeconds * xpRatio;
      const generated = Math.floor(goldRaw);
      const generatedXp = Math.floor(xpRaw);
      const passiveGoldBuffer = goldRaw - generated;
      const passiveXpBuffer = xpRaw - generatedXp;

      let newOfflineEarnings = s.offlineEarnings;
      let newOfflineXp = s.offlineXp;
      if (offline && generated > 0) {
         newOfflineEarnings = (s.offlineEarnings || 0) + generated;
      }
      if (offline && generatedXp > 0) {
         newOfflineXp = (s.offlineXp || 0) + generatedXp;
      }

      if (generated > 0 || generatedXp > 0 || needsPlantUpdate || passiveGoldBuffer !== s.passiveGoldBuffer || passiveXpBuffer !== s.passiveXpBuffer) {
        return {
          ...applyGardenRewards(s, { gold: generated, xp: generatedXp }),
          lastTick: now,
          offlineEarnings: newOfflineEarnings,
          offlineXp: newOfflineXp,
          passiveGoldBuffer,
          passiveXpBuffer,
          plants: needsPlantUpdate ? newPlants : s.plants
        };
      }

      return { ...s, lastTick: now };
    });
  }, 1000);

  const clearOfflineEarnings = () => {
    setState(s => ({ ...s, offlineEarnings: null, offlineXp: null }));
  };

  const levelUp = async () => {
    if (onEconomicAction) return runEconomicAction('garden.levelUp', {});
    if (haltedRef.current || economicPendingRef.current) return;
    if (levelUpPendingRef.current) return;
    if (!state.levelReady) return;
    levelUpPendingRef.current = true;
    if (onGardenLevelUp) {
      try {
        const result = await onGardenLevelUp();
        if (result?.error) return;
        if (result?.garden) {
          const next = normalizePersistedGardenState(result.garden, state.gold);
          syncedEarnedRef.current = next.acknowledgedEarnedTotal ?? next.totalGoldEarned;
          setState((prev) => ({ ...next, gold: prev.gold }));
        }
      } finally {
        levelUpPendingRef.current = false;
      }
      return;
    }

    const reward = getGardenLevelReward(state.level);
    setState((prev) => {
      if (!prev.levelReady) return prev;
      const nextLevel = prev.level + 1;
      return {
        ...prev,
        dailyQuests: recordGardenDailyProgress(prev.dailyQuests, { levelUps: 1 }),
        level: nextLevel,
        xp: 0,
        xpRequired: getGardenXpRequired(nextLevel),
        levelReady: false,
        totalGoldEarned: prev.totalGoldEarned + reward,
      };
    });
    levelUpPendingRef.current = false;
  };

  const claimQuest = async (questId: string, reward: number) => {
    if (onEconomicAction) return runEconomicAction('garden.claimQuest', { questId });
    const safeQuestId = String(questId || '').trim();
    const goldReward = Math.max(0, Math.floor(Number(reward) || 0));
    if (!/^[a-z0-9_-]{1,48}$/.test(safeQuestId)) return;
    const dailyQuest = isGardenDailyQuestId(safeQuestId);
    const dailyState = normalizeGardenDailyQuestState(state.dailyQuests);
    const alreadyClaimed = dailyQuest
      ? dailyState.claimed.includes(safeQuestId)
      : state.claimedQuests.includes(safeQuestId);
    if (questPendingRef.current.has(safeQuestId) || alreadyClaimed || goldReward <= 0) return;
    questPendingRef.current.add(safeQuestId);
    try {
      const result = await commitGoldDelta(goldReward, `quest:${safeQuestId}`);
      if (result.error) return;
      // This reward is already in shared gold. Acknowledge only its successful
      // credit so the earnings effect still sends any unrelated passive income.
      syncedEarnedRef.current += goldReward;
      setState((prev) => {
        if (dailyQuest) {
          const nextDaily = normalizeGardenDailyQuestState(prev.dailyQuests);
          if (nextDaily.claimed.includes(safeQuestId)) return prev;
          return applyGardenRewards({
            ...prev,
            dailyQuests: {
              ...nextDaily,
              claimed: [...nextDaily.claimed, safeQuestId],
            },
          }, { gold: goldReward }, { trackDaily: false });
        }
        if (prev.claimedQuests.includes(safeQuestId)) return prev;
        return applyGardenRewards({
          ...prev,
          claimedQuests: [...prev.claimedQuests, safeQuestId],
        }, { gold: goldReward }, { trackDaily: false });
      });
    } finally {
      questPendingRef.current.delete(safeQuestId);
    }
  };

  const buyPlant = async (type: keyof typeof PLANT_TYPES, shelfIndex: number, spotIndex: number) => {
    if (onEconomicAction) return runEconomicAction('garden.buyPlant', { type, shelfIndex, spotIndex });
    const def = PLANT_TYPES[type];
    if (!getUnlockedPlantIds(state.level).includes(type)) return;
    if (state.gold >= def.baseCost) {
      const result = await commitGoldDelta(-def.baseCost, 'buyPlant');
      if (result.error) return;
      setState((prev) => ({
        ...prev,
        dailyQuests: recordGardenDailyProgress(prev.dailyQuests, { plantsBought: 1 }),
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
    if (onEconomicAction) return runEconomicAction('garden.upgradePlant', { plantId });
    const plant = state.plants.find((p) => p.id === plantId);
    if (!plant) return;
    const def = PLANT_TYPES[plant.type] || PLANT_TYPES.daisy;
    const cost = getUpgradeCost(def.baseCost, plant.level);
    if (state.gold < cost) return;

    const result = await commitGoldDelta(-cost, 'upgradePlant');
    if (result.error) return;

      setState((prev) => ({
        ...prev,
        dailyQuests: recordGardenDailyProgress(prev.dailyQuests, { upgrades: 1 }),
        plants: prev.plants.map((p) =>
        p.id === plantId ? { ...p, level: p.level + 1 } : p
      ),
    }));
  };

  const sellPlant = async (plantId: string) => {
    if (onEconomicAction) return runEconomicAction('garden.sellPlant', { plantId });
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
    if (onEconomicAction) return runEconomicAction('garden.unlockShelf', {});
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
    if (haltedRef.current) return;
    if (haltedRef.current || economicPendingRef.current) return;
     setState(prev => {
        const plant = prev.plants.find(p => p.id === plantId);
        if (!plant) return prev;
        const now = Date.now();
        if (plant.lastTapped && now - plant.lastTapped < getGardenTapCooldownMs(plant.phase)) return prev;

        if (plant.phase === 3) {
            const def = PLANT_TYPES[plant.type] || PLANT_TYPES.daisy;
            const gold = getClickReward(def.baseClick, plant.level);
            const xp = getClickXpReward(def.baseXp, plant.level);
            return applyGardenRewards({
              ...prev,
              dailyQuests: recordGardenDailyProgress(prev.dailyQuests, { taps: 1 }),
              plants: prev.plants.map(p => p.id === plantId ? { ...p, lastTapped: now } : p),
            }, { gold, xp });
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
               dailyQuests: recordGardenDailyProgress(prev.dailyQuests, { taps: 1 }),
               plants: prev.plants.map(p => p.id === plantId ? { ...p, phase: newPhase, phaseProgress: newProgress, lastTapped: now } : p)
            };
        }
     });
  };

  const renameGarden = (name: string) => {
    if (haltedRef.current) return;
    const nextName = normalizeGardenName(name);
    setState((prev) => (prev.name === nextName ? prev : { ...prev, name: nextName }));
  };

  const waterPlant = (plantId: string) => {
    if (haltedRef.current) return;
    if (haltedRef.current || economicPendingRef.current) return;
     setState(prev => {
        const plant = prev.plants.find(p => p.id === plantId);
        if (!plant) return prev;

        const now = Date.now();
        if (plant.lastWatered && now - plant.lastWatered < getGardenWaterCooldownMs(plant.phase)) {
            return prev;
        }

        if (plant.phase === 3) {
            const def = PLANT_TYPES[plant.type] || PLANT_TYPES.daisy;
            return applyGardenRewards({
              ...prev,
              dailyQuests: recordGardenDailyProgress(prev.dailyQuests, { waters: 1 }),
              plants: prev.plants.map(p => p.id === plantId ? { ...p, lastWatered: now } : p),
            }, getMatureWaterReward(def.baseClick, def.baseXp, plant.level));
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
            dailyQuests: recordGardenDailyProgress(prev.dailyQuests, { waters: 1 }),
            plants: prev.plants.map(p => p.id === plantId ? { ...p, phase: newPhase, phaseProgress: newProgress, lastWatered: now } : p)
         };
     })
  };

  const movePlantToInventory = (plantId: string) => {
    if (haltedRef.current) return;
     setState(prev => ({
        ...prev,
        plants: prev.plants.map(p => p.id === plantId ? { ...p, spotIndex: -1, shelfIndex: -1 } : p)
     }));
  };

  const movePlantToShelf = (plantId: string, shelfIndex: number, spotIndex: number) => {
    if (haltedRef.current) return;
     setState(prev => ({
        ...prev,
        plants: prev.plants.map(p => p.id === plantId ? { ...p, spotIndex, shelfIndex } : p)
     }));
  };

  const unlockedPlants = getUnlockedPlantIds(state.level);

  return (
    <GameContext.Provider
      value={{
        accountingReady,
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
        levelUp,
        claimQuest,
        renameGarden,
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
