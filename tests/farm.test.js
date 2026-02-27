/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Farm Feature Tests (v7.3)
 *  Tests for: streaks, achievements, season pass, boosters, events, crop config
 * ═══════════════════════════════════════════════════════
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultPlayer,
  updateStreak,
  checkAchievements,
  ACHIEVEMENTS,
  STREAK_BONUSES,
  SEASON_PASS,
  PLOT_THEMES,
  BOOSTER_CONFIG,
  EVENTS,
  getActiveEvents,
  mergeCropConfig,
  CROPS,
} from "../game-logic.js";

/* ═══════════════════════════════════════════════════
 *  STREAK SYSTEM
 * ═══════════════════════════════════════════════════ */
describe("Streak System", () => {
  it("initializes streak on first login", () => {
    const p = createDefaultPlayer("u1", "test");
    const result = updateStreak(p);
    assert.equal(p.streak.current, 1);
    assert.equal(p.streak.best, 1);
    assert.equal(p.streak.bonusMultiplier, 1);
    assert.equal(result.broken, false);
  });

  it("continues streak on consecutive days", () => {
    const p = createDefaultPlayer("u1", "test");
    const day1 = new Date("2026-01-01T12:00:00Z").getTime();
    const day2 = new Date("2026-01-02T12:00:00Z").getTime();
    updateStreak(p, day1);
    assert.equal(p.streak.current, 1);
    const result = updateStreak(p, day2);
    assert.equal(p.streak.current, 2);
    assert.equal(result.continued, true);
    assert.equal(result.broken, false);
  });

  it("breaks streak on skipped day", () => {
    const p = createDefaultPlayer("u1", "test");
    const day1 = new Date("2026-01-01T12:00:00Z").getTime();
    const day3 = new Date("2026-01-03T12:00:00Z").getTime();
    updateStreak(p, day1);
    const result = updateStreak(p, day3);
    assert.equal(p.streak.current, 1); // Reset to 1
    assert.equal(result.broken, true);
  });

  it("does not increment on same-day login", () => {
    const p = createDefaultPlayer("u1", "test");
    const day1 = new Date("2026-01-01T12:00:00Z").getTime();
    updateStreak(p, day1);
    const result = updateStreak(p, day1 + 3600_000); // Same day, different time
    assert.equal(p.streak.current, 1);
    assert.equal(result.continued, false);
  });

  it("unlocks 3-day bonus multiplier", () => {
    const p = createDefaultPlayer("u1", "test");
    for (let d = 0; d < 3; d++) {
      const t = new Date(`2026-01-0${d + 1}T12:00:00Z`).getTime();
      updateStreak(p, t);
    }
    assert.equal(p.streak.current, 3);
    assert.equal(p.streak.bonusMultiplier, 1.1);
  });

  it("unlocks 7-day bonus with seeds", () => {
    const p = createDefaultPlayer("u1", "test");
    for (let d = 0; d < 7; d++) {
      const t = new Date(`2026-01-0${d + 1}T12:00:00Z`).getTime();
      const result = updateStreak(p, t);
      if (d === 6) {
        assert.ok(result.bonusUnlocked);
        assert.equal(result.bonusUnlocked.label, "Week");
      }
    }
    assert.equal(p.streak.current, 7);
    assert.equal(p.streak.bonusMultiplier, 1.25);
  });

  it("tracks best streak", () => {
    const p = createDefaultPlayer("u1", "test");
    // Build 5-day streak
    for (let d = 0; d < 5; d++) {
      updateStreak(p, new Date(`2026-01-0${d + 1}T12:00:00Z`).getTime());
    }
    assert.equal(p.streak.best, 5);
    // Break and restart
    updateStreak(p, new Date("2026-01-08T12:00:00Z").getTime());
    assert.equal(p.streak.current, 1);
    assert.equal(p.streak.best, 5); // Best preserved
  });
});

/* ═══════════════════════════════════════════════════
 *  ACHIEVEMENTS
 * ═══════════════════════════════════════════════════ */
describe("Achievement System", () => {
  it("exports 12 achievement definitions", () => {
    assert.equal(Object.keys(ACHIEVEMENTS).length, 12);
  });

  it("unlocks first_sprout when player has farm XP", () => {
    const p = createDefaultPlayer("u1", "test");
    p.farm.xp = 5;
    const unlocked = checkAchievements(p);
    assert.ok(unlocked.includes("first_sprout"));
    assert.ok(p.achievements.first_sprout);
    assert.equal(p.achievements.first_sprout.seen, false);
  });

  it("unlocks berry_picker at 10 strawberries", () => {
    const p = createDefaultPlayer("u1", "test");
    p.farm.harvested = { strawberry: 10 };
    const unlocked = checkAchievements(p);
    assert.ok(unlocked.includes("berry_picker"));
  });

  it("does not double-unlock achievements", () => {
    const p = createDefaultPlayer("u1", "test");
    p.farm.xp = 5;
    checkAchievements(p);
    const second = checkAchievements(p);
    assert.equal(second.length, 0); // Already unlocked
  });

  it("unlocks green_thumb at 50 total harvests", () => {
    const p = createDefaultPlayer("u1", "test");
    p.farm.harvested = { strawberry: 20, blueberry: 15, tomato: 16 };
    const unlocked = checkAchievements(p);
    assert.ok(unlocked.includes("green_thumb"));
  });

  it("unlocks land_baron at 9 plots", () => {
    const p = createDefaultPlayer("u1", "test");
    p.farm.plots = Array.from({ length: 9 }, (_, i) => ({
      id: i,
      crop: null,
      plantedAt: null,
      watered: false,
    }));
    const unlocked = checkAchievements(p);
    assert.ok(unlocked.includes("land_baron"));
  });

  it("unlocks week_warrior from streak best", () => {
    const p = createDefaultPlayer("u1", "test");
    p.streak.best = 7;
    const unlocked = checkAchievements(p);
    assert.ok(unlocked.includes("week_warrior"));
  });
});

/* ═══════════════════════════════════════════════════
 *  SEASON PASS CONFIG
 * ═══════════════════════════════════════════════════ */
describe("Season Pass", () => {
  it("defines 8 tiers with ascending XP", () => {
    const tiers = SEASON_PASS.tiers;
    assert.equal(tiers.length, 8);
    for (let i = 1; i < tiers.length; i++) {
      assert.ok(
        tiers[i].xp > tiers[i - 1].xp,
        `Tier ${i} XP should exceed tier ${i - 1}`,
      );
    }
  });

  it("every tier has a reward and label", () => {
    for (const tier of SEASON_PASS.tiers) {
      assert.ok(tier.reward, `Tier ${tier.label} missing reward`);
      assert.ok(tier.label, "Tier missing label");
    }
  });

  it("max XP tier is 5000", () => {
    const maxTier = SEASON_PASS.tiers[SEASON_PASS.tiers.length - 1];
    assert.equal(maxTier.xp, 5000);
  });
});

/* ═══════════════════════════════════════════════════
 *  BOOSTER CONFIG
 * ═══════════════════════════════════════════════════ */
describe("Booster Config", () => {
  it("defines fertilizer with correct defaults", () => {
    const fert = BOOSTER_CONFIG.fertilizer;
    assert.ok(fert);
    assert.equal(fert.durationMs, 3_600_000);
    assert.equal(fert.growthMultiplier, 0.5);
    assert.equal(fert.cost, 50);
  });
});

/* ═══════════════════════════════════════════════════
 *  PLOT THEMES
 * ═══════════════════════════════════════════════════ */
describe("Plot Themes", () => {
  it("defines 4 themes including default", () => {
    assert.equal(Object.keys(PLOT_THEMES).length, 4);
    assert.ok(PLOT_THEMES.default);
    assert.equal(PLOT_THEMES.default.cost, 0);
  });

  it("all themes have required fields", () => {
    for (const [id, theme] of Object.entries(PLOT_THEMES)) {
      assert.ok(theme.name, `Theme ${id} missing name`);
      assert.ok(theme.emoji, `Theme ${id} missing emoji`);
      assert.equal(
        typeof theme.cost,
        "number",
        `Theme ${id} cost should be number`,
      );
      assert.ok(theme.borderColor, `Theme ${id} missing borderColor`);
      assert.ok(theme.glowColor, `Theme ${id} missing glowColor`);
    }
  });
});

/* ═══════════════════════════════════════════════════
 *  EVENT FRAMEWORK
 * ═══════════════════════════════════════════════════ */
describe("Event Framework", () => {
  it("defines at least 2 event templates", () => {
    assert.ok(EVENTS.length >= 2);
  });

  it("returns no active events for null-dated templates", () => {
    const active = getActiveEvents();
    assert.equal(active.length, 0);
  });

  it("spring_bloom has a special crop", () => {
    const spring = EVENTS.find((e) => e.id === "spring_bloom");
    assert.ok(spring.specialCrop);
    assert.equal(spring.specialCrop.id, "cherry_blossom");
  });
});

/* ═══════════════════════════════════════════════════
 *  CROP CONFIG
 * ═══════════════════════════════════════════════════ */
describe("Crop Config", () => {
  it("all 8 crops have lore text", () => {
    for (const [id, cfg] of Object.entries(CROPS)) {
      assert.ok(cfg.lore, `Crop ${id} missing lore`);
      assert.ok(cfg.lore.length > 10, `Crop ${id} lore too short`);
    }
  });

  it("mergeCropConfig preserves base and adds overrides", () => {
    const overrides = {
      strawberry: { sellPrice: 999 },
      event_crop: { id: "event_crop", name: "Event", sellPrice: 50 },
    };
    const merged = mergeCropConfig(CROPS, overrides);
    assert.equal(merged.strawberry.sellPrice, 999);
    assert.ok(merged.strawberry.growthTime); // Base field preserved
    assert.equal(merged.event_crop.name, "Event");
  });
});

/* ═══════════════════════════════════════════════════
 *  PLAYER FACTORY
 * ═══════════════════════════════════════════════════ */
describe("createDefaultPlayer v7", () => {
  it("creates player with schema version 7", () => {
    const p = createDefaultPlayer("u1", "test");
    assert.equal(p.schemaVersion, 7);
  });

  it("includes ALL new feature fields", () => {
    const p = createDefaultPlayer("u1", "test");
    assert.ok(p.streak);
    assert.equal(p.streak.current, 0);
    assert.ok(p.achievements);
    assert.ok(p.journal);
    assert.deepEqual(p.journal.discovered, []);
    assert.ok(p.cosmetics);
    assert.equal(p.cosmetics.activePlotTheme, "default");
    assert.ok(p.seasonPass);
    assert.equal(p.seasonPass.xp, 0);
    assert.ok(p.boosters);
    assert.equal(p.boosters.fertilizer.active, false);
  });

  it("does NOT include phantom planter in inventory", () => {
    const p = createDefaultPlayer("u1", "test");
    assert.equal(p.farm.inventory.planter, undefined);
  });
});

/* ═══════════════════════════════════════════════════
 *  STREAK BONUSES CONFIG
 * ═══════════════════════════════════════════════════ */
describe("Streak Bonuses Config", () => {
  it("defines 4 bonus tiers with ascending days", () => {
    assert.equal(STREAK_BONUSES.length, 4);
    for (let i = 1; i < STREAK_BONUSES.length; i++) {
      assert.ok(STREAK_BONUSES[i].days > STREAK_BONUSES[i - 1].days);
    }
  });

  it("multipliers increase with streak length", () => {
    for (let i = 1; i < STREAK_BONUSES.length; i++) {
      assert.ok(
        STREAK_BONUSES[i].multiplier > STREAK_BONUSES[i - 1].multiplier,
      );
    }
  });
});
