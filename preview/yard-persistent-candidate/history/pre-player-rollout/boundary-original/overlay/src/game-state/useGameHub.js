import { create } from "zustand";
import { readYardOutbox, writeYardOutbox } from "./yardOutboxStorage.js";
import { VISIBLE_GAME_IDS } from "../app/gameRegistry.js";
import { api } from "../services/apiClient.js";
import { audioManager } from "../services/audioManager.js";
import { haptic } from "../platform/telegram.js";
import { withNormalizedSnapshot } from "./inventory.js";
import { createClientActionId, shouldUseDurableOutbox } from "./reliableActions.js";
import { isGardenR2Action, gardenR2AccountMatches, compareSnapshotFreshness, mergeGardenR2Snapshot, protectHubSnapshot } from "./gardenR2Snapshot.js";

export const ACTIVE_TAB_STORAGE_KEY = "game_hub_active_tab_v1";
export const ACTIVE_TAB_QUERY_PARAM = "tab";
const ACTIVE_TAB_IDS = new Set(VISIBLE_GAME_IDS);
const RETRY_DELAYS_MS = [0, 2000, 5000, 15000, 30000, 60000];
const GARDEN_R2_RECONCILE_ERRORS = new Set(["GARDEN_R2_REVISION_CONFLICT", "CLIENT_UPDATE_REQUIRED", "GARDEN_R2_CLIENT_UPDATE_REQUIRED"]);
let outboxDrainPromise = null;
let outboxDrainTimer = null;
let outboxHydration = null;
// Failed writes remain recoverable in this process, scoped to their owner.
const unsavedOutboxes = new Map();
// Departing a verified account retires every async request, including A-B-A.
let snapshotAccountSession = {};
let latestSnapshotRequest = null;

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
    ...item,
    accountId: item.accountId,
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

function accountChangedError(action) {
  return { error: isGardenR2Action(action) ? "GARDEN_R2_ACCOUNT_CHANGED" : action?.startsWith("garden.") ? "GARDEN_ACCOUNT_CHANGED" : "ACCOUNT_CHANGED" };
}

function ownsSession(get, accountId, session) {
  return snapshotAccountSession === session && get().snapshot?.player?.id === accountId;
}

async function persistOutbox(accountId, items) {
  const saved = await writeYardOutbox(accountId, items);
  if (saved.error) unsavedOutboxes.set(accountId, structuredClone(items));
  else unsavedOutboxes.delete(accountId);
  return saved;
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
  accountSession: snapshotAccountSession,
  status: "booting",
  message: "",
  busy: {},
  pendingActions: [],
  outboxLoaded: false,
  outboxAccountId: null,
  outboxStorageError: null,
  retainedLegacyOutbox: [],
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
    set((state) => ({ snapshot: normalizeSnapshot(protectHubSnapshot(state.snapshot, snapshot)), status: "ready" }));
  },

  loadSnapshot: async () => {
    const requestAccountId = get().snapshot?.player?.id;
    const requestSession = snapshotAccountSession;
    const requestToken = latestSnapshotRequest = {};
    set({ status: "syncing" });
    const result = await api("/api/player/snapshot", undefined, { isCurrent: () => snapshotAccountSession === requestSession
      && (requestAccountId == null || get().snapshot?.player?.id === requestAccountId) });
    const currentAccountId = get().snapshot?.player?.id;
    // Concurrent boot reads may bind the same first account, but never a foreign
    // one. The session also fences A→B→A even when the final ID matches again.
    const initialAccountMatch = requestAccountId == null && !result.error && result.player?.id === currentAccountId;
    if (snapshotAccountSession !== requestSession || (currentAccountId !== requestAccountId && !initialAccountMatch)) return { error: "ACCOUNT_CHANGED" };
    if (!result.error && (!result.player?.id || (currentAccountId != null && result.player.id !== currentAccountId))) {
      if (latestSnapshotRequest === requestToken) set({ status: "offline", message: "ACCOUNT_CHANGED" });
      return { error: "ACCOUNT_CHANGED" };
    }
    if (result.error) {
      // Older failures cannot override a newer refresh's pending/ready/error UI.
      // Successful responses still use the existing server-observation merge.
      if (latestSnapshotRequest !== requestToken) return { error: "SNAPSHOT_SUPERSEDED" };
      set({ status: "offline", message: result.error });
      return result;
    }
    const snapshot = normalizeSnapshot(protectHubSnapshot(get().snapshot, result));
    set({ snapshot, status: "ready", message: "" });
    scheduleOutboxDrain(get, 0);
    return snapshot;
  },

  performAction: async (action, payload = {}, options = {}) => {
    if (isYardAction(action) && options.outbox !== false) {
      return get().enqueueYardAction(action, payload, options);
    }
    const requestSnapshot = get().snapshot;
    const requestAccountId = requestSnapshot?.player?.id;
    const requestSession = snapshotAccountSession;
    if (!requestAccountId) return { error: "ACCOUNT_REQUIRED" };
    const isCurrent = () => ownsSession(get, requestAccountId, requestSession);
    const gardenR2Action = isGardenR2Action(action);
    if (gardenR2Action && (!requestAccountId || payload.accountId !== requestAccountId)) return { error: "GARDEN_R2_ACCOUNT_MISMATCH" };
    const key = options.key || action;
    if (get().busy[key]) return { error: "busy" };
    set((state) => ({ busy: { ...state.busy, [key]: true }, message: "" }));
    const body = { accountId: requestAccountId, action, payload, ...(options.clientActionId ? { clientActionId: options.clientActionId } : {}) };
    const result = await api("/api/player/mutate", body, { timeoutMs: options.timeoutMs || 9000, isCurrent });
    // Fence the returned receipt too: transaction coordinators must not ack an
    // intent using an old session's success, even if the final account is A.
    if (!isCurrent()) return accountChangedError(action);
    if (result.error === "ACCOUNT_CHANGED" || (result.snapshot && !gardenR2AccountMatches(get().snapshot, result.snapshot, requestAccountId))) {
      set(state => { const busy = { ...state.busy }; delete busy[key]; return { busy }; });
      return accountChangedError(action);
    }
    set((state) => {
      const busy = { ...state.busy };
      delete busy[key];
      if (result.error) {
        const reconcileGarden = result.snapshot?.gardenR2?.blocked
          || (typeof action === "string" && action.startsWith("garden.") && GARDEN_R2_RECONCILE_ERRORS.has(result.error));
        const errorView = reconcileGarden
          ? mergeGardenR2Snapshot(state.snapshot, result.snapshot, { accountId: requestAccountId, requestSnapshot })
          : state.snapshot;
        return {
          busy,
          snapshot: errorView === state.snapshot ? state.snapshot : { ...errorView, receivedAt: Date.now() },
          message: result.error,
          lastResult: result,
        };
      }
      const gardenView = gardenR2Action && result.snapshot
        ? mergeGardenR2Snapshot(state.snapshot, result.snapshot, { accountId: requestAccountId, requestSnapshot })
        : state.snapshot;
      const snapshot = gardenR2Action
        ? (gardenView === state.snapshot ? state.snapshot : { ...gardenView, receivedAt: Date.now() })
        : result.snapshot ? normalizeSnapshot(protectHubSnapshot(state.snapshot, result.snapshot)) : state.snapshot;
      return {
        busy,
        snapshot,
        message: options.silent ? "" : options.successMessage || "",
        lastResult: result,
        status: "ready",
      };
    });
    if (options.feedback !== false && isCurrent()) {
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
    const accountId = get().snapshot?.player?.id, session = snapshotAccountSession;
    if (!accountId) return { error: "ACCOUNT_REQUIRED" };
    if (outboxHydration?.session === session && outboxHydration.accountId === accountId) return outboxHydration.promise;
    const hydration = { accountId, session };
    hydration.promise = (async () => {
      const stored = await readYardOutbox(accountId);
      if (!ownsSession(get, accountId, session)) return { error: "ACCOUNT_CHANGED" };
      if (stored.items?.some(item => !shouldUseDurableOutbox(item.action))) stored.error = "OUTBOX_STORAGE_INVALID";
      const recoverable = unsavedOutboxes.get(accountId) || [];
      const pendingActions = stored.error === "OUTBOX_STORAGE_INVALID" ? [] : normalizeOutboxItems([
        ...(stored.items || []).filter(saved => !recoverable.some(item => saved.clientActionId === item.clientActionId)), ...recoverable,
      ]);
      set({ pendingActions, outboxLoaded: !stored.error, outboxAccountId: accountId, outboxStorageError: stored.error || null,
        retainedLegacyOutbox: stored.retainedLegacyOutbox || [], busy: { ...get().busy, ...Object.fromEntries(pendingActions.map(item => [item.entityKey, true])) } });
      if (!stored.error) scheduleOutboxDrain(get, 0);
      return stored.error ? { error: stored.error } : pendingActions;
    })().finally(() => { if (outboxHydration === hydration) outboxHydration = null; });
    outboxHydration = hydration;
    return hydration.promise;
  },

  enqueueYardAction: async (action, payload = {}, options = {}) => {
    if (!shouldUseDurableOutbox(action)) return { error: "UNSUPPORTED_OUTBOX_ACTION" };
    const accountId = get().snapshot?.player?.id, session = snapshotAccountSession;
    if (!accountId) return { error: "ACCOUNT_REQUIRED" };
    if (!get().outboxLoaded || get().outboxAccountId !== accountId) {
      const hydrated = await get().hydrateOutbox();
      if (hydrated?.error) return hydrated;
    }
    if (!ownsSession(get, accountId, session)) return { error: "ACCOUNT_CHANGED" };
    if (get().outboxStorageError === "OUTBOX_STORAGE_INVALID") return { error: get().outboxStorageError };
    const entityKey = options.entityKey || yardEntityKey(action, payload);
    let queuedItem = null;
    set((state) => {
      let pendingActions = normalizeOutboxItems(state.pendingActions);
      const existingIndex = pendingActions.findIndex((item) => item.entityKey === entityKey && item.status !== "failed");
      // An attempted nonce may already have committed despite a lost reply.
      // Only an unsent legacy companion intent can be coalesced.
      if (existingIndex >= 0 && pendingActions[existingIndex].attempts > 0) {
        queuedItem = pendingActions[existingIndex];
      } else
      // A v2 action ID signs its original payload, including after a reload/retry.
      if (action === "yard.configureCompanion" && existingIndex >= 0
        && !pendingActions[existingIndex].clientActionId.startsWith("yard-v2:")
        && !String(options.clientActionId || "").startsWith("yard-v2:")) {
        queuedItem = {
          accountId,
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
          accountId,
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
    const saved = await persistOutbox(accountId, get().pendingActions);
    if (!ownsSession(get, accountId, session)) return { error: "ACCOUNT_CHANGED" };
    set({ outboxStorageError: saved.error || null });
    if (saved.error) return saved;
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
      const accountId = get().snapshot?.player?.id, session = snapshotAccountSession;
      if (!accountId) return { error: "ACCOUNT_REQUIRED" };
      const isCurrent = () => ownsSession(get, accountId, session);
      if (!get().outboxLoaded || get().outboxAccountId !== accountId) {
        const hydrated = await get().hydrateOutbox();
        if (hydrated?.error) return hydrated;
      }
      if (!isCurrent()) return { error: "ACCOUNT_CHANGED" };
      if (get().outboxStorageError === "OUTBOX_STORAGE_INVALID") return { error: get().outboxStorageError };
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
      if (item.accountId !== accountId) return { error: "OUTBOX_STORAGE_INVALID" };

      set((state) => ({
        pendingActions: normalizeOutboxItems(state.pendingActions).map((candidate) => (
          candidate.clientActionId === item.clientActionId
            ? { ...candidate, status: "sending", attempts: candidate.attempts + 1 }
            : candidate
        )),
        status: "syncing",
      }));
      const saved = await persistOutbox(accountId, get().pendingActions);
      if (!isCurrent()) return { error: "ACCOUNT_CHANGED" };
      set({ outboxStorageError: saved.error || null });
      if (saved.error) return saved;

      const sending = get().pendingActions.find((candidate) => candidate.clientActionId === item.clientActionId) || item;
      let result = await api("/api/player/mutate", {
        accountId,
        action: sending.action,
        payload: sending.payload,
        clientActionId: sending.clientActionId,
        intentServerTime: sending.intentServerTime,
      }, { timeoutMs: 9000, isCurrent });

      if (!isCurrent()) return { error: "ACCOUNT_CHANGED" };
      if (result.snapshot && !gardenR2AccountMatches(get().snapshot, result.snapshot, accountId)) result = { error: "ACCOUNT_CHANGED" };

      if (!result.error) {
        set((state) => {
          const pendingActions = normalizeOutboxItems(state.pendingActions)
            .filter((candidate) => candidate.clientActionId !== sending.clientActionId);
          const busy = { ...state.busy };
          delete busy[sending.entityKey];
          return {
            pendingActions,
            busy,
            snapshot: result.snapshot ? normalizeSnapshot(protectHubSnapshot(state.snapshot, result.snapshot)) : state.snapshot,
            lastResult: result,
            status: "ready",
            message: "",
          };
        });
        const acknowledged = await persistOutbox(accountId, get().pendingActions);
        if (!isCurrent()) return { error: "ACCOUNT_CHANGED" };
        set({ outboxStorageError: acknowledged.error || null });
        haptic("success");
        audioManager.play("success");
        scheduleOutboxDrain(get, 0);
        return result;
      }

      const transient = result.error === "ACCOUNT_CHANGED" || result.error === "TIMEOUT" || result.error === "NETWORK_ERROR" || Number(result._httpStatus || 0) >= 500;
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
        const retained = await persistOutbox(accountId, get().pendingActions);
        if (!isCurrent()) return { error: "ACCOUNT_CHANGED" };
        set({ outboxStorageError: retained.error || null });
        const retryAt = get().pendingActions.find((candidate) => candidate.clientActionId === sending.clientActionId)?.nextAttemptAt;
        if (retryAt) scheduleOutboxDrain(get, retryAt - Date.now());
        return result;
      }

      const fresh = await get().loadSnapshot();
      if (!isCurrent()) return { error: "ACCOUNT_CHANGED" };
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
        const acknowledged = await persistOutbox(accountId, get().pendingActions);
        if (!isCurrent()) return { error: "ACCOUNT_CHANGED" };
        set({ outboxStorageError: acknowledged.error || null });
      } else {
        set((state) => ({
          pendingActions: normalizeOutboxItems(state.pendingActions).map((candidate) => (
            candidate.clientActionId === sending.clientActionId
              ? { ...candidate, status: "pending", nextAttemptAt: Date.now() + 60000 }
              : candidate
          )),
          lastResult: result,
        }));
        const retained = await persistOutbox(accountId, get().pendingActions);
        if (!isCurrent()) return { error: "ACCOUNT_CHANGED" };
        set({ outboxStorageError: retained.error || null });
        scheduleOutboxDrain(get, 60000);
      }
      return result;
    })().finally(() => {
      outboxDrainPromise = null;
      if (get().snapshot?.player?.id && get().pendingActions.length) {
        const nextAt = Math.min(...get().pendingActions.map(item => item.nextAttemptAt || 0));
        if (!get().outboxStorageError) scheduleOutboxDrain(get, nextAt - Date.now());
      }
    });
    return outboxDrainPromise;
  },

  isBusy: (key) => !!get().busy[key],

  applyRealtimePayload: (payload) => {
    if (!payload) return;
    set((state) => {
      const prev = state.snapshot;
      if (!prev) return state;
      if (prev.player?.id != null && !gardenR2AccountMatches(prev, payload)) return state;
      const guardedGarden = !!(prev.gardenR2 || payload.gardenR2);
      if (guardedGarden && !gardenR2AccountMatches(prev, payload)) return state;
      if (compareSnapshotFreshness(payload, prev) < 0) return state;
      let next = {
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
        // Runtime is an authoritative projection. Replace it in this same store
        // transaction so prop commits, visit plans and released reservations agree.
        yardRuntime: Object.hasOwn(payload, "yardRuntime") ? payload.yardRuntime : prev.yardRuntime,
        // Normalization prefers snapshot.inventory. Refresh only the Yard aliases
        // supplied in this delta so an old alias cannot overwrite new server counts.
        inventory: payload.yard ? {
          ...prev.inventory,
          ...(Object.hasOwn(payload.yard, "foodInventory") ? { yardFood: payload.yard.foodInventory } : {}),
          ...(Object.hasOwn(payload.yard, "goodieInventory") ? { yardGoodies: payload.yard.goodieInventory } : {}),
        } : prev.inventory,
        pet: payload.pet || prev.pet,
        achievements: payload.achievements
          ? { ...prev.achievements, raw: payload.achievements }
          : prev.achievements,
      };
      if (payload.yard) next.inventory = {
        ...next.inventory,
        ...(Object.hasOwn(payload.yard, "foodInventory") ? { yardFood: payload.yard.foodInventory } : {}),
        ...(Object.hasOwn(payload.yard, "goodieInventory") ? { yardGoodies: payload.yard.goodieInventory } : {}),
      };
      if (Object.hasOwn(payload, "yardRuntime")) next.yardRuntime = payload.yardRuntime;
      // Reconcile authoritative Merge inventory aliases before normalization.
      if (payload.merge) next.inventory = {
        ...next.inventory,
        ...(Object.hasOwn(payload.merge, "itemCounts") ? { mergeItems: payload.merge.itemCounts } : {}),
        ...(Object.hasOwn(payload.merge, "mergeInventory") ? { mergeInventory: payload.merge.mergeInventory } : {}),
      };
      // Preserve the sequence of non-Garden realtime observations as well.
      if (Number.isSafeInteger(payload.syncSeq) && payload.syncSeq >= 0) next.player = { ...prev.player, syncSeq: payload.syncSeq };
      if (Number.isSafeInteger(payload.serverTime) && payload.serverTime >= 0) next.serverTime = Math.max(prev.serverTime || 0, payload.serverTime);
      if (guardedGarden) {
        const gardenView = mergeGardenR2Snapshot(prev, payload);
        next = {
          ...next,
          garden: gardenView.garden,
          gardenR2: gardenView.gardenR2,
          resources: { ...next.resources, gold: gardenView.resources?.gold },
          player: gardenView.player,
          serverTime: gardenView.serverTime,
          gardenR2Available: gardenView.gardenR2Available,
        };
      }
      return { snapshot: normalizeSnapshot(next) };
    });
  },

  clearMessage: () => set({ message: "" }),
  actionLabel,
}));


// The first account binds an unscoped boot. Any departure from a bound account
// starts a new session, including clearing it or switching away and back.
useGameHub.subscribe((state, previous) => {
  const previousAccountId = previous.snapshot?.player?.id;
  const accountId = state.snapshot?.player?.id;
  if (accountId === previousAccountId) return;
  if (previousAccountId != null) snapshotAccountSession = {};
  useGameHub.setState({ accountSession: snapshotAccountSession, pendingActions: [], busy: {}, outboxLoaded: false, outboxAccountId: null, outboxStorageError: null, lastResult: null, message: "" });
});
