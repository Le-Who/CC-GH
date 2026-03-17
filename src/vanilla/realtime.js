import { createClient } from '@supabase/supabase-js';
import { get, set } from 'idb-keyval';
import { HUB } from './shared.js';
import { HUD } from './hud.js';
import { PetCompanion } from './pet.js';
import { farmStore } from '../hooks/useFarmEngine.js';
import { hudStore } from '../hooks/useHUDEngine.js';

export let supabase = null;
let realtimeChannel = null;

export function initRealtime() {
  if (supabase) return;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn('Realtime Sync Disabled: Missing Supabase credentials in .env');
    return;
  }

  supabase = createClient(url, key);
  _subscribeChannel();

  // Listen to LocalStorage for cross-tab sync
  window.addEventListener('storage', (e) => {
    if (e.key === 'hub_sync_state' && e.newValue) {
      try {
        const data = JSON.parse(e.newValue);
        applySyncPayload(data.payload);
      } catch (err) {
        console.error('Cross-Tab sync parse error:', err);
      }
    }
  });
}

/** Create and subscribe to the per-user broadcast channel */
function _subscribeChannel() {
  if (!supabase || !HUB.userId) return;
  // Tear down any existing channel first
  if (realtimeChannel) {
    try { supabase.removeChannel(realtimeChannel); } catch (_) {}
    realtimeChannel = null;
  }

  realtimeChannel = supabase.channel(`player_${HUB.userId}`, {
    config: {
      broadcast: { self: false }
    }
  });

  realtimeChannel
    .on('broadcast', { event: 'state_sync' }, ({ payload }) => {
      applySyncPayload(payload);
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        flushOfflineQueue();
      }
    });
}

/**
 * Reads offline state updates from IndexedDB and sends them when the
 * connection is restored. We only store the most recent update.
 */
async function flushOfflineQueue() {
  if (!realtimeChannel || realtimeChannel.state !== 'joined' || !supabase?.realtime?.isConnected?.()) return;

  try {
    const payload = await get('hub_offline_sync_queue');
    if (payload) {
      realtimeChannel.send({
        type: 'broadcast',
        event: 'state_sync',
        payload
      }).then(() => {
        set('hub_offline_sync_queue', null);
      }).catch(() => {
        // Failed to flush, will try again next connection
      });
    }
  } catch (err) {
    console.error('Failed to flush offline sync queue:', err);
  }
}

/**
 * v10.2: Suspend Realtime — tear down channel to free network resources.
 * Called when the page is backgrounded (visibilitychange).
 */
export function suspendRealtime() {
  if (supabase && realtimeChannel) {
    try { supabase.removeChannel(realtimeChannel); } catch (_) {}
    realtimeChannel = null;
  }
}

/**
 * v10.2: Resume Realtime — reconnect to channel after page resumes.
 * Called when the page becomes visible again.
 */
export function resumeRealtime() {
  if (supabase && !realtimeChannel && HUB.userId) {
    _subscribeChannel();
  }
}

function applySyncPayload(payload) {
  if (!payload) return;

  // v10.2: Support delta payloads (Improvement 3)
  // Format: { entity: 'plot', id: N, changes: {...} } for granular updates
  if (payload.entity === 'plot' && typeof payload.id === 'number' && payload.changes) {
    const currentPlots = farmStore.getState()?.plots;
    if (currentPlots && currentPlots[payload.id]) {
      const updated = [...currentPlots];
      updated[payload.id] = { ...updated[payload.id], ...payload.changes };
      farmStore.setState({ plots: updated });
      document.dispatchEvent(new CustomEvent('farm_state_sync', { detail: { plots: updated } }));
    }
    return;
  }

  // Full-state payload handling (legacy)
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
     // Notify vanilla DOM as well if the farm module is initialized
     document.dispatchEvent(new CustomEvent('farm_state_sync', { detail: payload }));
  }
}

/**
 * v10.2: Broadcast state update to other tabs/devices.
 * Guarded against REST fallback: only sends over WebSocket if the socket is actually connected
 * and the channel is fully joined.
 */
export function broadcastStateUpdate(payload) {
  // 1. Cross-Tab Sync (Same Device) — always works
  try {
    localStorage.setItem('hub_sync_state', JSON.stringify({ ts: Date.now(), payload }));
  } catch (_) {}

  // 2. Cross-Device Sync (Supabase Broadcast)
  // v10.2: Strict guard — only push if WebSocket is truly connected AND channel joined.
  // This prevents the "@supabase/realtime-js falling back to REST" warning.
  // If the socket is disconnected, we silently drop the visual-only broadcast;
  // target devices will self-heal via their 30s loadState() polling.
  if (
    realtimeChannel &&
    realtimeChannel.state === 'joined' &&
    supabase?.realtime?.isConnected?.()
  ) {
    realtimeChannel.send({
      type: 'broadcast',
      event: 'state_sync',
      payload
    }).catch(() => {
      // ⚡ Bolt: Queue to IndexedDB if send fails
      set('hub_offline_sync_queue', payload).catch(() => {});
    });
  } else {
    // ⚡ Bolt: Queue to IndexedDB if disconnected
    set('hub_offline_sync_queue', payload).catch(() => {});
  }
}
