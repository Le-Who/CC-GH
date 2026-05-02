import { create } from "zustand";

const MAX_EVENTS = 5;

export const useGameEvents = create((set) => ({
  events: [],
  pushEvent: (event) => {
    const id = event.id || `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
    const nextEvent = {
      id,
      game: event.game || "game",
      title: event.title || "",
      value: event.value || "",
      tone: event.tone || "neutral",
      createdAt: Date.now(),
      ttlMs: Math.max(800, Number(event.ttlMs) || 1800),
    };
    set((state) => ({ events: [nextEvent, ...state.events].slice(0, MAX_EVENTS) }));
    return id;
  },
  dismissEvent: (id) => set((state) => ({ events: state.events.filter((event) => event.id !== id) })),
  clearEvents: (game = null) => set((state) => ({
    events: game ? state.events.filter((event) => event.game !== game) : [],
  })),
}));
