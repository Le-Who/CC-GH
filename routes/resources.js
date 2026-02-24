/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Resources & Pet Routes
 *  Energy/gold state, crop selling, pet feeding
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import {
  ECONOMY,
  CROPS,
  calcRegen,
  claimDailyReward,
  DAILY_LOGIN_REWARDS,
  generateWeeklyChallenges,
  updateWeeklyStat,
  calcAccountLevel,
  getPetMood,
  getTomorrowPreview,
  checkAchievements,
  ACHIEVEMENTS,
  // v8.0 Tamagotchi
  PET_NEEDS_CONFIG,
  calculateNeedsDecay,
  computeMood,
  checkEvolution,
  HAPPINESS_REWARDS,
  PET_COSMETICS,
  getPetMoodBonus,
} from "../game-logic.js";
import { getPlayer, debouncedSavePlayer } from "../playerManager.js";

export default function resourcesRoutes(requireAuth, resolveUser) {
  const router = Router();

  router.get("/api/resources/state", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const p = getPlayer(userId, username);
    calcRegen(p);

    // v8.0: Compute pet needs decay since last update
    if (p.pet?.needs?.lastDecayTimestamp) {
      const elapsed = Date.now() - p.pet.needs.lastDecayTimestamp;
      if (elapsed > 60_000) {
        const decayed = calculateNeedsDecay(p.pet.needs, elapsed);
        // Return comfort boost if absent > 8h
        if (elapsed >= PET_NEEDS_CONFIG.RETURN_COMFORT_THRESHOLD_MS) {
          decayed.hunger = Math.min(
            100,
            decayed.hunger + PET_NEEDS_CONFIG.RETURN_COMFORT_BOOST,
          );
          decayed.happiness = Math.min(
            100,
            decayed.happiness + PET_NEEDS_CONFIG.RETURN_COMFORT_BOOST,
          );
          decayed.cleanliness = Math.min(
            100,
            decayed.cleanliness + PET_NEEDS_CONFIG.RETURN_COMFORT_BOOST,
          );
        }
        // Session login happiness bonus
        decayed.happiness = Math.min(
          100,
          decayed.happiness + PET_NEEDS_CONFIG.SESSION_HAPPINESS_BONUS,
        );
        p.pet.needs = decayed;
        debouncedSavePlayer(userId);
      }
    }

    const mood = p.pet?.needs ? computeMood(p.pet.needs) : null;
    res.json({
      resources: p.resources,
      pet: p.pet,
      petMood: mood,
      harvested: p.farm.harvested,
    });
  });

  /* ─── Sell Crop ─── */
  router.post("/api/farm/sell-crop", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { cropId } = req.body;
    const p = getPlayer(userId);
    if (!cropId || !p.farm.harvested[cropId] || p.farm.harvested[cropId] <= 0) {
      return res.status(400).json({ error: "no harvested crop to sell" });
    }
    const cfg = CROPS[cropId];
    if (!cfg) return res.status(400).json({ error: "unknown crop" });
    const sellPrice = cfg.sellPrice;
    p.farm.harvested[cropId]--;
    if (p.farm.harvested[cropId] <= 0) delete p.farm.harvested[cropId];
    p.resources.gold += sellPrice;
    debouncedSavePlayer(userId);
    res.json({
      success: true,
      resources: p.resources,
      harvested: p.farm.harvested,
      soldFor: sellPrice,
    });
  });

  router.post("/api/pet/feed", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { cropId } = req.body;
    const p = getPlayer(userId);
    calcRegen(p);

    // Validate crop
    if (!cropId || !p.farm.harvested[cropId] || p.farm.harvested[cropId] <= 0) {
      return res.status(400).json({ error: "no harvested crop to feed" });
    }
    const cfg = CROPS[cropId];
    if (!cfg) return res.status(400).json({ error: "unknown crop" });

    // Satiety guard: block feeding if pet is full
    const currentFullness = p.pet.stats?.fullness ?? 0;
    if (currentFullness >= 100) {
      return res.status(400).json({ error: "pet is too full" });
    }

    // Deduct crop
    p.farm.harvested[cropId]--;
    if (p.farm.harvested[cropId] <= 0) delete p.farm.harvested[cropId];

    // Restore energy — dynamic yield from crop
    const e = p.resources.energy;
    e.current = Math.min(e.max, e.current + (cfg.energyYield || 1));

    // Update satiety
    if (!p.pet.stats) p.pet.stats = { happiness: 100, fullness: 0 };
    p.pet.stats.fullness = Math.min(
      100,
      currentFullness + (cfg.fullnessYield || 5),
    );
    p.pet.lastDigestionTimestamp = Date.now();

    // Pet XP & leveling
    p.pet.xp += ECONOMY.FEED_PET_XP;
    let leveledUp = false;
    while (p.pet.xp >= p.pet.xpToNextLevel) {
      p.pet.xp -= p.pet.xpToNextLevel;
      p.pet.level++;
      p.pet.xpToNextLevel = Math.floor(p.pet.xpToNextLevel * 1.5);
      leveledUp = true;
    }

    // Unlock abilities
    if (p.pet.level >= 3) p.pet.abilities.autoHarvest = true;
    if (p.pet.level >= 5) p.pet.abilities.autoWater = true;
    if (p.pet.level >= 7) p.pet.abilities.autoPlant = true;

    // Happiness boost
    p.pet.stats.happiness = Math.min(100, p.pet.stats.happiness + 5);

    // v8.0: Also update Tamagotchi needs.hunger
    if (p.pet.needs) {
      p.pet.needs.hunger = Math.min(
        100,
        (p.pet.needs.hunger || 0) + (cfg.fullnessYield || 5),
      );
      p.pet.needs.lastDecayTimestamp = Date.now();
    }

    const mood = p.pet.needs ? computeMood(p.pet.needs) : null;
    debouncedSavePlayer(userId);
    res.json({
      success: true,
      resources: p.resources,
      pet: p.pet,
      petMood: mood,
      harvested: p.farm.harvested,
      leveledUp,
    });
  });

  /* ─── Rename Pet (IKEA Effect UX) ─── */
  router.post("/api/pet/rename", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { newName } = req.body;
    const p = getPlayer(userId);

    if (
      !newName ||
      typeof newName !== "string" ||
      newName.trim().length === 0
    ) {
      return res.status(400).json({ error: "Invalid name" });
    }

    const cleanName = newName.trim().substring(0, 16);
    p.pet.name = cleanName;
    debouncedSavePlayer(userId);

    res.json({
      success: true,
      pet: p.pet,
    });
  });

  /* ─── Feed Pet Snack (starter pet food, separate from crops) ─── */
  router.post("/api/pet/feed-snack", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const p = getPlayer(userId);
    if (!p.pet) return res.status(400).json({ error: "no pet" });
    if ((p.pet.petFood || 0) <= 0) {
      return res.status(400).json({ error: "no pet snacks left" });
    }
    p.pet.petFood--;
    if (p.pet.needs) {
      p.pet.needs.hunger = Math.min(100, (p.pet.needs.hunger || 0) + 25);
      p.pet.needs.lastDecayTimestamp = Date.now();
    }
    // Also feed legacy satiety
    if (!p.pet.stats) p.pet.stats = { happiness: 100, fullness: 0 };
    p.pet.stats.fullness = Math.min(100, (p.pet.stats.fullness || 0) + 25);
    p.pet.stats.happiness = Math.min(100, p.pet.stats.happiness + 3);

    const mood = p.pet.needs ? computeMood(p.pet.needs) : null;
    debouncedSavePlayer(userId);
    res.json({ success: true, pet: p.pet, petMood: mood });
  });

  /* ─── Get Pet Needs + Mood (v8.0 Tamagotchi) ─── */
  router.get("/api/pet/needs", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    const p = getPlayer(userId, username);
    if (!p.pet?.needs) {
      return res.json({ needs: null, mood: null });
    }
    // Compute decay since last update
    const elapsed = Date.now() - (p.pet.needs.lastDecayTimestamp || Date.now());
    if (elapsed > 60_000) {
      p.pet.needs = calculateNeedsDecay(p.pet.needs, elapsed);
      debouncedSavePlayer(userId);
    }
    const mood = computeMood(p.pet.needs);
    const evolution = checkEvolution(p.pet.affectionLevel || 1);
    res.json({
      needs: p.pet.needs,
      mood: { name: mood.name, emoji: mood.emoji, score: mood.score },
      evolution,
      petFood: p.pet.petFood || 0,
    });
  });

  /* ─── Emit Happiness Event (cross-mode integration bridge) ─── */
  router.post("/api/pet/happiness", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { source } = req.body;
    const p = getPlayer(userId);
    if (!p.pet?.needs) return res.json({ success: false });
    const amount = HAPPINESS_REWARDS[source];
    if (!amount)
      return res.status(400).json({ error: "unknown happiness source" });
    p.pet.needs.happiness = Math.min(
      100,
      (p.pet.needs.happiness || 0) + amount,
    );
    p.pet.needs.lastDecayTimestamp = Date.now();
    const mood = computeMood(p.pet.needs);
    debouncedSavePlayer(userId);
    res.json({
      success: true,
      happiness: p.pet.needs.happiness,
      mood: mood.name,
    });
  });

  /* ─── Equip Pet Cosmetic ─── */
  router.post("/api/pet/equip", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { itemId, slot } = req.body;
    const p = getPlayer(userId);
    if (!p.pet?.equipped) return res.status(400).json({ error: "no pet" });
    // Unequip
    if (!itemId) {
      if (slot && p.pet.equipped[slot] !== undefined) {
        p.pet.equipped[slot] = null;
        debouncedSavePlayer(userId);
        return res.json({ success: true, equipped: p.pet.equipped });
      }
      return res.status(400).json({ error: "invalid slot" });
    }
    // Equip
    const cosmetic = PET_COSMETICS[itemId];
    if (!cosmetic) return res.status(400).json({ error: "unknown cosmetic" });
    if (!p.pet.wardrobe?.includes(itemId)) {
      return res.status(400).json({ error: "cosmetic not owned" });
    }
    p.pet.equipped[cosmetic.slot] = itemId;
    debouncedSavePlayer(userId);
    res.json({ success: true, equipped: p.pet.equipped });
  });

  return router;
}

/* ═══════════════════════════════════════════════════════
 *  Retention Routes — Daily Rewards, Weekly Challenges,
 *  Account Level, Tomorrow Preview, Achievements
 * ═══════════════════════════════════════════════════════ */
export function retentionRoutes(requireAuth, resolveUser) {
  const router = Router();

  /* ─── Daily Login Reward ─── */
  router.post("/api/daily-reward/claim", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const p = getPlayer(userId, username);
    const result = claimDailyReward(p);
    if (result.claimed) debouncedSavePlayer(userId);
    // Always return calendar state for UI
    const calendar = DAILY_LOGIN_REWARDS.map((d, i) => ({
      ...d,
      claimed: i < (p.dailyReward?.weekDay || 0),
      isToday: d.day === (p.dailyReward?.weekDay || 0),
    }));
    res.json({ ...result, calendar, streak: p.streak });
  });

  /* ─── Daily Reward State (GET) ─── */
  router.get("/api/daily-reward/state", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    const p = getPlayer(userId, username);
    const today = new Date().toISOString().slice(0, 10);
    const alreadyClaimed = p.dailyReward?.lastClaimDate === today;
    const currentDay = p.dailyReward?.weekDay || 0;
    const calendar = DAILY_LOGIN_REWARDS.map((d, i) => ({
      ...d,
      claimed: i < currentDay,
      isToday: d.day === currentDay + (alreadyClaimed ? 0 : 1),
    }));
    res.json({ alreadyClaimed, currentDay, calendar, streak: p.streak });
  });

  /* ─── Weekly Challenges ─── */
  router.get("/api/weekly-challenges", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    const p = getPlayer(userId, username);
    const wc = generateWeeklyChallenges(p);
    debouncedSavePlayer(userId);
    // Calculate time remaining in week
    const d = new Date();
    const dayOfWeek = d.getUTCDay() || 7;
    const msUntilReset =
      (8 - dayOfWeek) * 86_400_000 -
      (d.getUTCHours() * 3_600_000 + d.getUTCMinutes() * 60_000);
    res.json({ ...wc, msUntilReset });
  });

  /* ─── Account Level ─── */
  router.get("/api/account-level", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    const p = getPlayer(userId, username);
    res.json(calcAccountLevel(p));
  });

  /* ─── Pet Mood ─── */
  router.get("/api/pet/mood", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    const p = getPlayer(userId, username);
    res.json(getPetMood(p.pet));
  });

  /* ─── Tomorrow's Preview ─── */
  router.get("/api/tomorrow-preview", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    const p = getPlayer(userId, username);
    res.json({ preview: getTomorrowPreview(p) });
  });

  /* ─── Check Achievements (returns newly unlocked) ─── */
  router.post("/api/achievements/check", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    const p = getPlayer(userId, username);
    const newlyUnlocked = checkAchievements(p);
    if (newlyUnlocked.length > 0) debouncedSavePlayer(userId);
    const achievements = newlyUnlocked.map((id) => ({
      id,
      ...ACHIEVEMENTS[id],
      check: undefined, // Strip function from response
    }));
    res.json({
      newlyUnlocked: achievements,
      total: Object.keys(ACHIEVEMENTS).length,
      unlocked: Object.keys(p.achievements || {}).length,
    });
  });

  /* ─── v8.0: Pet Card — Discord rich embed ─── */
  router.get("/api/pet/card/:userId", (req, res) => {
    const p = getPlayer(req.params.userId);
    if (!p?.pet) return res.status(404).send("Pet not found");

    const pet = p.pet;
    const emoji =
      pet.skinId === "basic_cat"
        ? "🐱"
        : pet.skinId === "basic_bunny"
          ? "🐰"
          : "🐕";
    const title = `${emoji} ${pet.name || "Pet"} — Lv ${pet.level || 1}`;
    const desc = `Mood: ${pet.mood || "Content"} | XP: ${pet.xp || 0}/${pet.xpToNextLevel || 100} | Fullness: ${pet.stats?.fullness ?? 0}%`;

    res.type("html").send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:type" content="profile">
  <meta name="theme-color" content="#7c5cfc">
  <title>${title}</title>
  <style>
    body { font-family: sans-serif; background: #1a1b2e; color: #f8f9fa; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { text-align: center; background: rgba(255,255,255,0.05); padding: 32px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); }
    .emoji { font-size: 4rem; margin-bottom: 8px; }
    .name { font-size: 1.5rem; font-weight: 800; }
    .info { font-size: 0.9rem; color: #9ca3af; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">${emoji}</div>
    <div class="name">${pet.name || "Pet"}</div>
    <div class="info">Level ${pet.level || 1} · ${pet.mood || "Content"}</div>
    <div class="info">XP: ${pet.xp || 0}/${pet.xpToNextLevel || 100}</div>
  </div>
</body>
</html>`);
  });

  return router;
}
