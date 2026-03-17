import { createClient } from '@supabase/supabase-js';
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

  if (!HUB.userId) return;

  // Subscribe to Broadcasts
  realtimeChannel = supabase.channel(`player_${HUB.userId}`, {
    config: {
      broadcast: { self: false }
    }
  });

  realtimeChannel
    .on('broadcast', { event: 'state_sync' }, ({ payload }) => {
      applySyncPayload(payload);
    })
    .subscribe();

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

function applySyncPayload(payload) {
  if (!payload) return;
  // Hydrate local stores seamlessly
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
     // Notify vanilla DOM as well if active
     if (typeof window.HUB !== 'undefined' && window.HUB.initialized?.farm) {
         // Re-render farm if needed, we might need a custom event or let React handle it.
         // Actually, if plots change, we should reload the state from API to be safe, 
         // OR just pass it to the Vanilla renderer via a global hook.
         document.dispatchEvent(new CustomEvent('farm_state_sync', { detail: payload }));
     }
  }
}

export function broadcastStateUpdate(payload) {
  // 1. Cross-Tab Sync (Same Device)
  try {
    localStorage.setItem('hub_sync_state', JSON.stringify({ ts: Date.now(), payload }));
  } catch (e) {}

  // 2. Cross-Device Sync (Supabase Broadcast)
  if (realtimeChannel && realtimeChannel.state === 'joined') {
    realtimeChannel.send({
      type: 'broadcast',
      event: 'state_sync',
      payload
    }).catch(console.warn);
  }
}
