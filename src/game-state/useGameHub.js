import { create } from "zustand";
import { get as idbGet, set as idbSet } from "idb-keyval";
import { VISIBLE_GAME_IDS } from "../app/gameRegistry.js";
import { api } from "../services/apiClient.js";
import { audioManager } from "../services/audioManager.js";
import { haptic } from "../platform/telegram.js";
import { withNormalizedSnapshot } from "./inventory.js";
import { createClientActionId, shouldUseDurableOutbox } from "./reliableActions.js";

const YARD_OUTBOX_KEY = "game_hub_yard_outbox_v1";
export const ACTIVE_TAB_STORAGE_KEY = "game_hub_active_tab_v1";
export const ACTIVE_TAB_QUERY_PARAM = "tab";
const ACTIVE_TAB_IDS = new Set(VISIBLE_GAME_IDS);
const RETRY_DELAYS_MS = [0, 2000, 5000, 15000, 30000, 60000];
let outboxDrainPromise = null;
let outboxDrainTimer = null;

export function normalizeActiveTab(value) {
  const tab = String(value || "").trim();
  return ACTIVE_TAB_IDS.has(tab) ? tab : "garden";
}

export function readInitialActiveTab() {
  if (typeof window === "undefined") return "garden";
  try {
    const url = new URL(window.location.href);
    const tab = url.searchParams.get(ACTIVE_TAB_QUERY_PARAM);
    if (tab && ACTIVE_TAB_IDS.has(tab)) return tab;
  } catch {
    // Location parsing is best-effort; the app can always start from Garden.
  }
  try {
    return normalizeActiveTab(window.sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY));
  } catch {
    return "garden";
  }
}

function persistActiveTab(activeTab) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
  } catch {
    // Session persistence is only to survive in-place refreshes.
  }
  try {
    const url = new URL(window.location.href);
    if (activeTab === "garden") url.searchParams.delete(ACTIVE_TAB_QUERY_PARAM);
    else url.searchParams.set(ACTIVE_TAB_QUERY_PARAM, activeTab);
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  } catch {
    // History writes are progressive enhancement for cache-busting reloads.
  }
}

function actionLabel(action) {
  return action?.replace(".", " ") || "action";
}

function isYardAction(action) {
  return typeof action === "string" && action.startsWith("yard.");
}

function createYardActionId() {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `yard:${Date.now().toString(36)}:${random}`;
}

function yardEntityKey(action, payload = {}) {
  if (action === "yard.setFood") return `bowl:${payload.bowlId || "bowl-1"}`;
  if (action === "yard.placeGoodie" || action === "yard.pickupGoodie" || action === "yard.fixGoodie" || action === "yard.moveGoodie") return `slot:${payload.slotId || payload.goodieId || "unknown"}`;
  if (action === "yard.collectGifts") return "gifts";
  if (action === "yard.claimDailyLetter") return "dailyLetter";
  if (action === "yard.configureCompanion") return "companion";
  if (action === "yard.setRemodel") return "remodel";
  if (action === "yard.buyExpansion") return "expansion";
  if (action === "yard.buyFood") return `shop:food:${payload.foodId || "unknown"}`;
  if (action === "yard.buyGoodie") return `shop:goodie:${payload.goodieId || "unknown"}`;
  if (action === "yard.capturePhoto" || action === "yard.favoritePhoto") return `album:${payload.visitId || payload.photoId || payload.visitorId || "photo"}`;
  return action;
}

function retryDelay(attempts = 0) {
  return RETRY_DELAYS_MS[Math.min(Math.max(0, attempts), RETRY_DELAYS_MS.length - 1)];
}

function normalizeSnapshot(snapshot) {
  const normalized = withNormalizedSnapshot(snapshot);
  return normalized ? { ...normalized, receivedAt: Date.now() } : normalized;
}

function normalizeOutboxItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => item?.clientActionId && shouldUseDurableOutbox(item.action)).map((item) => ({
    clientActionId: String(item.clientActionId),
    action: String(item.action),
    payload: item.payload && typeof item.payload === "object" ? item.payload : {},
    entityKey: String(item.entityKey || yardEntityKey(item.action, item.payload)),
    pendingLabel: String(item.pendingLabel || actionLabel(item.action)),
    intentServerTime: Number(item.intentServerTime) || Date.now(),
    createdAt: Number(item.createdAt) || Date.now(),
    attempts: Math.max(0, Math.floor(Number(item.attempts) || 0)),
    status: item.status === "sending" ? "pending" : String(item.status || "pending"),
    nextAttemptAt: Math.max(0, Number(item.nextAttemptAt) || 0),
  }));
}

async function readOutboxStorage() {
  try {
    return normalizeOutboxItems(await idbGet(YARD_OUTBOX_KEY));
  } catch {
    try {
      return normalizeOutboxItems(JSON.parse(localStorage.getItem(YARD_OUTBOX_KEY) || "[]"));
    } catch {
      return [];
    }
  }
}

async function writeOutboxStorage(items) {
  const normalized = normalizeOutboxItems(items);
  try {
    await idbSet(YARD_OUTBOX_KEY, normalized);
  } catch {
    try {
      localStorage.setItem(YARD_OUTBOX_KEY, JSON.stringify(normalized));
    } catch {
      // Storage is best-effort; in-memory pending state still protects this session.
    }
  }
}

function scheduleOutboxDrain(get, delayMs = 0) {
  if (outboxDrainTimer) globalThis.clearTimeout(outboxDrainTimer);
  outboxDrainTimer = globalThis.setTimeout(() => {
    outboxDrainTimer = null;
    get().drainOutbox();
  }, Math.max(0, delayMs));
  outboxDrainTimer?.unref?.();
}

export const useGameHub = create((set, get) => ({
  activeTab: readInitialActiveTab(),
  snapshot: null,
  status: "booting",
  message: "",
  busy: {},
  pendingActions: [],
  outboxLoaded: false,
  lastResult: null,
  activeGameShell: null,
  gardenHud: null,

  setActiveTab: (activeTab) => {
    const nextTab = normalizeActiveTab(activeTab);
    persistActiveTab(nextTab);
    set({ activeTab: nextTab, message: "", activeGameShell: null });
  },
  setActiveGameShell: (activeGameShell) => set({ activeGameShell }),
  setGardenHud: (gardenHud) => set({ gardenHud }),

  applySnapshot: (snapshot) => {
    if (!snapshot) return;
    set({ snapshot: normalizeSnapshot(snapshot), status: "ready" });
  },

  loadSnapshot: async () => {
    set({ status: "syncing" });
    const result = await api("/api/player/snapshot");
    if (result.error) {
      set({ status: "offline", message: result.error });
      return result;
    }
    const snapshot = normalizeSnapshot(result);
    set({ snapshot, status: "ready", message: "" });
    scheduleOutboxDrain(get, 0);
    return snapshot;
  },

  performAction: async (action, payload = {}, options = {}) => {
    if (isYardAction(action) && options.outbox !== false) {
      return get().enqueueYardAction(action, payload, options);
    }
    const key = options.key || action;
    if (get().busy[key]) return { error: "busy" };
    set((state) => ({ busy: { ...state.busy, [key]: true }, message: "" }));
    const body = options.clientActionId ? { action, payload, clientActionId: options.clientActionId } : { action, payload };
    const result = await api("/api/player/mutate", body, { timeoutMs: options.timeoutMs || 9000 });
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
        ? normalizeSnapshot(result.snapshot)
        : state.snapshot;
      return {
        busy,
        snapshot,
        message: options.silent ? "" : options.successMessage || "",
        lastResult: result,
        status: "ready",
      };
    });
    if (options.feedback !== false) {
      haptic(result.error ? "warning" : "success");
      audioManager.play(result.error ? "warning" : "success");
    }
    return result;
  },

  performReliableAction: async (action, payload = {}, options = {}) => {
    const durability = options.durability || (shouldUseDurableOutbox(action) ? "outbox" : "receipt");
    const clientActionId = options.clientActionId || createClientActionId(action, options.scope || "game", options.idParts || []);
    if (durability === "outbox") {
      return get().enqueueYardAction(action, payload, { ...options, clientActionId });
    }
    return get().performAction(action, payload, {
      ...options,
      key: options.key || clientActionId,
      clientActionId,
      outbox: false,
    });
  },

  hydrateOutbox: async () => {
    const pendingActions = await readOutboxStorage();
    set({ pendingActions, outboxLoaded: true });
    scheduleOutboxDrain(get, 0);
    return pendingActions;
  },

  enqueueYardAction: async (action, payload = {}, options = {}) => {
    if (!get().outboxLoaded) {
      await get().hydrateOutbox();
    }
    const entityKey = options.entityKey || yardEntityKey(action, payload);
    let queuedItem = null;
    set((state) => {
      let pendingActions = normalizeOutboxItems(state.pendingActions);
      const existingIndex = pendingActions.findIndex((item) => item.entityKey === entityKey && item.status !== "failed");
      if (action === "yard.configureCompanion" && existingIndex >= 0) {
        queuedItem = {
          ...pendingActions[existingIndex],
          payload,
          attempts: 0,
          status: "pending",
          nextAttemptAt: 0,
          intentServerTime: Date.now(),
          pendingLabel: options.pendingLabel || pendingActions[existingIndex].pendingLabel,
        };
        pendingActions = [
          ...pendingActions.slice(0, existingIndex),
          queuedItem,
          ...pendingActions.slice(existingIndex + 1),
        ];
      } else if (existingIndex >= 0) {
        queuedItem = pendingActions[existingIndex];
      } else {
        queuedItem = {
          clientActionId: options.clientActionId || createYardActionId(),
          action,
          payload,
          entityKey,
          pendingLabel: options.pendingLabel || actionLabel(action),
          intentServerTime: Date.now(),
          createdAt: Date.now(),
          attempts: 0,
          status: "pending",
          nextAttemptAt: 0,
        };
        pendingActions = [...pendingActions, queuedItem];
      }
      return {
        pendingActions,
        busy: { ...state.busy, [entityKey]: true },
        message: "",
      };
    });
    await writeOutboxStorage(get().pendingActions);
    scheduleOutboxDrain(get, 0);
    if (options.feedback !== false) {
      haptic("light");
      audioManager.play("tap");
    }
    return { success: true, pending: true, clientActionId: queuedItem.clientActionId, entityKey };
  },

  drainOutbox: async () => {
    if (outboxDrainPromise) return outboxDrainPromise;
    outboxDrainPromise = (async () => {
      if (!get().outboxLoaded) {
        await get().hydrateOutbox();
      }
      const now = Date.now();
      const pending = normalizeOutboxItems(get().pendingActions)
        .filter((item) => item.status !== "failed")
        .sort((a, b) => a.createdAt - b.createdAt);
      const nextReady = pending
        .filter((item) => item.nextAttemptAt > now)
        .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt)[0];
      const item = pending.find((candidate) => (candidate.nextAttemptAt || 0) <= now);
      if (!item) {
        if (nextReady) scheduleOutboxDrain(get, nextReady.nextAttemptAt - now);
        return null;
      }

      set((state) => ({
        pendingActions: normalizeOutboxItems(state.pendingActions).map((candidate) => (
          candidate.clientActionId === item.clientActionId
            ? { ...candidate, status: "sending", attempts: candidate.attempts + 1 }
            : candidate
        )),
        status: "syncing",
      }));
      await writeOutboxStorage(get().pendingActions);

      const sending = get().pendingActions.find((candidate) => candidate.clientActionId === item.clientActionId) || item;
      const result = await api("/api/player/mutate", {
        action: sending.action,
        payload: sending.payload,
        clientActionId: sending.clientActionId,
        intentServerTime: sending.intentServerTime,
      }, { timeoutMs: 9000 });

      if (!result.error) {
        set((state) => {
          const pendingActions = normalizeOutboxItems(state.pendingActions)
            .filter((candidate) => candidate.clientActionId !== sending.clientActionId);
          const busy = { ...state.busy };
          delete busy[sending.entityKey];
          return {
            pendingActions,
            busy,
            snapshot: result.snapshot ? normalizeSnapshot(result.snapshot) : state.snapshot,
            lastResult: result,
            status: "ready",
            message: "",
          };
        });
        await writeOutboxStorage(get().pendingActions);
        haptic("success");
        audioManager.play("success");
        scheduleOutboxDrain(get, 0);
        return result;
      }

      const transient = result.error === "TIMEOUT" || result.error === "NETWORK_ERROR" || Number(result._httpStatus || 0) >= 500;
      if (transient) {
        set((state) => ({
          pendingActions: normalizeOutboxItems(state.pendingActions).map((candidate) => (
            candidate.clientActionId === sending.clientActionId
              ? {
                  ...candidate,
                  status: "pending",
                  nextAttemptAt: Date.now() + retryDelay(candidate.attempts),
                }
              : candidate
          )),
          lastResult: result,
          status: "offline",
          message: "",
        }));
        await writeOutboxStorage(get().pendingActions);
        const retryAt = get().pendingActions.find((candidate) => candidate.clientActionId === sending.clientActionId)?.nextAttemptAt;
        if (retryAt) scheduleOutboxDrain(get, retryAt - Date.now());
        return result;
      }

      const fresh = await get().loadSnapshot();
      if (!fresh?.error) {
        set((state) => {
          const pendingActions = normalizeOutboxItems(state.pendingActions)
            .filter((candidate) => candidate.clientActionId !== sending.clientActionId);
          const busy = { ...state.busy };
          delete busy[sending.entityKey];
          return {
            pendingActions,
            busy,
            message: result.error,
            lastResult: result,
          };
        });
        await writeOutboxStorage(get().pendingActions);
      } else {
        set((state) => ({
          pendingActions: normalizeOutboxItems(state.pendingActions).map((candidate) => (
            candidate.clientActionId === sending.clientActionId
              ? { ...candidate, status: "pending", nextAttemptAt: Date.now() + 60000 }
              : candidate
          )),
          lastResult: result,
        }));
        await writeOutboxStorage(get().pendingActions);
        scheduleOutboxDrain(get, 60000);
      }
      return result;
    })().finally(() => {
      outboxDrainPromise = null;
    });
    return outboxDrainPromise;
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
        garden: payload.garden ? { ...prev.garden, ...payload.garden } : prev.garden,
        yard: payload.yard ? { ...prev.yard, ...payload.yard } : prev.yard,
        pet: payload.pet || prev.pet,
        achievements: payload.achievements
          ? { ...prev.achievements, raw: payload.achievements }
          : prev.achievements,
      };
      return { snapshot: normalizeSnapshot(next) };
    });
  },

  clearMessage: () => set({ message: "" }),
  actionLabel,
}));
