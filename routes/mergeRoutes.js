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
  hydrateMergeBoard,
  getEmptyCells,
  getMergeFreeTapClaim,
  validCoord,
  BOARD_ROWS,
  BOARD_COLS,
  CROPS,
  CROP_TIERS,
  getMergePairResult,
  getStarterMergeItemIds,
  getStarterMergeRecipeIds,
  isMergeGeneratorChain,
  MERGE_START_CHAIN_ID,
  MERGE_WILD_GENERATOR_ID,
  normalizeMergeChainId,
  pickMergeDropChainId,
  TIER_YIELD,
} from "../game-logic.js";
import { withPlayerLock } from "../playerManager.js";
import { routeFail, routeOk, sendRouteResult } from "./mutationResults.js";

export default function mergeRoutes(requireAuth, resolveUser) {
  const router = Router();

  function ensureMergeState(p) {
    hydrateMergeBoard(p);
    const sourceGenerators = Array.isArray(p.merge.generators) && p.merge.generators.length
      ? p.merge.generators
      : [MERGE_START_CHAIN_ID];
    p.merge.generators = [...new Set(sourceGenerators.map(normalizeMergeChainId).filter(Boolean))];
    if (!p.merge.generators.length) p.merge.generators = [MERGE_START_CHAIN_ID];
    if (!p.merge.generatorState) p.merge.generatorState = {};
    const migratedState = {};
    for (const [chainId, state] of Object.entries(p.merge.generatorState)) {
      if (chainId === MERGE_WILD_GENERATOR_ID && !migratedState[MERGE_WILD_GENERATOR_ID]) {
        migratedState[MERGE_WILD_GENERATOR_ID] = state;
        continue;
      }
      const normalized = normalizeMergeChainId(chainId);
      if (normalized && !migratedState[normalized]) migratedState[normalized] = state;
    }
    p.merge.generatorState = migratedState;
    if (p.merge.lastFreePull == null) p.merge.lastFreePull = 0;
    if (p.merge.lastFreeTaps == null) p.merge.lastFreeTaps = 0;
    if (p.merge.freeTapCharges == null) p.merge.freeTapCharges = 0;
    const starterRecipes = getStarterMergeRecipeIds();
    const discoveredRecipes = Array.isArray(p.merge.discoveredRecipes) ? p.merge.discoveredRecipes : starterRecipes;
    p.merge.discoveredRecipes = [...new Set([...starterRecipes, ...discoveredRecipes].map(String))];
    const starterItems = getStarterMergeItemIds();
    const boardItems = [];
    for (const row of p.merge.board || []) {
      for (const item of row || []) {
        if (item?.id) boardItems.push(item.id);
      }
    }
    const discoveredItems = Array.isArray(p.merge.discoveredItems) ? p.merge.discoveredItems : starterItems;
    p.merge.discoveredItems = [...new Set([...starterItems, ...discoveredItems, ...boardItems].map(String))];

    for (const chainId of p.merge.generators) {
      if (!p.merge.generatorState[chainId]) {
        p.merge.generatorState[chainId] = {
          tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT,
          cooldownEnd: 0,
        };
      }
    }
    if (!p.merge.generatorState[MERGE_WILD_GENERATOR_ID]) {
      p.merge.generatorState[MERGE_WILD_GENERATOR_ID] = {
        tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT,
        cooldownEnd: 0,
      };
    }
  }

  /** Helper: unlock chain generator if not already unlocked */
  function tryUnlockChain(p, chainId) {
    if (!isMergeGeneratorChain(chainId)) return;
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

  function rememberMergeItem(p, item) {
    if (!item?.id) return false;
    if (!Array.isArray(p.merge.discoveredItems)) p.merge.discoveredItems = getStarterMergeItemIds();
    if (p.merge.discoveredItems.includes(item.id)) return false;
    p.merge.discoveredItems.push(item.id);
    return true;
  }

  function rememberMergeRecipe(p, recipeId) {
    if (!recipeId) return false;
    if (!Array.isArray(p.merge.discoveredRecipes)) p.merge.discoveredRecipes = getStarterMergeRecipeIds();
    if (p.merge.discoveredRecipes.includes(recipeId)) return false;
    p.merge.discoveredRecipes.push(recipeId);
    return true;
  }

  /* ─── Merge State ─── */
  router.post("/api/merge/state", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await withPlayerLock(userId, async (p) => {
      ensureMergeState(p);
      return routeOk({
        merge: p.merge,
        resources: p.resources,
      });
    });
    return sendRouteResult(res, result);
  });

  /* ─── Generator Tap ─── */
  router.post("/api/merge/tap", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await withPlayerLock(userId, async (p) => {
      const { chainId = MERGE_WILD_GENERATOR_ID, cropId } = req.body;

      ensureMergeState(p);
      const wildTap = !chainId || chainId === MERGE_WILD_GENERATOR_ID;

      // Check generator unlocked state
      if (!wildTap && !MERGE_CHAINS[chainId]) {
        return routeFail(400, { error: "invalid chainId" });
      }
      if (!wildTap && !p.merge.generators.includes(chainId)) {
        return routeFail(400, { error: "generator locked" });
      }

      const generatorId = wildTap ? MERGE_WILD_GENERATOR_ID : chainId;
      const state = p.merge.generatorState[generatorId] || {
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
        return routeFail(400, {
          error: "generator cooling down",
          cooldownEnd: state.cooldownEnd,
        });
      }

      // Need at least 1 empty cell
      const empty = getEmptyCells(p.merge.board);
      if (empty.length === 0) {
        return routeFail(400, { error: "board full" });
      }

      const freeTapCharges = Math.max(0, Number(p.merge.freeTapCharges) || 0);
      const usedFreeTap = freeTapCharges > 0;

      if (!usedFreeTap) {
        if (!cropId || !CROPS[cropId]) {
          return routeFail(400, { error: "invalid crop for energy" });
        }

        // Deduct the crop only when no free tap is available.
        if (!p.farm?.harvested || !p.farm.harvested[cropId] || p.farm.harvested[cropId] <= 0) {
          return routeFail(400, { error: "not enough crops" });
        }
        p.farm.harvested[cropId]--;
        if (p.farm.harvested[cropId] <= 0) delete p.farm.harvested[cropId];
      } else {
        p.merge.freeTapCharges = freeTapCharges - 1;
      }

      // Decrement taps
      state.tapsLeft--;
      if (state.tapsLeft <= 0) {
        state.cooldownEnd = now + ECONOMY.GENERATOR_COOLDOWN_MS;
      }
      p.merge.generatorState[generatorId] = state; // Save back if it was default generated

      // Determine bundle size from crop
      const tier = CROP_TIERS[cropId] || "cheap";
      const yieldConfig = TIER_YIELD[tier];
      const minYield = yieldConfig ? yieldConfig.min : 2;
      const maxYield = yieldConfig ? yieldConfig.max : 3;
      const spawnCount = usedFreeTap ? 1 : Math.floor(Math.random() * (maxYield - minYield + 1)) + minYield;

      const spawnedItems = [];

      for (let i = 0; i < spawnCount; i++) {
        const availableCells = getEmptyCells(p.merge.board);
        if (availableCells.length === 0) break; // board full, stop spawning additional item
        const dropChainId = wildTap ? pickMergeDropChainId(p.merge.board) : chainId;
        const chain = MERGE_CHAINS[dropChainId];
        
        // Determine drop level based on configured rate (v6.2.2 tweak)
        // Base: L0 (80%), Rare: L1 (15%), Epic: L2 (5%) if chain supports it
        const rand = Math.random();
        let dropLevel = 0;
        if (rand > 0.95 && chain.items.length > 2) dropLevel = 2;
        else if (rand > 0.8 && chain.items.length > 1) dropLevel = 1;

        const [r, c] = availableCells[Math.floor(Math.random() * availableCells.length)];
        p.merge.board[r][c] = {
          id: chain.items[dropLevel],
          chainId: dropChainId,
          level: dropLevel,
        };
        if (wildTap) tryUnlockChain(p, dropChainId);
        rememberMergeItem(p, p.merge.board[r][c]);
        spawnedItems.push({ r, c });
      }

      return routeOk({
        success: true,
        merge: p.merge,
        resources: p.resources,
        harvested: p.farm.harvested, // crucial for frontend sync
        spawned: spawnedItems,       // multispawn format compatible with frontend length check
        chainId: generatorId,
        usedFreeTap,
      });
    });
    return sendRouteResult(res, result);
  });

  /* ─── Merge Items ─── */
  router.post("/api/merge/merge", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await withPlayerLock(userId, async (p) => {
      const { fromR, fromC, toR, toC } = req.body;
      hydrateMergeBoard(p);
      const board = p.merge.board;

      if (
        !validCoord(fromR, BOARD_ROWS) ||
        !validCoord(fromC, BOARD_COLS) ||
        !validCoord(toR, BOARD_ROWS) ||
        !validCoord(toC, BOARD_COLS)
      ) {
        return routeFail(400, { error: "invalid coordinates" });
      }
      const src = board[fromR][fromC];
      const dst = board[toR][toC];
      if (!src || !dst) {
        return routeFail(400, { error: "empty cell" });
      }
      const resultItem = getMergePairResult(src, dst);
      if (!resultItem) return routeFail(400, { error: "chain/level mismatch" });

      // Upgrade target, clear source
      board[toR][toC] = {
        id: resultItem.id,
        chainId: resultItem.chainId,
        level: resultItem.level,
      };
      board[fromR][fromC] = null;
      tryUnlockChain(p, resultItem.chainId);
      const recipeDiscovered = rememberMergeRecipe(p, resultItem.recipeId);
      const itemDiscovered = rememberMergeItem(p, board[toR][toC]);
      return routeOk({
        success: true,
        merge: p.merge,
        newItem: board[toR][toC],
        recipeId: resultItem.recipeId || null,
        recipeDiscovered,
        itemDiscovered,
      });
    });
    return sendRouteResult(res, result);
  });

  /* ─── Gacha Roll ─── */
  router.post("/api/merge/gacha", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await withPlayerLock(userId, async (p) => {
      hydrateMergeBoard(p);

      if ((p.resources.gachaTokens || 0) < ECONOMY.GACHA_PULL_COST) {
        return routeFail(400, {
          error: "not enough tokens",
          required: ECONOMY.GACHA_PULL_COST,
        });
      }

      const empty = getEmptyCells(p.merge.board);
      if (empty.length === 0) {
        return routeFail(400, { error: "board full" });
      }

      // Deduct tokens
      p.resources.gachaTokens -= ECONOMY.GACHA_PULL_COST;

      // Pick random chain and spawn L0 item
      const chainIds = Object.keys(MERGE_CHAINS).filter(isMergeGeneratorChain);
      const chainId = chainIds[Math.floor(Math.random() * chainIds.length)];
      const chain = MERGE_CHAINS[chainId];
      const [r, c] = empty[Math.floor(Math.random() * empty.length)];
      p.merge.board[r][c] = { id: chain.items[0], chainId, level: 0 };
      rememberMergeItem(p, p.merge.board[r][c]);

      // Unlock chain generator if not already
      tryUnlockChain(p, chainId);
      return routeOk({
        success: true,
        merge: p.merge,
        resources: p.resources,
        spawned: { r, c, chainId },
      });
    });
    return sendRouteResult(res, result);
  });

  /* ─── Daily Free Pull ─── */
  router.post("/api/merge/free-pull", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await withPlayerLock(userId, async (p) => {
      ensureMergeState(p);
      const now = Date.now();

      // Check if already used today (same UTC day)
      const lastDate = new Date(p.merge.lastFreePull || 0)
        .toISOString()
        .slice(0, 10);
      const todayDate = new Date(now).toISOString().slice(0, 10);
      if (lastDate === todayDate) {
        return routeFail(400, { error: "free pull already used today" });
      }

      const empty = getEmptyCells(p.merge.board);
      if (empty.length === 0) {
        return routeFail(400, { error: "board full" });
      }

      // Spawn random L0 item (no cost)
      const chainIds = Object.keys(MERGE_CHAINS).filter(isMergeGeneratorChain);
      const chainId = chainIds[Math.floor(Math.random() * chainIds.length)];
      const chain = MERGE_CHAINS[chainId];
      const [r, c] = empty[Math.floor(Math.random() * empty.length)];
      p.merge.board[r][c] = { id: chain.items[0], chainId, level: 0 };
      p.merge.lastFreePull = now;
      rememberMergeItem(p, p.merge.board[r][c]);

      // Unlock chain generator if not already
      tryUnlockChain(p, chainId);
      return routeOk({
        success: true,
        merge: p.merge,
        spawned: { r, c, chainId },
      });
    });
    return sendRouteResult(res, result);
  });

  /* ─── Trash Item ─── */
  router.post("/api/merge/trash", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await withPlayerLock(userId, async (p) => {
      const { r, c } = req.body;
      if (!validCoord(r, BOARD_ROWS) || !validCoord(c, BOARD_COLS)) {
        return routeFail(400, { error: "invalid coordinates" });
      }
      ensureMergeState(p);

      if (!p.merge.board[r]?.[c]) {
        return routeFail(400, { error: "empty cell" });
      }

      const trashedItem = p.merge.board[r][c];
      p.merge.board[r][c] = null;
      return routeOk({ success: true, merge: p.merge, trashedItem });
    });
    return sendRouteResult(res, result);
  });
  /* ─── Claim paced free taps ─── */
  router.post("/api/merge/claim-free-taps", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });

    const result = await withPlayerLock(userId, async (p) => {
      const now = Date.now();
      ensureMergeState(p);
      const claim = getMergeFreeTapClaim(p.merge, now);
      if (claim.claimable <= 0) {
        return routeFail(400, { error: "no free taps ready", nextFreeTapAt: claim.nextFreeTapAt });
      }

      p.merge.lastFreeTaps = claim.nextLastFreeTaps;
      p.merge.freeTapCharges = claim.freeTapCharges;

      return routeOk({ success: true, merge: p.merge, claimable: claim.claimable, nextFreeTapAt: claim.nextFreeTapAt });
    });
    return sendRouteResult(res, result);
  });

  return router;
}
