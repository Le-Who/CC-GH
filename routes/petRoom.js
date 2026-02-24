/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Pet Room Routes (v8.0)
 *  Room state, decoration placement, theme switching
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import { ROOM_DECORATIONS, ROOM_THEMES } from "../game-logic.js";
import { getPlayer, debouncedSavePlayer } from "../playerManager.js";

const ROOM_ROWS = 4;
const ROOM_COLS = 4;

export default function petRoomRoutes(requireAuth, resolveUser) {
  const router = Router();

  /** Ensure room data exists on player */
  function ensureRoom(p) {
    if (!p.pet) p.pet = {};
    if (!p.pet.room)
      p.pet.room = { wallpaper: "default", decorations: {}, inventory: [] };
    if (!p.pet.room.decorations) p.pet.room.decorations = {};
    if (!p.pet.room.inventory) p.pet.room.inventory = [];
  }

  /* ─── Room State ─── */
  router.post("/api/pet/room/state", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const p = getPlayer(userId, username);
    ensureRoom(p);
    res.json({
      room: p.pet.room,
      themes: ROOM_THEMES,
      decorations: ROOM_DECORATIONS,
    });
  });

  /* ─── Place Decoration ─── */
  router.post("/api/pet/room/place", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { itemId, row, col } = req.body;
    const p = getPlayer(userId);
    ensureRoom(p);

    // Validate grid bounds
    if (row < 0 || row >= ROOM_ROWS || col < 0 || col >= ROOM_COLS) {
      return res.status(400).json({ error: "out of grid bounds" });
    }

    // Validate item ownership
    if (!p.pet.room.inventory.includes(itemId)) {
      return res.status(400).json({ error: "item not in inventory" });
    }

    // Validate decoration exists
    if (!ROOM_DECORATIONS[itemId]) {
      return res.status(400).json({ error: "unknown decoration" });
    }

    // Check if item is already placed somewhere — remove from old position
    for (const [key, id] of Object.entries(p.pet.room.decorations)) {
      if (id === itemId) {
        delete p.pet.room.decorations[key];
      }
    }

    // Place at new position
    const gridKey = `${row}_${col}`;
    p.pet.room.decorations[gridKey] = itemId;

    debouncedSavePlayer(userId);
    res.json({ success: true, room: p.pet.room });
  });

  /* ─── Remove Decoration ─── */
  router.post("/api/pet/room/remove", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { row, col } = req.body;
    const p = getPlayer(userId);
    ensureRoom(p);

    const gridKey = `${row}_${col}`;
    if (!p.pet.room.decorations[gridKey]) {
      return res.status(400).json({ error: "no decoration at position" });
    }

    delete p.pet.room.decorations[gridKey];
    debouncedSavePlayer(userId);
    res.json({ success: true, room: p.pet.room });
  });

  /* ─── Change Theme ─── */
  router.post("/api/pet/room/theme", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { themeId } = req.body;
    const p = getPlayer(userId);
    ensureRoom(p);

    // Validate theme
    const theme = ROOM_THEMES.find((t) => t.id === themeId);
    if (!theme) {
      return res.status(400).json({ error: "unknown theme" });
    }

    p.pet.room.wallpaper = themeId;
    debouncedSavePlayer(userId);
    res.json({ success: true, room: p.pet.room });
  });

  return router;
}
