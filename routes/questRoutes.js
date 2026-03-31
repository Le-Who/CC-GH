/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Quest Routes (Pet Orders — Server Authority)
 *  Order generation, validation, fulfillment
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import crypto from "crypto";
import {
  CROPS,
  MERGE_CHAINS,
  QUEST_TIERS,
  randInt,
  pick,
  hydrateMergeBoard,
  checkAchievements,
} from "../game-logic.js";
import { withPlayerLock } from "../playerManager.js";

export default function questRoutes(requireAuth, resolveUser) {
  const router = Router();

  /** Helper: resolve range — returns fixed value or random in [min,max] */
  function resolveRange(val) {
    if (Array.isArray(val)) return randInt(val[0], val[1]);
    return val;
  }

  /**
   * Generate a single order at the given difficulty tier.
   * Easy = crops only, Medium = crops + low merge, Hard = crops + high merge.
   */
  function generateOrder(tier) {
    const tierCfg = QUEST_TIERS[tier];
    const reqs = [];
    const cropIds = Object.keys(CROPS);

    // Always add a crop requirement
    const cropId = pick(cropIds);
    const cropQty =
      tier === "easy"
        ? randInt(1, 3)
        : tier === "medium"
          ? randInt(2, 5)
          : randInt(3, 8);
    reqs.push({ type: "crop", id: cropId, qty: cropQty });

    // Medium/Hard: add merge item requirement
    if (tier === "medium" || tier === "hard") {
      const chainIds = Object.keys(MERGE_CHAINS);
      const chainId = pick(chainIds);
      const chain = MERGE_CHAINS[chainId];
      // Medium: require level 2-4, Hard: require level 4-7
      const minLvl = tier === "medium" ? 2 : 4;
      const maxLvl = tier === "medium" ? 4 : 7;
      const level = randInt(minLvl, maxLvl);
      const itemId = chain.items[level];
      reqs.push({ type: "merge", id: itemId, chainId, level, qty: 1 });
    }

    // Hard: optionally add a second crop
    if (tier === "hard" && Math.random() < 0.5) {
      const secondCropId = pick(cropIds.filter((c) => c !== cropId));
      if (secondCropId) {
        reqs.push({ type: "crop", id: secondCropId, qty: randInt(1, 4) });
      }
    }

    return {
      id: crypto.randomUUID(),
      tier,
      requirements: reqs,
      reward: {
        gold: resolveRange(tierCfg.gold),
        affectionXp: resolveRange(tierCfg.affectionXp),
        gachaTokens: resolveRange(tierCfg.gachaTokens),
        energyMaxBoost: resolveRange(tierCfg.energyMaxBoost),
      },
    };
  }

  /* ─── Get Active Orders ─── */
  router.get("/api/quests/active", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      res.json({
        orders: p.pet.activeOrders || [],
        affectionXp: p.pet.affectionXp || 0,
        affectionLevel: p.pet.affectionLevel || 1,
      });
    });
  });

  /* ─── Generate New Orders ─── */
  router.post("/api/quests/generate", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      // Max 3 active orders
      if ((p.pet.activeOrders || []).length >= 3) {
        return res.status(400).json({ error: "max active orders reached (3)" });
      }

      // Generate orders to fill up to 3 slots
      const slotsAvailable = 3 - (p.pet.activeOrders || []).length;
      const tiers = ["easy", "medium", "hard"];
      const newOrders = [];

      for (let i = 0; i < slotsAvailable; i++) {
        // Weighted tier selection based on affection level
        const lvl = p.pet.affectionLevel || 1;
        let tier;
        if (lvl < 3) {
          tier = i === 0 ? "easy" : pick(["easy", "medium"]);
        } else if (lvl < 6) {
          tier = pick(["easy", "medium", "medium"]);
        } else {
          tier = pick(tiers);
        }
        newOrders.push(generateOrder(tier));
      }

      if (!p.pet.activeOrders) p.pet.activeOrders = [];
      p.pet.activeOrders.push(...newOrders);
      res.json({
        success: true,
        orders: p.pet.activeOrders,
        newOrders,
      });
    });
  });

  /* ─── Submit (Fulfill) Order ─── */
  router.post("/api/quests/submit", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const { orderId } = req.body;

      // Hydrate merge board in case it was stored as JSON string in Postgres
      hydrateMergeBoard(p);

      const orderIdx = (p.pet.activeOrders || []).findIndex(
        (o) => o.id === orderId,
      );
      if (orderIdx === -1) {
        return res.status(400).json({ error: "order not found" });
      }
      const order = p.pet.activeOrders[orderIdx];

      // Validate all requirements
      let mergeInventory = null;
      for (const requirement of order.requirements) {
        if (requirement.type === "crop") {
          if (
            !p.farm.harvested[requirement.id] ||
            p.farm.harvested[requirement.id] < requirement.qty
          ) {
            return res.status(400).json({
              error: `not enough ${requirement.id}`,
              need: requirement.qty,
            });
          }
        } else if (requirement.type === "merge") {
          if (!mergeInventory) {
            mergeInventory = {};
            for (const row of p.merge.board) {
              for (const cell of row) {
                if (cell) {
                  mergeInventory[cell.id] = (mergeInventory[cell.id] || 0) + 1;
                }
              }
            }
          }
          const found = mergeInventory[requirement.id] || 0;
          if (found < requirement.qty) {
            return res.status(400).json({
              error: `not enough ${requirement.id} on board`,
              need: requirement.qty,
            });
          }
        }
      }

      // Deduct items atomically
      for (const requirement of order.requirements) {
        if (requirement.type === "crop") {
          p.farm.harvested[requirement.id] -= requirement.qty;
          if (p.farm.harvested[requirement.id] <= 0)
            delete p.farm.harvested[requirement.id];
        } else if (requirement.type === "merge") {
          let remaining = requirement.qty;
          for (let r = 0; r < p.merge.board.length && remaining > 0; r++) {
            for (let c = 0; c < p.merge.board[r].length && remaining > 0; c++) {
              if (
                p.merge.board[r][c] &&
                p.merge.board[r][c].id === requirement.id
              ) {
                p.merge.board[r][c] = null;
                remaining--;
              }
            }
          }
        }
      }

      // Grant rewards
      const rw = order.reward;
      p.resources.gold += rw.gold || 0;
      p.resources.gachaTokens =
        (p.resources.gachaTokens || 0) + (rw.gachaTokens || 0);
      p.pet.affectionXp = (p.pet.affectionXp || 0) + (rw.affectionXp || 0);

      // Energy max boost (permanent)
      if (rw.energyMaxBoost > 0) {
        p.resources.energy.max += rw.energyMaxBoost;
      }

      // Affection leveling: 100 XP per level, scaling ×1.5
      let afLeveledUp = false;
      let xpNeeded = (p.pet.affectionLevel || 1) * 100;
      while (p.pet.affectionXp >= xpNeeded) {
        p.pet.affectionXp -= xpNeeded;
        p.pet.affectionLevel = (p.pet.affectionLevel || 1) + 1;
        xpNeeded = p.pet.affectionLevel * 100;
        afLeveledUp = true;
      }

      // Remove fulfilled order
      p.pet.activeOrders.splice(orderIdx, 1);

      // Track quest completions for seed unlocks & achievements
      p.questsCompleted = (p.questsCompleted || 0) + 1;
      const newAchievements = checkAchievements(p);

      res.json({
        success: true,
        reward: rw,
        resources: p.resources,
        merge: p.merge,
        harvested: p.farm.harvested,
        pet: p.pet,
        affectionLeveledUp: afLeveledUp,
        orders: p.pet.activeOrders,
        questsCompleted: p.questsCompleted,
        newAchievements,
      });
    });
  });

  return router;
}
