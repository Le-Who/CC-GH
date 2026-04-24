import { create } from "zustand";
import { api } from "../services/apiClient.js";
import { haptic } from "../platform/telegram.js";
import { withNormalizedSnapshot } from "./inventory.js";

function actionLabel(action) {
  return action?.replace(".", " ") || "action";
}

export const useGameHub = create((set, get) => ({
  activeTab: "farm",
  snapshot: null,
  status: "booting",
  message: "",
  busy: {},
  lastResult: null,

  setActiveTab: (activeTab) => set({ activeTab, message: "" }),

  applySnapshot: (snapshot) => {
    if (!snapshot) return;
    set({ snapshot: withNormalizedSnapshot(snapshot), status: "ready" });
  },

  loadSnapshot: async () => {
    set({ status: "syncing" });
    const result = await api("/api/player/snapshot");
    if (result.error) {
      set({ status: "offline", message: result.error });
      return result;
    }
    const snapshot = withNormalizedSnapshot(result);
    set({ snapshot, status: "ready", message: "" });
    return snapshot;
  },

  performAction: async (action, payload = {}, options = {}) => {
    const key = options.key || action;
    if (get().busy[key]) return { error: "busy" };
    set((state) => ({ busy: { ...state.busy, [key]: true }, message: "" }));
    const result = await api("/api/player/mutate", { action, payload }, { timeoutMs: options.timeoutMs || 9000 });
    set((state) => {
      const busy = { ...state.busy };
      delete busy[key];
      if (result.error) {
        return {
          busy,
          message: result.error,
          lastResult: result,
        };
      }
      const snapshot = result.snapshot
        ? withNormalizedSnapshot(result.snapshot)
        : state.snapshot;
      return {
        busy,
        snapshot,
        message: options.silent ? "" : options.successMessage || "",
        lastResult: result,
        status: "ready",
      };
    });
    haptic(result.error ? "warning" : "success");
    return result;
  },

  isBusy: (key) => !!get().busy[key],

  applyRealtimePayload: (payload) => {
    if (!payload) return;
    set((state) => {
      const prev = state.snapshot;
      if (!prev) return state;
      const next = {
        ...prev,
        resources: payload.resources
          ? {
              ...prev.resources,
              ...payload.resources,
              harvested: payload.harvested || prev.resources?.harvested,
              harvestedCrops: payload.harvested || prev.resources?.harvestedCrops,
            }
          : prev.resources,
        farm: payload.plots
          ? {
              ...prev.farm,
              plots: payload.plots,
              harvested: payload.harvested || prev.farm?.harvested,
            }
          : prev.farm,
        merge: payload.merge ? { ...prev.merge, ...payload.merge } : prev.merge,
        pet: payload.pet || prev.pet,
        achievements: payload.achievements
          ? { ...prev.achievements, raw: payload.achievements }
          : prev.achievements,
      };
      return { snapshot: withNormalizedSnapshot(next) };
    });
  },

  clearMessage: () => set({ message: "" }),
  actionLabel,
}));
