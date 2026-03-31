/**
 * ═══════════════════════════════════════════════════════
 *  useFarmEngine — React/Zustand hook for Farm state
 *
 *  Owns all farm state: plots, inventory, harvested, crops config,
 *  selectedSeed, buyQty, clockDelta. Provides typed actions that
 *  vanilla farm.js can progressively migrate to.
 *
 *  This hook replaces the manual GameStore.registerSlice('farm')
 *  + syncToStore()/syncFromStore() bridge pattern.
 *
 *  Usage in React:
 *    const { plots, inventory, plant, harvest } = useFarmEngine();
 *
 *  Usage in Vanilla JS (via store export):
 *    import { farmStore } from '@/hooks/useFarmEngine';
 *    farmStore.getState().plant(0, 'strawberry');
 * ═══════════════════════════════════════════════════════
 */
import { create } from "zustand";
import { CROPS as CROPS_CONFIG, getUnlockedSeeds } from "/game-logic.js";

/**
 * Zustand store — the single source of truth for farm state.
 * Both React components and vanilla JS can read/write this store.
 */
export const farmStore = create((set, get) => ({
  // ─── State ───
  plots: [],
  inventory: {},
  harvested: {},
  coins: 0,
  xp: 0,
  level: 1,
  selectedSeed: null,
  buyQty: 1,
  clockDelta: 0, // Server-client clock offset (ms)
  crops: {}, // Dynamic crops config from API
  isLoading: true,
  streak: null,
  cosmetics: null,
  boosters: null,
  seasonPass: null,
  questsCompleted: 0, // Synced from /api/farm/state & quest submit responses

  // ─── Computed ───
  getServerNow: () => Date.now() + get().clockDelta,

  getLocalGrowth: (plot) => {
    if (!plot?.crop || !plot?.plantedAt) return 0;
    const cfg = get().crops[plot.crop] || CROPS_CONFIG[plot.crop];
    if (!cfg?.growthTime) return 0;
    const elapsed = get().getServerNow() - plot.plantedAt;
    const waterMult = plot.watered ? cfg.waterMultiplier || 1.5 : 1;
    return Math.min(1, (elapsed * waterMult) / cfg.growthTime);
  },

  getUnlockedSeeds: () => {
    const { harvested, plots, questsCompleted, stats } = get();
    let totalHarvests = stats?.totalHarvests || 0;
    if (totalHarvests === 0 && harvested) {
      for (const key in harvested) {
        if (Object.hasOwn(harvested, key)) {
          totalHarvests += harvested[key];
        }
      }
    }
    return getUnlockedSeeds({
      totalHarvests,
      goldEarned: stats?.totalGoldEarned || 0,
      questsCompleted: questsCompleted || 0,
      plotsBought: plots?.length || 6,
      daysActive: 1,
    });
  },

  getReadyPlots: () => {
    const { plots, getLocalGrowth } = get();
    return plots
      .map((p, i) => ({ index: i, plot: p, growth: getLocalGrowth(p) }))
      .filter(({ plot, growth }) => plot.crop && growth >= 1);
  },

  // ─── Actions ───
  setFarmState: (serverData) =>
    set({
      plots: serverData.plots || [],
      inventory: serverData.inventory || {},
      harvested: serverData.harvested || {},
      coins: serverData.coins || 0,
      xp: serverData.xp || 0,
      level: serverData.level || 1,
      isLoading: false,
      streak: serverData.streak || null,
      cosmetics: serverData.cosmetics || null,
      boosters: serverData.boosters || null,
      seasonPass: serverData.seasonPass || null,
      questsCompleted: serverData.questsCompleted || 0,
      stats: serverData.stats || null,
    }),

  updateClockDelta: (serverTime) => {
    if (typeof serverTime === "number" && serverTime > 0) {
      set({ clockDelta: serverTime - Date.now() });
    }
  },

  setCrops: (cropsData) => set({ crops: cropsData }),

  selectSeed: (seedId) => {
    set({ selectedSeed: seedId });
  },

  setBuyQty: (qty) => {
    set({ buyQty: Math.max(1, Math.min(99, qty)) });
  },

  // Optimistic plot update
  updatePlot: (index, update) =>
    set((state) => ({
      plots: state.plots.map((p, i) => (i === index ? { ...p, ...update } : p)),
    })),

  // Optimistic inventory update
  updateInventory: (seedId, delta) =>
    set((state) => ({
      inventory: {
        ...state.inventory,
        [seedId]: Math.max(0, (state.inventory[seedId] || 0) + delta),
      },
    })),

  // Optimistic harvested update
  addHarvested: (cropId, qty = 1) =>
    set((state) => ({
      harvested: {
        ...state.harvested,
        [cropId]: (state.harvested[cropId] || 0) + qty,
      },
    })),

  // Optimistic gold update
  addGold: (amount) =>
    set((state) => ({
      coins: state.coins + amount,
    })),

  // Clear a plot (after harvest)
  clearPlot: (index) =>
    set((state) => ({
      plots: state.plots.map((p, i) =>
        i === index
          ? { ...p, crop: null, plantedAt: null, watered: false, growth: 0 }
          : p,
      ),
    })),

  // Add a new plot
  addPlot: () =>
    set((state) => ({
      plots: [
        ...state.plots,
        {
          id: state.plots.length,
          crop: null,
          plantedAt: null,
          watered: false,
        },
      ],
    })),

  // Full state snapshot for rollback
  snapshot: () => {
    const { plots, inventory, harvested, coins, xp, level } = get();
    return {
      plots: plots.map((p) => ({ ...p })),
      inventory: { ...inventory },
      harvested: { ...harvested },
      coins,
      xp,
      level,
    };
  },

  rollback: (snap) => set(snap),
}));

/**
 * React hook — use in React components.
 * Re-renders only when subscribed fields change.
 */
export function useFarmEngine() {
  return farmStore();
}

/**
 * Selector hooks for granular subscriptions.
 */
export const useFarmPlots = () => farmStore((s) => s.plots);
export const useFarmInventory = () => farmStore((s) => s.inventory);
export const useFarmHarvested = () => farmStore((s) => s.harvested);
export const useFarmLoading = () => farmStore((s) => s.isLoading);
export const useSelectedSeed = () => farmStore((s) => s.selectedSeed);

export const useHasFarmItems = () =>
  farmStore((s) => {
    const inv = s.inventory;
    if (!inv) return false;
    for (const key in inv) {
      if (Object.hasOwn(inv, key) && inv[key] > 0) return true;
    }
    return false;
  });
