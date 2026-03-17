/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Merge Routes (Server Authority)
 *  Gacha pulls, generator taps, item merging, trash
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import {
  ECONOMY,
  MERGE_CHAINS,
  CROP_TIERS,
  TIER_YIELD,
  calcRegen,
  randInt,
  hydrateMergeBoard,
  getEmptyCells,
  validCoord,
  BOARD_ROWS,
  BOARD_COLS,
} from "../game-logic.js";
import { withPlayerLock } from "../playerManager.js";

export default function mergeRoutes(requireAuth, resolveUser) {
  const router = Router();

  /** Helper: unlock chain generator if not already unlocked */
  function tryUnlockChain(p, chainId) {
    if (!p.merge.generators.includes(chainId)) {
      p.merge.generators.push(chainId);
      if (!p.merge.generatorState[chainId]) {
        p.merge.generatorState[chainId] = {
          tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT,
          cooldownEnd: 0,
        };
      }
    }
  }

  /* ─── Merge State ─── */
  router.post("/api/merge/state", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      hydrateMergeBoard(p);
      res.json({
        merge: p.merge,
        resources: p.resources,
      });
    });
  });

  /* ─── Generator Tap ─── */
  router.post("/api/merge/tap", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const { chainId } = req.body;
      const chain = MERGE_CHAINS[chainId];
      if (!chain) return res.status(400).json({ error: "invalid chainId" });

      hydrateMergeBoard(p);

      // Check generator unlocked state
      if (!p.merge.generators.includes(chainId)) {
        return res.status(400).json({ error: "generator locked" });
      }

      const state = p.merge.generatorState[chainId] || {
        tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT,
        cooldownEnd: 0,
      };
      const now = Date.now();

      // Ensure cooldown logic uses correct elapsed delta
      if (now >= state.cooldownEnd) {
        state.tapsLeft = ECONOMY.GENERATOR_TAP_LIMIT;
        state.cooldownEnd = 0; // Clear cooldown
      }

      if (state.tapsLeft <= 0) {
        return res.status(400).json({
          error: "generator cooling down",
          cooldownEnd: state.cooldownEnd,
        });
      }

      // Need 1 empty cell
      const empty = getEmptyCells(p.merge.board);
      if (empty.length === 0) {
        return res.status(400).json({ error: "board full" });
      }

      // Energy Cost
      calcRegen(p, now);
      if (p.resources.energy.current < ECONOMY.GENERATOR_TAP_COST) {
        return res.status(400).json({ error: "not enough energy" });
      }
      p.resources.energy.current -= ECONOMY.GENERATOR_TAP_COST;

      // Decrement taps
      state.tapsLeft--;
      if (state.tapsLeft <= 0) {
        state.cooldownEnd = now + ECONOMY.GENERATOR_COOLDOWN_MS;
      }
      p.merge.generatorState[chainId] = state; // Save back if it was default generated

      // Determine drop level based on configured rate (v6.2.2 tweak)
      // Base: L0 (80%), Rare: L1 (15%), Epic: L2 (5%) if chain supports it
      const rand = Math.random();
      let dropLevel = 0;
      if (rand > 0.95 && chain.items.length > 2) dropLevel = 2;
      else if (rand > 0.8 && chain.items.length > 1) dropLevel = 1;

      // Spawn item
      const [r, c] = empty[Math.floor(Math.random() * empty.length)];
      p.merge.board[r][c] = {
        id: chain.items[dropLevel],
        chainId,
        level: dropLevel,
      };

      res.json({
        success: true,
        merge: p.merge,
        resources: p.resources,
        spawned: { r, c },
      });
    });
  });

  /* ─── Merge Items ─── */
  router.post("/api/merge/merge", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const { fromR, fromC, toR, toC } = req.body;
      hydrateMergeBoard(p);
      const board = p.merge.board;

      if (
        !validCoord(fromR, BOARD_ROWS) ||
        !validCoord(fromC, BOARD_COLS) ||
        !validCoord(toR, BOARD_ROWS) ||
        !validCoord(toC, BOARD_COLS)
      ) {
        return res.status(400).json({ error: "invalid coordinates" });
      }
      const src = board[fromR][fromC];
      const dst = board[toR][toC];
      if (!src || !dst) {
        return res.status(400).json({ error: "empty cell" });
      }
      if (src.chainId !== dst.chainId || src.level !== dst.level) {
        return res.status(400).json({ error: "chain/level mismatch" });
      }

      const chain = MERGE_CHAINS[src.chainId];
      if (!chain || src.level >= chain.items.length - 1) {
        return res.status(400).json({ error: "max level reached" });
      }

      // Upgrade target, clear source
      const newLevel = src.level + 1;
      board[toR][toC] = {
        id: chain.items[newLevel],
        chainId: src.chainId,
        level: newLevel,
      };
      board[fromR][fromC] = null;
      res.json({
        success: true,
        merge: p.merge,
        newItem: board[toR][toC],
      });
    });
  });

  /* ─── Gacha Roll ─── */
  router.post("/api/merge/gacha", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      hydrateMergeBoard(p);

      if ((p.resources.gachaTokens || 0) < ECONOMY.GACHA_PULL_COST) {
        return res.status(400).json({
          error: "not enough tokens",
          required: ECONOMY.GACHA_PULL_COST,
        });
      }

      const empty = getEmptyCells(p.merge.board);
      if (empty.length === 0) {
        return res.status(400).json({ error: "board full" });
      }

      // Deduct tokens
      p.resources.gachaTokens -= ECONOMY.GACHA_PULL_COST;

      // Pick random chain and spawn L0 item
      const chainIds = Object.keys(MERGE_CHAINS);
      const chainId = chainIds[Math.floor(Math.random() * chainIds.length)];
      const chain = MERGE_CHAINS[chainId];
      const [r, c] = empty[Math.floor(Math.random() * empty.length)];
      p.merge.board[r][c] = { id: chain.items[0], chainId, level: 0 };

      // Unlock chain generator if not already
      tryUnlockChain(p, chainId);
      res.json({
        success: true,
        merge: p.merge,
        resources: p.resources,
        spawned: { r, c, chainId },
      });
    });
  });

  /* ─── Daily Free Pull ─── */
  router.post("/api/merge/free-pull", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      hydrateMergeBoard(p);
      const now = Date.now();

      // Check if already used today (same UTC day)
      const lastDate = new Date(p.merge.lastFreePull || 0)
        .toISOString()
        .slice(0, 10);
      const todayDate = new Date(now).toISOString().slice(0, 10);
      if (lastDate === todayDate) {
        return res.status(400).json({ error: "free pull already used today" });
      }

      const empty = getEmptyCells(p.merge.board);
      if (empty.length === 0) {
        return res.status(400).json({ error: "board full" });
      }

      // Spawn random L0 item (no cost)
      const chainIds = Object.keys(MERGE_CHAINS);
      const chainId = chainIds[Math.floor(Math.random() * chainIds.length)];
      const chain = MERGE_CHAINS[chainId];
      const [r, c] = empty[Math.floor(Math.random() * empty.length)];
      p.merge.board[r][c] = { id: chain.items[0], chainId, level: 0 };
      p.merge.lastFreePull = now;

      // Unlock chain generator if not already
      tryUnlockChain(p, chainId);
      res.json({
        success: true,
        merge: p.merge,
        spawned: { r, c, chainId },
      });
    });
  });

  /* ─── Trash Item ─── */
  router.post("/api/merge/trash", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const { r, c } = req.body;
      if (!validCoord(r, BOARD_ROWS) || !validCoord(c, BOARD_COLS)) {
        return res.status(400).json({ error: "invalid coordinates" });
      }
      hydrateMergeBoard(p);

      if (!p.merge.board[r]?.[c]) {
        return res.status(400).json({ error: "empty cell" });
      }

      p.merge.board[r][c] = null;
      res.json({ success: true, merge: p.merge });
    });
  });

  return router;
}
