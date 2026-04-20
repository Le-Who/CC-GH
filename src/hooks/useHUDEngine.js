/**
 * ═══════════════════════════════════════════════════════
 *  useHUDEngine — React/Zustand hook for HUD resources state
 *
 *  Owns: gold, energy (current/max/lastRegenTimestamp),
 *  harvestedCrops, gachaTokens.
 *
 *  Eliminates the redundant 'shared' slice — React components
 *  subscribe directly to this store instead.
 *
 *  Usage in React:
 *    const { gold, energy, hasEnergy } = useHUDEngine();
 *
 *  Usage in Vanilla JS:
 *    import { hudStore } from '@/hooks/useHUDEngine';
 *    hudStore.getState().hasEnergy(5);
 * ═══════════════════════════════════════════════════════
 */
import { create } from "zustand";

const ENERGY_REGEN_INTERVAL_MS = 150_000; // 2.5 min — matches game-logic.js

export const hudStore = create((set, get) => ({
  // ─── State ───
  gold: 0,
  energy: {
    current: 0,
    max: 20,
    lastRegenTimestamp: Date.now(),
  },
  harvestedCrops: {},
  gachaTokens: 0,
  activeQuests: 0,

  // ─── Computed ───
  hasEnergy: (amount) => get().energy.current >= amount,
  getGold: () => get().gold,
  getEnergy: () => get().energy.current,
  getMaxEnergy: () => get().energy.max,

  energyPct: () => {
    const { energy } = get();
    return energy.max > 0 ? Math.round((energy.current / energy.max) * 100) : 0;
  },

  regenProgress: () => {
    const { energy } = get();
    if (energy.current >= energy.max) return 0;
    const elapsed = Date.now() - energy.lastRegenTimestamp;
    return Math.min(100, (elapsed / ENERGY_REGEN_INTERVAL_MS) * 100);
  },

  nextRegenIn: () => {
    const { energy } = get();
    if (energy.current >= energy.max) return null;
    const elapsed = Date.now() - energy.lastRegenTimestamp;
    const remaining =
      ENERGY_REGEN_INTERVAL_MS - (elapsed % ENERGY_REGEN_INTERVAL_MS);
    return {
      totalMs: remaining,
      mins: Math.floor(remaining / 60000),
      secs: Math.floor((remaining % 60000) / 1000),
    };
  },

  formatGold: () => {
    const { gold } = get();
    if (gold >= 10000) return (gold / 1000).toFixed(1) + "k";
    return String(gold);
  },

  // ─── Actions ───
  setResources: (resources) => {
    if (!resources) return;
    const harvestedCrops = resources.harvestedCrops ?? resources.harvested;
    set({
      gold: resources.gold ?? get().gold,
      energy: resources.energy ?? get().energy,
      harvestedCrops: harvestedCrops ?? get().harvestedCrops,
      gachaTokens: resources.gachaTokens ?? get().gachaTokens,
    });
  },

  /**
   * Smart merge from server — preserves local regen timestamp if newer,
   * preserves local harvestedCrops if server doesn't include it.
   */
  syncFromServer: (resources) => {
    if (!resources) return;
    const local = get();
    const merged = { ...resources };
    const serverHarvestedCrops =
      resources.harvestedCrops ?? resources.harvested;

    // Don't jump regen bar backward
    if (local.energy?.lastRegenTimestamp && resources.energy) {
      const serverTs = resources.energy.lastRegenTimestamp || 0;
      const localTs = local.energy.lastRegenTimestamp || 0;
      if (localTs > serverTs) {
        merged.energy = { ...resources.energy, lastRegenTimestamp: localTs };
      }
    }

    // Preserve local harvestedCrops if server omits them
    if (
      Object.keys(local.harvestedCrops).length > 0 &&
      serverHarvestedCrops === undefined
    ) {
      merged.harvested = local.harvestedCrops;
      merged.harvestedCrops = local.harvestedCrops;
    }

    set({
      gold: merged.gold ?? local.gold,
      energy: merged.energy ?? local.energy,
      harvestedCrops:
        (merged.harvestedCrops ?? merged.harvested) ?? local.harvestedCrops,
      gachaTokens: merged.gachaTokens ?? local.gachaTokens,
    });
  },

  addGold: (amount) => set((s) => ({ gold: s.gold + amount })),

  addEnergy: (amount) =>
    set((s) => ({
      energy: {
        ...s.energy,
        current: Math.min(s.energy.max, s.energy.current + amount),
      },
    })),

  tickRegen: () => {
    const { energy } = get();
    if (energy.current >= energy.max) return;
    const now = Date.now();
    const delta = now - energy.lastRegenTimestamp;
    const ticks = Math.floor(delta / ENERGY_REGEN_INTERVAL_MS);
    if (ticks > 0) {
      const newCurrent = Math.min(energy.max, energy.current + ticks);
      const newTs =
        newCurrent < energy.max
          ? now - (delta % ENERGY_REGEN_INTERVAL_MS)
          : now;
      set({
        energy: {
          ...energy,
          current: newCurrent,
          lastRegenTimestamp: newTs,
        },
      });
    }
  },

  updateHarvestedCrops: (cropId, delta) =>
    set((s) => {
      const newHarvested = { ...s.harvestedCrops };
      newHarvested[cropId] = Math.max(0, (newHarvested[cropId] || 0) + delta);
      if (newHarvested[cropId] <= 0) delete newHarvested[cropId];
      return { harvestedCrops: newHarvested };
    }),
  updateHarvested: (cropId, delta) =>
    get().updateHarvestedCrops(cropId, delta),

  setActiveQuests: (count) => set({ activeQuests: count }),

  snapshot: () => {
    const s = get();
    return {
      gold: s.gold,
      energy: { ...s.energy },
      harvestedCrops: { ...s.harvestedCrops },
      gachaTokens: s.gachaTokens,
    };
  },

  rollback: (snap) => set(snap),
}));

export function useHUDEngine() {
  return hudStore();
}

export const useGold = () => hudStore((s) => s.gold);
export const useEnergy = () => hudStore((s) => s.energy);
export const useHarvestedCrops = () => hudStore((s) => s.harvestedCrops);
export const useHarvested = useHarvestedCrops;
export const useGachaTokens = () => hudStore((s) => s.gachaTokens);
export const useActiveQuests = () => hudStore((s) => s.activeQuests);
