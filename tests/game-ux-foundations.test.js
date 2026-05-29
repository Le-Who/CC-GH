import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GAME_REGISTRY, PIXI_GAME_IDS, VISIBLE_GAME_IDS } from "../src/app/gameRegistry.js";
import { buildGameHudDescriptors } from "../src/app/useGameHudDescriptors.js";
import { createClientActionId, shouldUseDurableOutbox } from "../src/game-state/reliableActions.js";
import { normalizeActiveTab, readInitialActiveTab } from "../src/game-state/useGameHub.js";
import { selectMatch3InitialRun } from "../src/games/match3/selectMatch3Run.js";
import { deriveServerNow } from "../src/games/merge/useServerClock.js";
import { getQuestionTiming } from "../src/games/trivia/useQuestionTimer.js";

describe("Telegram Mini App game UX foundations", () => {
  it("keeps Farm registered for runtime compatibility but hidden from navigation", () => {
    assert.equal(GAME_REGISTRY.farm.visible, false);
    assert.equal(GAME_REGISTRY.farm.pixiScene, true);
    assert.ok(!VISIBLE_GAME_IDS.includes("farm"));
    assert.ok(PIXI_GAME_IDS.includes("farm"));
    assert.ok(VISIBLE_GAME_IDS.includes("settlement"));
    assert.ok(PIXI_GAME_IDS.includes("settlement"));
  });

  it("separates durable outbox actions from receipt-only gameplay actions", () => {
    assert.equal(shouldUseDurableOutbox("yard.collectGifts"), true);
    assert.equal(shouldUseDurableOutbox("garden.levelUp"), true);
    assert.equal(shouldUseDurableOutbox("blox.place"), false);

    const id = createClientActionId("blox.place", "blox", ["piece 1", "0:2"]);
    assert.match(id, /^blox:/);
    assert.ok(id.includes("blox-place"));
    assert.ok(!id.includes("piece 1"));
  });

  it("restores the last active tab for refreshes and ignores invalid tabs", () => {
    const originalWindow = globalThis.window;
    const historyCalls = [];
    const makeStorage = (entries = {}) => {
      const data = new Map(Object.entries(entries));
      return {
        getItem(key) {
          return data.has(key) ? data.get(key) : null;
        },
        setItem(key, value) {
          data.set(key, String(value));
        },
      };
    };

    globalThis.window = {
      location: new URL("https://example.test/?tab=merge"),
      sessionStorage: makeStorage(),
      history: {
        state: null,
        replaceState(_state, _title, url) {
          historyCalls.push(String(url));
        },
      },
    };

    try {
      assert.equal(readInitialActiveTab(), "merge");
      assert.equal(normalizeActiveTab("bubbo"), "bubbo");
      assert.equal(normalizeActiveTab("settlement"), "settlement");
      assert.equal(normalizeActiveTab("farm"), "garden");

      globalThis.window.location = new URL("https://example.test/");
      globalThis.window.sessionStorage = makeStorage({ game_hub_active_tab_v1: "match3" });
      assert.equal(readInitialActiveTab(), "match3");
    } finally {
      globalThis.window = originalWindow;
    }
    assert.equal(historyCalls.length, 0);
  });

  it("uses semantic game HUD descriptors instead of generic currency chips", () => {
    const descriptors = buildGameHudDescriptors("merge", {
      merge: { alchemyEssence: 12, freeTapCharges: 3 },
      farm: { harvested: { carrot: 2, wheat: 4 } },
      resources: {},
    });

    assert.deepEqual(descriptors.map((item) => item.id), ["essence", "freeTaps", "fuel"]);
    assert.deepEqual(descriptors.map((item) => item.value), [12, 3, 6]);
  });

  it("builds active-game HUD descriptors when shell-local state is not available yet", () => {
    const descriptors = buildGameHudDescriptors("bubbo", {
      bubbo: { currentGame: { score: 70, shotsLeft: 8, pressureLabel: "Danger" } },
      resources: {},
    }, null);

    assert.deepEqual(descriptors.map((item) => item.id), ["score", "shots", "pressure"]);
    assert.deepEqual(descriptors.map((item) => item.value), [70, 8, "Danger"]);
  });

  it("defines horizontal safe-area variables used by floating HUD chrome", () => {
    const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

    assert.match(css, /--safe-left:\s*var\(--tg-viewport-safe-area-inset-left,\s*env\(safe-area-inset-left,\s*0px\)\)/);
    assert.match(css, /--safe-right:\s*var\(--tg-viewport-safe-area-inset-right,\s*env\(safe-area-inset-right,\s*0px\)\)/);
    assert.match(css, /\.telegram-app\[data-active-tab="garden"\]\s+\.topbar\s*\{[^}]*right:\s*max\(8px,\s*var\(--safe-right\)\)/s);
  });

  it("wires Bubbo reference power-ups through live HUD state and sync", () => {
    const bubboGame = readFileSync(new URL("../src/games/bubbo/BubboGame.jsx", import.meta.url), "utf8");

    assert.match(bubboGame, /BUBBO_POWERUP_CHARGES/);
    assert.match(bubboGame, /resolveBubboPowerup/);
    assert.match(bubboGame, /const \[powerups,\s*setPowerups\]/);
    assert.match(bubboGame, /const \[activePowerup,\s*setActivePowerup\]/);
    assert.match(bubboGame, /data-bubbo-powerup=\{item\.id\}/);
    assert.match(bubboGame, /powerups:\s*nextPowerups/);
    assert.match(bubboGame, /powerup:\s*shotPowerup \|\| null/);
  });

  it("keeps Bubbo live playfield on an underwater reference backdrop", () => {
    const css = readFileSync(new URL("../src/games/bubbo/bubbo.css", import.meta.url), "utf8");
    const runtime = readFileSync(new URL("../src/game-runtime/scenes/shared/runtime.js", import.meta.url), "utf8");
    const assets = readFileSync(new URL("../src/game-runtime/assetBundles.js", import.meta.url), "utf8");
    const pipeline = readFileSync(new URL("../scripts/assets-pipeline.config.mjs", import.meta.url), "utf8");

    assert.doesNotMatch(css, /(?:field-mask|background-tile|underwater-backdrop)\.png/, "Bubbo CSS must not layer bitmap backdrops under the Pixi playfield");
    assert.match(runtime, /backgroundUnderwater:\s*"bubbo\.background\.underwater"/);
    assert.match(assets, /"bubbo\.background\.underwater":\s*"\/games\/bubbo-bubbo\/images\/underwater-backdrop\.png"/);
    assert.match(pipeline, /entry\("bubbo\.background\.underwater",\s*"public\/games\/bubbo-bubbo\/images\/underwater-backdrop\.png"/);
  });

  it("wires Building Blox reference rotate charges through live HUD and server state", () => {
    const bloxGame = readFileSync(new URL("../src/games/blox/BloxGame.jsx", import.meta.url), "utf8");
    const playerRoutes = readFileSync(new URL("../routes/player.js", import.meta.url), "utf8");
    assert.match(playerRoutes, /rotateCharges:\s*DEFAULT_BLOX_ROTATE_CHARGES/);
    assert.match(playerRoutes, /case "blox\.rotate"/);
    assert.match(playerRoutes, /rotateBloxPiece\(trayItem\.piece\)/);
    assert.match(bloxGame, /rotateCharges/);
    assert.match(bloxGame, /rotateSelectedPiece/);
    assert.match(bloxGame, /data-blox-rotate/);
  });

  it("keeps Pixi-owned playfield backgrounds out of CSS fallback layers", () => {
    const bloxCss = readFileSync(new URL("../src/games/blox/blox.css", import.meta.url), "utf8");
    const farmCss = readFileSync(new URL("../src/games/farm/farm.css", import.meta.url), "utf8");
    const bloxScene = readFileSync(new URL("../src/game-runtime/scenes/bloxScene.js", import.meta.url), "utf8");
    const farmScene = readFileSync(new URL("../src/game-runtime/scenes/farmScene.js", import.meta.url), "utf8");
    assert.match(bloxScene, /coverSprite\(gameAsset\(BLOX_ASSET_KEYS\.background\)/);
    assert.match(farmScene, /coverSprite\(gameAsset\(FARM_ASSET_KEYS\.backgroundField\)/);
    assert.doesNotMatch(bloxCss, /\/games\/blox\/background\.png/);
    assert.doesNotMatch(farmCss, /\/games\/farm\/background-field\.png/);
  });

  it("restores Match-3 runs from snapshot currentGame before creating defaults", () => {
    const restored = selectMatch3InitialRun({
      match3: {
        currentGame: {
          board: [["fire", "water"]],
          score: 42,
          movesLeft: 9,
          combo: 2,
          mode: "timed",
          boosters: { bomb: 1, lightning: 9, rainbow: -2 },
        },
      },
    }, () => ({ board: [["fallback"]], score: 0, movesLeft: 30, combo: 0, mode: "classic" }));

    assert.equal(restored.restored, true);
    assert.equal(restored.mode, "timed");
    assert.equal(restored.score, 42);
    assert.deepEqual(restored.board, [["fire", "water"]]);
    assert.deepEqual(restored.boosters, { bomb: 1, lightning: 3, rainbow: 0, hammer: 3 });
  });

  it("wires Match-3 reference boosters through live HUD state and sync", () => {
    const match3Game = readFileSync(new URL("../src/games/match3/Match3Game.jsx", import.meta.url), "utf8");
    const match3Layout = readFileSync(new URL("../src/app/hud-layout/defaultLayouts/match3.json", import.meta.url), "utf8");
    const hudRegistry = readFileSync(new URL("../src/app/hud-layout/registry.js", import.meta.url), "utf8");

    assert.match(match3Game, /MATCH3_BOOSTER_CHARGES/);
    assert.match(match3Game, /applyMatch3Booster/);
    assert.match(match3Game, /const \[boosters,\s*setBoosters\]/);
    assert.match(match3Game, /const \[activeBooster,\s*setActiveBooster\]/);
    assert.match(match3Game, /data-match3-booster=\{item\.id\}/);
    assert.match(match3Game, /data-match3-shuffle="true"/);
    assert.match(match3Game, /id="match3ActionDock"/);
    assert.match(match3Layout, /"match3ActionDock"/);
    assert.match(hudRegistry, /match3ActionDock/);
    assert.match(match3Game, /boosters:\s*nextBoosters/);
    assert.match(match3Game, /booster:\s*activeBooster/);
  });

  it("keeps Settlement startup map-first with a compact selected-building card", () => {
    const settlementGame = readFileSync(new URL("../src/games/settlement/SettlementGame.jsx", import.meta.url), "utf8");
    const settlementStore = readFileSync(new URL("../src/games/settlement/useSettlementStore.js", import.meta.url), "utf8");
    const settlementCss = readFileSync(new URL("../src/games/settlement/settlement.css", import.meta.url), "utf8");

    assert.match(settlementStore, /rightPanelOpen:\s*false/);
    assert.match(settlementGame, /function SettlementCompactDetail/);
    assert.match(settlementGame, /<SettlementCompactDetail/);
    assert.match(settlementGame, /if\s*\(rightPanelOpen\)\s*return null;/);
    assert.match(settlementGame, /selectBuilding\(building\.id\)/);
    assert.match(settlementGame, /safeH\s*>\s*safeW/);
    assert.match(settlementGame, /safeH\s*\/\s*WORLD\.h/);
    assert.match(settlementCss, /\.settlement-compact-detail/);
    assert.match(settlementCss, /\.settlement-compact-detail-open/);
  });

  it("derives server clock and question timing from real elapsed time", () => {
    assert.equal(deriveServerNow({ serverTime: 1000, receivedAt: 900 }, 1400), 1500);
    const timing = getQuestionTiming(10_000, 12_450, 15_000);
    assert.equal(timing.timeMs, 2450);
    assert.equal(timing.remainingMs, 12_550);
    assert.ok(timing.progress < 1 && timing.progress > 0.8);
  });

  it("freezes Brain Blitz question timing across pauses", () => {
    const timing = getQuestionTiming(10_000, 20_000, 15_000, 6_000);
    assert.equal(timing.timeMs, 4000);
    assert.equal(timing.remainingMs, 11_000);
    assert.ok(timing.progress < 0.75 && timing.progress > 0.7);
  });

  it("wires Brain Blitz pause state into timer and answer locking", () => {
    const triviaGame = readFileSync(new URL("../src/games/trivia/TriviaGame.jsx", import.meta.url), "utf8");
    assert.match(triviaGame, /useQuestionTimer\(question,\s*\(question\?\.timeLimit \|\| 15\) \* 1000,\s*paused\)/);
    assert.match(triviaGame, /if\s*\(paused\s*\|\|\s*reveal\)\s*return;/);
    assert.match(triviaGame, /<QuestionPanel[\s\S]*paused=\{activePause\}/);
    assert.match(triviaGame, /disabled=\{paused\s*\|\|\s*!!reveal\s*\|\|\s*isHidden\}/);
  });

  it("wires Brain Blitz audience lifeline through server response and answer HUD", () => {
    const triviaGame = readFileSync(new URL("../src/games/trivia/TriviaGame.jsx", import.meta.url), "utf8");
    const triviaRoutes = readFileSync(new URL("../routes/trivia.js", import.meta.url), "utf8");
    const triviaCss = readFileSync(new URL("../src/games/trivia/trivia.css", import.meta.url), "utf8");
    assert.match(triviaRoutes, /type !== "fifty" && type !== "reveal" && type !== "audience"/);
    assert.match(triviaRoutes, /audiencePoll:\s*selectTriviaAudiencePoll\(q\)/);
    assert.match(triviaGame, /const \[audiencePoll,\s*setAudiencePoll\] = useState\(\{\}\);/);
    assert.match(triviaGame, /if \(data\.audiencePoll\) setAudiencePoll\(data\.audiencePoll\);/);
    assert.match(triviaGame, /onAudience=\{\(\) => useLifeline\("audience"\)\}/);
    assert.match(triviaGame, /trivia\.lifeline\.audience/);
    assert.match(triviaGame, /className="audience-poll"/);
    assert.match(triviaCss, /\.trivia-lifeline-dock\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  });

  it("keeps Brain Blitz live answers in a reference-style 2x2 card grid", () => {
    const triviaCss = readFileSync(new URL("../src/games/trivia/trivia.css", import.meta.url), "utf8");
    assert.match(triviaCss, /\.trivia-shell\[data-trivia-playing="true"\] \.question-panel\s*\{[\s\S]*grid-template-areas:\s*"meta"[\s\S]*"question"[\s\S]*"answers"[\s\S]*"lifelines"/);
    assert.match(triviaCss, /\.trivia-shell\[data-trivia-playing="true"\] \.answer-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(triviaCss, /\.trivia-shell\[data-trivia-playing="true"\] \.answer-grid\s*\{[\s\S]*grid-template-rows:\s*repeat\(2, minmax\(72px, 1fr\)\)/);
    assert.match(triviaCss, /\.trivia-shell\[data-trivia-playing="true"\] \.answer-grid button::before\s*\{[\s\S]*content:\s*counter\(trivia-answer, upper-alpha\)/);
  });

  it("keeps Merge free-tap claiming in the reference action dock language", () => {
    const mergeGame = readFileSync(new URL("../src/games/merge/MergeGame.jsx", import.meta.url), "utf8");
    const mergeCss = readFileSync(new URL("../src/games/merge/merge.css", import.meta.url), "utf8");
    const mergeI18n = readFileSync(new URL("../src/games/merge/i18n.js", import.meta.url), "utf8");

    assert.match(mergeGame, /canClaimFreeTaps\s*\?\s*t\("merge\.dailyTaps"/);
    assert.doesNotMatch(mergeGame, /canClaimFreeTaps \|\| canFreePull\s*\?\s*t\("merge\.claimDailyTokens"\)/);
    assert.match(mergeCss, /\.merge-daily-token-button\s*\{[\s\S]*\/games\/hud-redesign\/merge\/primary-button\.png/);
    assert.match(mergeI18n, /"merge\.dailyTaps":\s*"Free Taps \+\{count\}"/);
  });

  it("starts Brain Blitz duels from explicit room ids without duplicate polling starts", () => {
    const triviaGame = readFileSync(new URL("../src/games/trivia/TriviaGame.jsx", import.meta.url), "utf8");
    assert.match(triviaGame, /const duelStartInFlightRef = useRef\(""\);/);
    assert.match(triviaGame, /const activeDuelRoomRef = useRef\(""\);/);
    assert.match(triviaGame, /async function startDuel\(targetRoomId = roomId\)/);
    assert.match(triviaGame, /const nextRoomId = targetRoomId \|\| roomId;/);
    assert.match(triviaGame, /if \(duelStartInFlightRef\.current === nextRoomId\) return;/);
    assert.match(triviaGame, /if \(activeDuelRoomRef\.current === nextRoomId && question\) return;/);
    assert.match(triviaGame, /data = await api\("\/api\/trivia\/duel\/start", \{ roomId: nextRoomId \}\);/);
    assert.match(triviaGame, /if \(data\.status === "active"\) await startDuel\(data\.roomId \|\| id\);/);
    assert.match(triviaGame, /if \(data\.status === "active"\) \{\s+await startDuel\(data\.roomId\);\s+return;\s+\}/);
    assert.doesNotMatch(triviaGame, /if \(data\.status === "active"\) await startDuel\(\);/);
    assert.doesNotMatch(triviaGame, /setView\(data\.status === "active" \? "duel-play" : "duel-room"\)/);
  });

  it("keeps Garden Shelf confetti off the initial panel-open module path", () => {
    const bottomPanel = readFileSync(new URL("../src/games/garden-shelf/components/BottomPanel.tsx", import.meta.url), "utf8");
    const offlineWelcome = readFileSync(new URL("../src/games/garden-shelf/components/OfflineWelcome.tsx", import.meta.url), "utf8");
    const effects = readFileSync(new URL("../src/games/garden-shelf/lib/effects.ts", import.meta.url), "utf8");

    assert.ok(!bottomPanel.includes("import confetti from 'canvas-confetti'"));
    assert.ok(!offlineWelcome.includes("import confetti from 'canvas-confetti'"));
    assert.match(effects, /import\(['"]canvas-confetti['"]\)/);
  });

  it("wires shared overlay dismissal and mature Garden care watering through DOM text", () => {
    const dismissHook = readFileSync(new URL("../src/app/useDismissableLayer.js", import.meta.url), "utf8");
    const shell = readFileSync(new URL("../src/app/shell.jsx", import.meta.url), "utf8");
    const gardenGame = readFileSync(new URL("../src/games/garden-shelf/GardenShelfGame.tsx", import.meta.url), "utf8");
    const gardenContext = readFileSync(new URL("../src/games/garden-shelf/lib/GameContext.tsx", import.meta.url), "utf8");
    const bottomPanel = readFileSync(new URL("../src/games/garden-shelf/components/BottomPanel.tsx", import.meta.url), "utf8");

    assert.match(dismissHook, /event\.key !== "Escape"/);
    assert.match(dismissHook, /document\.addEventListener\("pointerdown"/);
    assert.match(shell, /useEscapeDismiss\(canDismissOverlay, onDismiss\)/);
    assert.match(gardenGame, /useEscapeDismiss\(open, closeSettings\)/);
    assert.match(gardenContext, /getGardenWaterCooldownMs\(plant\.phase\)/);
    assert.match(gardenContext, /getMatureWaterReward\(def\.baseClick, def\.baseXp, plant\.level\)/);
    assert.match(bottomPanel, /t\('plantDetail\.careWater'\)/);
  });

  it("keeps Garden Shelf live screen-first with compact hub chrome", () => {
    const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
    const indexCss = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
    const gardenGame = readFileSync(new URL("../src/games/garden-shelf/GardenShelfGame.tsx", import.meta.url), "utf8");
    const gardenCss = readFileSync(new URL("../src/games/garden-shelf/garden-shelf.css", import.meta.url), "utf8");

    assert.match(app, /className="topbar-title"/);
    assert.match(indexCss, /\.telegram-app\[data-active-tab="garden"\]\s+\.topbar\s*\{[\s\S]*position:\s*absolute/);
    assert.match(indexCss, /\.telegram-app\[data-active-tab="garden"\]\s+\.topbar-title\s*\{[\s\S]*display:\s*none/);
    assert.match(indexCss, /\.telegram-app\[data-active-tab="garden"\]\s+\.status-dot\s*\{[\s\S]*font-size:\s*0/);
    assert.match(gardenGame, /className=\{cn\("garden-root garden-reference-stage/);
    assert.match(gardenGame, /className="garden-greenhouse-frame"/);
    assert.doesNotMatch(gardenGame, /Glass Dome Container/);
    assert.match(gardenCss, /\.garden-reference-stage/);
    assert.match(gardenCss, /\.garden-greenhouse-frame/);
  });

  it("keeps Garden and Yard empty starts thematic instead of placeholder-empty", () => {
    const gardenCss = readFileSync(new URL("../src/games/garden-shelf/garden-shelf.css", import.meta.url), "utf8");
    const yardGame = readFileSync(new URL("../src/games/companion-yard/CompanionYardGame.jsx", import.meta.url), "utf8");
    const yardCss = readFileSync(new URL("../src/games/companion-yard/companion-yard.css", import.meta.url), "utf8");

    assert.match(gardenCss, /\.garden-spot-empty\s*\{[\s\S]*\/games\/garden-shelf\/shelf_slot_empty\.png/);
    assert.doesNotMatch(gardenCss, /\.garden-spot-empty\s*\{[^}]*background:\s*#32252a/s);
    assert.match(yardGame, /starterGoodieHints/);
    assert.match(yardGame, /className=\{`yard-starter-goodie/);
    assert.match(yardGame, /startPlaceGoodie\(goodieId\)/);
    assert.match(yardCss, /\.yard-starter-goodie\s*\{[\s\S]*min-height:\s*72px/);
  });

  it("keeps split Pixi scenes off private runtime module state", () => {
    const mergeScene = readFileSync(new URL("../src/game-runtime/scenes/mergeScene.js", import.meta.url), "utf8");

    assert.ok(!mergeScene.includes("graphicsManifest?."));
    assert.match(mergeScene, /graphicsGameAsset/);
  });
});
