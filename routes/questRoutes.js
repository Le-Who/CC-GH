/**
 * Legacy Pet Orders routes.
 *
 * Cozy Yard replaced the old Pet Room and Pet Orders loop. The old
 * /api/player/mutate quest.* contracts are gone, and these route-level
 * wrappers now fail explicitly instead of mutating retired pet state.
 */
import { Router } from "express";

export default function questRoutes(requireAuth, resolveUser) {
  const router = Router();

  function requireUser(req, res) {
    const { userId } = resolveUser(req);
    if (!userId) {
      res.status(400).json({ error: "userId required" });
      return false;
    }
    return true;
  }

  function gone(res) {
    return res.status(410).json({
      error: "Pet Orders were replaced by Cozy Yard visitor gifts and mementos.",
    });
  }

  router.get("/api/quests/active", requireAuth, async (req, res) => {
    if (!requireUser(req, res)) return;
    return gone(res);
  });

  router.post("/api/quests/generate", requireAuth, async (req, res) => {
    if (!requireUser(req, res)) return;
    return gone(res);
  });

  router.post("/api/quests/submit", requireAuth, async (req, res) => {
    if (!requireUser(req, res)) return;
    return gone(res);
  });

  return router;
}
