import { HUB } from "./shared.js";
import { HUD } from "./hud.js";
import { PetCompanion } from "./pet.js";
import { farmStore } from "../hooks/useFarmEngine.js";
import { hudStore } from "../hooks/useHUDEngine.js";

// Supabase has been removed. We only support LocalStorage cross-tab sync now.
export function initRealtime() {
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
  // No-op without Supabase
}

export function resumeRealtime() {
  // No-op without Supabase
}

function applySyncPayload(payload) {
  if (!payload) return;

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

  if (payload.harvested) {
    farmStore.setState({ harvested: payload.harvested });
  }
  if (payload.resources) {
    HUD.syncFromServer(payload.resources);
    hudStore.getState().syncFromServer(payload.resources);
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
