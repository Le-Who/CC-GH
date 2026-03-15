/**
 * ═══════════════════════════════════════════════════════
 *  useToast — React/Zustand hook for a centralized toast system
 *
 *  Replaces shared.js's imperative showToast() with a reactive
 *  store. Vanilla code keeps calling showToast() — the bridge
 *  routes it to this store. React components read the queue.
 *
 *  Usage in React:
 *    const { toasts, dismiss } = useToast();
 *
 *  Usage in Vanilla JS (via bridge):
 *    import { toastStore } from '@/hooks/useToast';
 *    toastStore.getState().addToast('Hello!', 'success');
 * ═══════════════════════════════════════════════════════
 */
import { create } from "zustand";

let _nextId = 1;

export const toastStore = create((set, get) => ({
  toasts: [],  // [{ id, message, type, timestamp }]

  addToast: (message, type = "info") => {
    // Dedup: skip if same message within 1s
    const now = Date.now();
    const existing = get().toasts;
    if (existing.length > 0) {
      const last = existing[existing.length - 1];
      if (last.message === message && now - last.timestamp < 1000) return;
    }

    const id = _nextId++;
    const toast = { id, message, type, timestamp: now };

    set((s) => ({
      toasts: [...s.toasts.slice(-2), toast],  // Max 3 toasts
    }));

    // Auto-remove after 2.5s
    setTimeout(() => {
      set((s) => ({
        toasts: s.toasts.filter((t) => t.id !== id),
      }));
    }, 2500);
  },

  dismiss: (id) => set((s) => ({
    toasts: s.toasts.filter((t) => t.id !== id),
  })),

  clearAll: () => set({ toasts: [] }),
}));

export function useToast() {
  return toastStore();
}

export const useToasts = () => toastStore((s) => s.toasts);
