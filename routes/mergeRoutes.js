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
} from "../game-logic.js";
import { getPlayer, debouncedSavePlayer } from "../playerManager.js";

export default function mergeRoutes(requireAuth, resolveUser) {
  const router = Router();

  const BOARD_ROWS = 7,
    BOARD_COLS = 9;

  /** Validate grid coordinate is a valid integer in [0, limit) */
  function validCoord(v, limit) {
    return Number.isInteger(v) && v >= 0 && v < limit;
  }

  /**
   * v6.1.1: Hydrate merge board from Firestore.
   * sanitizeForFirestore() JSON-stringifies nested arrays (board is 7×9).
   * Firestore also converts arrays to objects with numeric keys.
   * This restores the board to a proper 2D array.
   */
  function hydrateMergeBoard(p) {
    if (!p.merge) return;
    let board = p.merge.board;
    // Case 1: JSON-stringified by sanitizeForFirestore
    if (typeof board === "string") {
      try {
        board = JSON.parse(board);
      } catch {
        /* leave as-is */
      }
    }
    // Case 2: Firestore converted array → object with numeric keys
    if (board && !Array.isArray(board)) {
      board = Object.keys(board)
        .sort((a, b) => a - b)
        .map((k) => {
          const row = board[k];
          if (row && !Array.isArray(row)) {
            return Object.keys(row)
              .sort((a, b) => a - b)
              .map((j) => row[j] ?? null);
          }
          return row;
        });
    }
    // Ensure 7×9 dimensions
    if (Array.isArray(board)) {
      while (board.length < BOARD_ROWS)
        board.push(Array(BOARD_COLS).fill(null));
      for (let r = 0; r < board.length; r++) {
        if (!Array.isArray(board[r])) board[r] = Array(BOARD_COLS).fill(null);
        while (board[r].length < BOARD_COLS) board[r].push(null);
      }
    }
    p.merge.board = board;
  }

  /** Helper: get empty cells on a board */
  function getEmptyCells(board) {
    const cells = [];
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        if (board[r][c] === null) cells.push([r, c]);
      }
    }
    return cells;
  }

  /* ─── Merge State ─── */
  router.post("/api/merge/state", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const p = getPlayer(userId, username);
    hydrateMergeBoard(p);
    res.json({
      merge: p.merge,
      resources: p.resources,
    });
  });

  /* ─── Generator Tap ─── */
  router.post("/api/merge/tap", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { chainId, cropId } = req.body;
    const p = getPlayer(userId);
    hydrateMergeBoard(p);
    calcRegen(p);

    // Validate chain
    const chain = MERGE_CHAINS[chainId];
    if (!chain) return res.status(400).json({ error: "unknown chain" });
    if (!p.merge.generators.includes(chainId)) {
      return res.status(400).json({ error: "chain not unlocked" });
    }

    // Validate & check generator cooldown
    const gs =
      p.merge.generatorState[chainId] ||
      (p.merge.generatorState[chainId] = {
        tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT,
        cooldownEnd: 0,
      });
    if (gs.cooldownEnd > Date.now()) {
      return res.status(400).json({
        error: "generator on cooldown",
        cooldownEnd: gs.cooldownEnd,
      });
    }
    // Reset taps if cooldown just expired
    if (gs.tapsLeft <= 0) {
      gs.tapsLeft = ECONOMY.GENERATOR_TAP_LIMIT;
      gs.cooldownEnd = 0;
    }

    // Validate energy
    if (p.resources.energy.current < 1) {
      return res.status(400).json({ error: "not enough energy" });
    }

    // Validate crop
    if (!cropId || !p.farm.harvested[cropId] || p.farm.harvested[cropId] <= 0) {
      return res.status(400).json({ error: "no crop to fuel generator" });
    }

    // Check board space
    const empty = getEmptyCells(p.merge.board);
    if (empty.length === 0) {
      return res.status(400).json({ error: "board full" });
    }

    // Determine bundle size from crop tier
    const tier = CROP_TIERS[cropId] || "cheap";
    const tierCfg = TIER_YIELD[tier];
    const bundleSize = Math.min(
      randInt(tierCfg.min, tierCfg.max),
      empty.length,
    );

    // Deduct costs
    p.resources.energy.current -= 1;
    p.farm.harvested[cropId]--;
    if (p.farm.harvested[cropId] <= 0) delete p.farm.harvested[cropId];

    // Spawn items (Level 0-1 randomly)
    const spawned = [];
    // Shuffle empty cells
    for (let i = empty.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [empty[i], empty[j]] = [empty[j], empty[i]];
    }
    for (let i = 0; i < bundleSize; i++) {
      const [r, c] = empty[i];
      const level = Math.random() < 0.8 ? 0 : 1; // 80% L0, 20% L1
      p.merge.board[r][c] = {
        id: chain.items[level],
        chainId,
        level,
      };
      spawned.push({ r, c, level });
    }

    // Deduct generator durability
    gs.tapsLeft--;
    if (gs.tapsLeft <= 0) {
      gs.cooldownEnd = Date.now() + ECONOMY.GENERATOR_COOLDOWN_MS;
    }

    debouncedSavePlayer(userId);
    res.json({
      success: true,
      merge: p.merge,
      resources: p.resources,
      harvested: p.farm.harvested,
      spawned,
    });
  });

  /* ─── Merge Items ─── */
  router.post("/api/merge/merge", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { fromR, fromC, toR, toC } = req.body;
    const p = getPlayer(userId);
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

    debouncedSavePlayer(userId);
    res.json({
      success: true,
      merge: p.merge,
      newItem: board[toR][toC],
    });
  });

  /* ─── Gacha Roll ─── */
  router.post("/api/merge/gacha", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const p = getPlayer(userId);
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
    if (!p.merge.generators.includes(chainId)) {
      p.merge.generators.push(chainId);
      if (!p.merge.generatorState[chainId]) {
        p.merge.generatorState[chainId] = {
          tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT,
          cooldownEnd: 0,
        };
      }
    }

    debouncedSavePlayer(userId);
    res.json({
      success: true,
      merge: p.merge,
      resources: p.resources,
      spawned: { r, c, chainId },
    });
  });

  /* ─── Daily Free Pull ─── */
  router.post("/api/merge/free-pull", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const p = getPlayer(userId);
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
    if (!p.merge.generators.includes(chainId)) {
      p.merge.generators.push(chainId);
      if (!p.merge.generatorState[chainId]) {
        p.merge.generatorState[chainId] = {
          tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT,
          cooldownEnd: 0,
        };
      }
    }

    debouncedSavePlayer(userId);
    res.json({
      success: true,
      merge: p.merge,
      spawned: { r, c, chainId },
    });
  });

  /* ─── Trash Item ─── */
  router.post("/api/merge/trash", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { r, c } = req.body;
    if (!validCoord(r, BOARD_ROWS) || !validCoord(c, BOARD_COLS)) {
      return res.status(400).json({ error: "invalid coordinates" });
    }
    const p = getPlayer(userId);
    hydrateMergeBoard(p);

    if (!p.merge.board[r]?.[c]) {
      return res.status(400).json({ error: "empty cell" });
    }

    p.merge.board[r][c] = null;
    debouncedSavePlayer(userId);
    res.json({ success: true, merge: p.merge });
  });

  return router;
}
