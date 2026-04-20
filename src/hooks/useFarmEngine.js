/**
 * ═══════════════════════════════════════════════════════
 *  useFarmEngine — React/Zustand hook for Farm state
 *
 *  Owns all farm state: plots, seedInventory, crops config,
 *  selectedSeed, buyQty, clockDelta. Provides typed actions that
 *  vanilla farm.js can progressively migrate to.
 *
 *  This hook replaces the manual GameStore.registerSlice('farm')
 *  + syncToStore()/syncFromStore() bridge pattern.
 *
 *  Usage in React:
 *    const { plots, seedInventory, plant, harvest } = useFarmEngine();
 *
 *  Usage in Vanilla JS (via store export):
 *    import { farmStore } from '@/hooks/useFarmEngine';
 *    farmStore.getState().plant(0, 'strawberry');
 * ═══════════════════════════════════════════════════════
 */
import { create } from "zustand";
import { CROPS as CROPS_CONFIG, getUnlockedSeeds } from "/game-logic.js";
import { hudStore } from "./useHUDEngine.js";

/**
 * Zustand store — the single source of truth for farm state.
 * Both React components and vanilla JS can read/write this store.
 */
export const farmStore = create((set, get) => ({
  // ─── State ───
  plots: [],
  seedInventory: {},
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
    const { plots, questsCompleted, stats } = get();
    const harvestedCrops = hudStore.getState().harvestedCrops || {};
    let totalHarvests = stats?.totalHarvests || 0;
    if (totalHarvests === 0 && harvestedCrops) {
      for (const key in harvestedCrops) {
        if (Object.hasOwn(harvestedCrops, key)) {
          totalHarvests += harvestedCrops[key];
        }
      }
    }
    return getUnlockedSeeds({
      totalHarvests,
      goldEarned: stats?.totalGoldEarned || 0,
      questsCompleted: questsCompleted || 0,
      plotsBought: plots?.length || 6,
      bestStreak: get().streak?.best || 1,
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
      seedInventory: serverData.inventory || {},
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

  // Optimistic seed inventory update
  updateSeedInventory: (seedId, delta) =>
    set((state) => ({
      seedInventory: {
        ...state.seedInventory,
        [seedId]: Math.max(0, (state.seedInventory[seedId] || 0) + delta),
      },
    })),
  updateInventory: (seedId, delta) => get().updateSeedInventory(seedId, delta),

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
    const { plots, seedInventory, coins, xp, level } = get();
    return {
      plots: plots.map((p) => ({ ...p })),
      seedInventory: { ...seedInventory },
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
export const useSeedInventory = () => farmStore((s) => s.seedInventory);
export const useFarmInventory = useSeedInventory;
export const useHarvestedCrops = () => hudStore((s) => s.harvestedCrops);
export const useFarmHarvested = useHarvestedCrops;
export const useFarmLoading = () => farmStore((s) => s.isLoading);
export const useSelectedSeed = () => farmStore((s) => s.selectedSeed);

export const useHasFarmItems = () =>
  farmStore((s) => {
    const seedInventory = s.seedInventory;
    if (!seedInventory) return false;
    for (const key in seedInventory) {
      if (Object.hasOwn(seedInventory, key) && seedInventory[key] > 0) return true;
    }
    return false;
  });

// ─── Event Integration ───
// Reactively sync quests completed from vanilla module events so
// the React UI (like Golden Rose unlock) updates without a reload.
if (typeof window !== "undefined") {
  window.addEventListener("quest-completed", (e) => {
    if (e.detail && typeof e.detail.questsCompleted === "number") {
      farmStore.setState({ questsCompleted: e.detail.questsCompleted });
    }
  });
}
