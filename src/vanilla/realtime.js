import { io } from "socket.io-client";
import { HUB } from "./shared.js";
import { HUD } from "./hud.js";
import { PetCompanion } from "./pet.js";
import { farmStore } from "../hooks/useFarmEngine.js";
import { GameStore } from "./store.js"; // Needed to sync Merge
import {
  syncHarvestedResources,
  syncMergeState,
} from "../services/inventoryService.js";

let socket = null;

// Dual sync: WebSocket (Server -> Client) + LocalStorage (Tab -> Tab fallback)
export function initRealtime() {
  if (!socket) {
    socket = io(window.location.origin, {
      autoConnect: false,
      reconnectionAttempts: 5,
    });

    socket.on("player_sync", (data) => {
      if (data && data.payload) {
        applySyncPayload(data.payload);
      }
    });

    socket.on("connect", () => {
      if (HUB.userId) {
        socket.emit("authenticate", HUB.userId);
      }
    });
  }

  // Listen to LocalStorage for cross-tab sync
  window.addEventListener("storage", (e) => {
    if (e.key === "hub_sync_state" && e.newValue) {
      try {
        const data = JSON.parse(e.newValue);
        applySyncPayload(data.payload);
      } catch (err) {
        console.error("Cross-Tab sync parse error:", err);
      }
    }
  });
}

export function suspendRealtime() {
  if (socket && socket.connected) {
    socket.disconnect();
  }
}

export function resumeRealtime() {
  if (socket && !socket.connected) {
    socket.connect();
    if (HUB.userId) {
      socket.emit("authenticate", HUB.userId);
    }
  }
}

function applySyncPayload(payload) {
  if (!payload) return;

  const currentResources = GameStore.getState("resources");
  const mergedResources = payload.resources
    ? {
        ...payload.resources,
        ...(payload.harvested ? { harvested: payload.harvested } : {}),
      }
    : null;

  if (
    payload.entity === "plot" &&
    typeof payload.id === "number" &&
    payload.changes
  ) {
    const currentPlots = farmStore.getState()?.plots;
    if (currentPlots && currentPlots[payload.id]) {
      const updated = [...currentPlots];
      updated[payload.id] = { ...updated[payload.id], ...payload.changes };
      farmStore.setState({ plots: updated });
      document.dispatchEvent(
        new CustomEvent("farm_state_sync", { detail: { plots: updated } }),
      );
    }
    return;
  }

  if (payload.harvested && currentResources) {
    syncHarvestedResources(currentResources, payload.harvested);
  }
  if (mergedResources) {
    HUD.syncFromServer(mergedResources);
  }
  if (payload.pet) {
    PetCompanion.syncFromServer(payload.pet);
  }
  if (payload.plots) {
    farmStore.setState({ plots: payload.plots });
    document.dispatchEvent(
      new CustomEvent("farm_state_sync", { detail: payload }),
    );
  }
  if (payload.merge) {
    syncMergeState(payload.merge);
  }
}

export function broadcastStateUpdate(payload) {
  // 1. Cross-Tab Sync (Same Device) — always works
  try {
    localStorage.setItem(
      "hub_sync_state",
      JSON.stringify({ ts: Date.now(), payload }),
    );
  } catch (_) {}

  // 2. Cross-Device Sync (Supabase Broadcast) has been removed.
  // Target devices will sync via REST polling (loadState fallback).
}
