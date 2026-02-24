/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Event Routes
 *  Time-limited events with special crops and bonuses
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import { EVENTS, getActiveEvents } from "../game-logic.js";

export default function eventRoutes(requireAuth) {
  const router = Router();

  /* ─── Get Active Events ─── */
  router.get("/api/events/active", requireAuth, (_req, res) => {
    const active = getActiveEvents();
    res.json({
      events: active.map((e) => ({
        id: e.id,
        name: e.name,
        emoji: e.emoji,
        description: e.description,
        bonuses: e.bonuses,
        specialCrop: e.specialCrop
          ? {
              id: e.specialCrop.id,
              name: e.specialCrop.name,
              emoji: e.specialCrop.emoji,
              seedPrice: e.specialCrop.seedPrice,
              growthTime: e.specialCrop.growthTime,
            }
          : null,
        endsAt: e.endDate,
      })),
      templates: EVENTS.filter((e) => !e.startDate).map((e) => ({
        id: e.id,
        name: e.name,
        emoji: e.emoji,
        description: e.description,
      })),
    });
  });

  return router;
}
