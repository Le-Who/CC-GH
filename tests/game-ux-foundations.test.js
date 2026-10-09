import { readSplitGameSource } from './helpers/splitGameSources.mjs';
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GAME_REGISTRY, PIXI_GAME_IDS, VISIBLE_GAME_IDS } from "../src/app/gameRegistry.js";
import { buildGameHudDescriptors } from "../src/app/useGameHudDescriptors.js";
import { createClientActionId, shouldUseDurableOutbox } from "../src/game-state/reliableActions.js";
import { normalizeActiveTab, readInitialActiveTab } from "../src/game-state/useGameHub.js";
import { selectMatch3InitialRun } from "../src/games/match3/selectMatch3Run.js";
import { deriveServerNow } from "../src/games/merge/useServerClock.js";
import { TriviaClock } from "../src/games/trivia/triviaController.js";
import { normalizeBubboPowerups } from "../src/game-core/bubbo/engine.js";
import { renderArcadePresentation, findElements } from "./helpers/arcadePresentationHarness.js";

describe("Telegram Mini App game UX foundations", () => {
  it("keeps Farm and deferred Settlement registered but hidden from navigation", () => {
    assert.equal(GAME_REGISTRY.farm.visible, false);
    assert.equal(GAME_REGISTRY.farm.pixiScene, true);
    assert.ok(!VISIBLE_GAME_IDS.includes("farm"));
    assert.ok(PIXI_GAME_IDS.includes("farm"));
    assert.equal(GAME_REGISTRY.settlement.visible, false);
    assert.deepEqual(VISIBLE_GAME_IDS, ["garden", "blox", "match3", "merge", "bubbo", "trivia", "room"]);
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
      assert.equal(normalizeActiveTab("settlement"), "garden");
      assert.equal(normalizeActiveTab("farm"), "garden");

      globalThis.window.location = new URL("https://example.test/");
      globalThis.window.sessionStorage = makeStorage({ game_hub_active_tab_v1: "match3" });
      assert.equal(readInitialActiveTab(), "match3");

      // Deferring a game must ignore stale links/session choices without
      // migrating or removing its local save.
      const savedTown = '{"version":11,"state":{"gold":123,"buildings":[{"id":"townhall"}]}}';
      globalThis.window.localStorage = makeStorage({ 'village-ascend-v11-state': savedTown });
      globalThis.window.sessionStorage = makeStorage({ game_hub_active_tab_v1: "settlement" });
      globalThis.window.location = new URL("https://example.test/?tab=settlement");
      assert.equal(readInitialActiveTab(), "garden");
      globalThis.window.location = new URL("https://example.test/");
      assert.equal(readInitialActiveTab(), "garden");
      assert.equal(globalThis.window.sessionStorage.getItem("game_hub_active_tab_v1"), "settlement");
      assert.equal(globalThis.window.localStorage.getItem("village-ascend-v11-state"), savedTown);
      globalThis.window.sessionStorage = makeStorage({ game_hub_active_tab_v1: "room" });
      globalThis.window.location = new URL("https://example.test/?tab=settlement");
      assert.equal(readInitialActiveTab(), "room", "an invalid link preserves an available prior tab");
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

  it("wires Bubbo v2 power-up charges through controller, presentation and sync", () => {
    const bubboGame = readFileSync(new URL("../src/games/bubbo/BubboGame.jsx", import.meta.url), "utf8");
    assert.deepEqual(normalizeBubboPowerups(), { bomb: 3, rainbow: 2, lightning: 2 });
    assert.match(bubboGame, /resolveBubboPowerup/);
    assert.match(bubboGame, /const\s*\[powerups,\s*setPowerups\]/);
    assert.match(bubboGame, /const\s*\[activePowerup,\s*setActivePowerup\]/);
    const consumption = bubboGame.match(/const\s+(\w+)\s*=\s*(\w+)\s*\?\s*normalizeBubboPowerups\(\{\s*\.\.\.powerups,\s*\[\2\]:\s*Math\.max\(0,\s*\(Number\(powerups\[\2\]\)\s*\|\|\s*0\)\s*-\s*1\)/);
    assert.ok(consumption, "a successful powered shot must consume one normalized charge");
    assert.ok(bubboGame.includes(`setPowerups(${consumption[1]})`), "consumed charges must reach local state");
    const shotSync = bubboGame.slice(bubboGame.lastIndexOf('performAction("bubbo.sync"'));
    assert.match(shotSync, new RegExp(`powerups:\\s*${consumption[1]}\\b`), "shot sync must persist the consumed charge map");
    assert.match(bubboGame, new RegExp(`powerup:\\s*${consumption[2]}\\s*\\|\\|\\s*null`), "shot animation retains the fired power-up");

    const { tree, calls } = renderArcadePresentation("bubbo");
    const powers = findElements(tree, (node) => node.props["data-bubbo-powerup"]);
    assert.deepEqual(powers.map((node) => node.props["data-bubbo-powerup"]), ["bomb", "rainbow", "lightning"]);
    assert.equal(powers[0].props["aria-pressed"], true);
    assert.equal(powers[2].props.disabled, true, "empty power-ups cannot be selected");
    powers[0].props.onClick();
    assert.deepEqual(calls.at(-1), { name: "Power", args: ["bomb"] });
  });

  it("keeps Bubbo v2 backgrounds owned by the presentation in both orientations", () => {
    const presentation = readFileSync(new URL("../src/games/bubbo/BubboPresentation.jsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../src/games/bubbo/bubbo-presentation.css", import.meta.url), "utf8");
    assert.match(presentation, /id:\s*"bubboBackgroundAsset"/);
    assert.doesNotMatch(css, /(?:field-mask|background-tile|underwater-backdrop)\.png/, "CSS must not add a second bitmap backdrop");
    for (const [width, height, filename] of [[390, 844, "background-portrait"], [844, 390, "background"]]) {
      const { tree } = renderArcadePresentation("bubbo", {}, { width, height });
      const backgrounds = findElements(tree, (node) => node.props.className === "bb-background");
      assert.equal(backgrounds.length, 1);
      const images = findElements(backgrounds[0], (node) => node.type === "img");
      assert.equal(images.length, 1);
      assert.match(images[0].props.src, new RegExp(`/games/bubbo-v2/${filename}\\.webp(?:\\?|$)`));
    }
  });

  it("wires Building Blox v2 rotate charges through live controls and reliable server state", () => {
    const bloxGame = readFileSync(new URL("../src/games/blox/BloxGame.jsx", import.meta.url), "utf8");
    const playerRoutes = readFileSync(new URL("../routes/player.js", import.meta.url), "utf8");
    assert.match(playerRoutes, /rotateCharges:\s*DEFAULT_BLOX_ROTATE_CHARGES/);
    assert.match(playerRoutes, /case "blox\.rotate"/);
    assert.match(playerRoutes, /rotateBloxPiece\(trayItem\.piece\)/);
    assert.match(bloxGame, /rotateCharges:\s*Math\.max\(0,\s*\(Number\(state\.rotateCharges\)\s*\|\|\s*0\)\s*-\s*1\)/);
    assert.match(bloxGame, /performReliableAction\("blox\.rotate"/);
    assert.match(bloxGame, /\.error\s*&&\s*\(setOptimisticState\(null\)/, "server rejection must roll back optimistic state");
    assert.match(bloxGame, /savedState\.rotateCharges/, "authoritative rotate updates clear the optimistic state");
    const { tree, calls, props } = renderArcadePresentation("blox");
    const rotate = findElements(tree, (node) => node.props["data-blox-rotate"]);
    assert.equal(rotate.length, 1);
    assert.equal(rotate[0].props["data-count"], 2);
    assert.equal(rotate[0].props.disabled, false);
    rotate[0].props.onClick();
    assert.deepEqual(calls.at(-1), { name: "Rotate", args: [] });
    for (const overrides of [{ paused: true }, { state: { ...props.state, rotateCharges: 0 } }]) {
      const blocked = renderArcadePresentation("blox", overrides);
      assert.equal(findElements(blocked.tree, (node) => node.props["data-blox-rotate"])[0].props.disabled, true);
    }
  });

  it("keeps playfield backgrounds with a single renderer owner", () => {
    const bloxScene = readFileSync(new URL("../src/game-runtime/scenes/bloxScene.js", import.meta.url), "utf8");
    const { tree } = renderArcadePresentation("blox");
    const backgrounds = findElements(tree, (node) => node.props.className === "bx-background");
    assert.equal(backgrounds.length, 1, "Blox v2 owns its background in the DOM presentation");
    assert.match(findElements(backgrounds[0], (node) => node.type === "img")[0].props.src, /\/games\/blox-v2\/background\.webp(?:\?|$)/);
    assert.doesNotMatch(bloxScene, /BLOX_ASSET_KEYS\.background|bloxArtUrl\("background"\)/, "Blox Pixi must not draw the presentation background twice");
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

  it("wires Match-3 v2 boosters through live presentation, charge consumption and sync", () => {
    const match3Game = readFileSync(new URL("../src/games/match3/Match3Game.jsx", import.meta.url), "utf8");
    const match3Layout = readFileSync(new URL("../src/app/hud-layout/defaultLayouts/match3.json", import.meta.url), "utf8");
    const hudRegistry = readFileSync(new URL("../src/app/hud-layout/registry.js", import.meta.url), "utf8");

    assert.match(match3Game, /normalizeMatch3Boosters\(\)/);
    assert.match(match3Game, /applyMatch3Booster/);
    assert.match(match3Game, /const \[boosters,\s*setBoosters\]/);
    assert.match(match3Game, /const \[activeBooster,\s*setActiveBooster\]/);
    assert.match(match3Layout, /"match3ActionDock"/);
    assert.match(hudRegistry, /match3ActionDock/);
    assert.match(match3Game, /boosters:\s*nextBoosters/);
    assert.match(match3Game, /booster:\s*activeBooster/);
    assert.match(match3Game, /\[activeBooster\]:\s*Math\.max\(0,\s*\(Number\(boosters\[activeBooster\]\)\s*\|\|\s*0\)\s*-\s*1\)/);
    const { tree, calls } = renderArcadePresentation("match3");
    assert.equal(findElements(tree, (node) => node.props.id === "match3ActionDock").length, 1);
    const powers = findElements(tree, (node) => node.props["data-match3-booster"]);
    assert.deepEqual(powers.map((node) => node.props["data-match3-booster"]), ["bomb", "lightning", "rainbow", "hammer"]);
    assert.equal(powers[0].props["data-count"], 2);
    assert.equal(powers[0].props["aria-pressed"], true);
    assert.equal(powers[1].props.disabled, true);
    powers[0].props.onClick();
    assert.deepEqual(calls.at(-1), { name: "Booster", args: ["bomb"] });
    const shuffle = findElements(tree, (node) => node.props["data-match3-shuffle"]);
    assert.equal(shuffle.length, 1);
    shuffle[0].props.onClick();
    assert.deepEqual(calls.at(-1), { name: "Shuffle", args: [] });
    const locked = renderArcadePresentation("match3", { inputLocked: true, shuffleCharges: 0 });
    assert.ok(findElements(locked.tree, (node) => node.props["data-match3-booster"] || node.props["data-match3-shuffle"]).every((node) => node.props.disabled));
  });

  it("keeps Settlement startup map-first with a compact village cycle and building access", () => {
    const settlementGame = readSplitGameSource(new URL("../src/games/settlement/SettlementGame.jsx", import.meta.url));
    const settlementStore = readFileSync(new URL("../src/games/settlement/useSettlementStore.js", import.meta.url), "utf8");
    const settlementCss = readFileSync(new URL("../src/games/settlement/settlement.css", import.meta.url), "utf8");
    const settlementPanel = readFileSync(new URL("../src/games/settlement/SettlementPlayPanel.jsx", import.meta.url), "utf8");

    assert.match(settlementStore, /rightPanelOpen:\s*false/);
    assert.match(settlementGame, /<SettlementPlayPanel/);
    assert.match(settlementPanel, /if\s*\(state\.rightPanelOpen\)\s*return null;/);
    assert.match(settlementPanel, /selectBuilding\(state\.selectedBuildingId\)/);
    assert.match(settlementGame, /safeH\s*>\s*safeW/);
    assert.match(settlementGame, /safeH\s*\/\s*WORLD\.h/);
    assert.match(settlementCss, /\.settlement-compact-detail/);
    assert.match(settlementCss, /\.settlement-compact-detail-open/);
  });

  it("derives server clock and question timing from real elapsed time", () => {
    assert.equal(deriveServerNow({ serverTime: 1000, receivedAt: 900 }, 1400), 1500);
    let now = 10_000; const clock = new TriviaClock(() => now); clock.reset({ timeLimit: 15 }); now = 12_450; const timing = clock.sample();
    assert.equal(timing.timeMs, 2450);
    assert.equal(timing.remainingMs, 12_550);
    assert.ok(timing.progress < 1 && timing.progress > 0.8);
  });

  it("freezes Brain Blitz question timing across pauses", () => {
    let now = 10_000; const clock = new TriviaClock(() => now); clock.reset({ timeLimit: 15 }); now = 14_000; clock.freeze(); now = 20_000; const timing = clock.sample();
    assert.equal(timing.timeMs, 4000);
    assert.equal(timing.remainingMs, 11_000);
    assert.ok(timing.progress < 0.75 && timing.progress > 0.7);
  });

  it("wires Brain Blitz pause state into its controller and answer locking", () => {
    const triviaGame = readFileSync(new URL("../src/games/trivia/TriviaGame.jsx", import.meta.url), "utf8");
    const controller = readFileSync(new URL("../src/games/trivia/triviaController.js", import.meta.url), "utf8");
    assert.match(triviaGame, /useSyncExternalStore\(controller\.subscribe, controller\.getSnapshot/);
    assert.match(triviaGame, /s\.paused \|\| !!s\.feedback \|\| !!s\.busy \|\| s\.uncertain/);
    assert.match(triviaGame, /disabled=\{disabled \|\| hidden\}/);
    assert.match(controller, /pause\(\) \{[^\n]*this\.clock\.freeze\(\)/);
    assert.match(controller, /answer\(answer\) \{[^\n]*s\.paused \|\| s\.feedback \|\| s\.uncertain/);
  });

  it("wires Brain Blitz audience lifeline through server response and answer HUD", () => {
    const triviaGame = readFileSync(new URL("../src/games/trivia/TriviaGame.jsx", import.meta.url), "utf8");
    const controller = readFileSync(new URL("../src/games/trivia/triviaController.js", import.meta.url), "utf8");
    const triviaRoutes = readFileSync(new URL("../routes/trivia.js", import.meta.url), "utf8");
    const triviaCss = readFileSync(new URL("../src/games/trivia/trivia-presentation.css", import.meta.url), "utf8");
    assert.match(triviaRoutes, /type !== "fifty" && type !== "reveal" && type !== "audience"/);
    assert.match(triviaRoutes, /audiencePoll:\s*selectTriviaAudiencePoll\(q\)/);
    assert.match(controller, /audiencePoll: data\.audiencePoll \|\| s\.audiencePoll/);
    assert.match(triviaGame, /\['audience', 'fifty', 'reveal'\]\.map/);
    assert.match(triviaGame, /controller\.lifeline\(type\)/);
    assert.match(triviaGame, /className="trv2-poll"/);
    assert.match(triviaCss, /\.trv2-lifelines\s*\{[^}]*grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\)/);
  });

  it("keeps Brain Blitz portrait rows and independent landscape panels with width-adaptive answer columns", () => {
    const triviaCss = readFileSync(new URL("../src/games/trivia/trivia-presentation.css", import.meta.url), "utf8");
    const triviaGame = readFileSync(new URL("../src/games/trivia/TriviaGame.jsx", import.meta.url), "utf8");
    assert.match(triviaCss, /\.trv2-answers\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)/);
    // The landscape question/answer panels remain independent. Only the answer
    // panel's internal columns collapse when two readable choices cannot fit.
    assert.match(triviaCss, /\[data-trivia-layout='landscape'\] \.trv2-quiz\s*\{[^}]*grid-template-columns:\s*minmax\(0,\.95fr\) minmax\(0,1\.05fr\)/);
    assert.match(triviaCss, /\[data-trivia-layout='landscape'\] \.trv2-answers\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,minmax\(min\(100%,13rem\),1fr\)\)/);
    assert.match(triviaCss, /\.trv2-answer\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*44px;[^}]*min-height:\s*58px/);
    assert.match(triviaCss, /\[data-trivia-layout='landscape'\] \.trv2-answer\s*\{[^}]*min-height:\s*80px/);
    assert.match(triviaGame, /className="trv2-answer-letter"/);
    assert.match(triviaGame, /'ABCD'\[index\]/);
  });

  it("routes confirmed V3 snapshots through the shared shell and authenticated exact-command transport", () => {
    const wrapper = readFileSync(new URL("../src/games/merge/MergeGame.jsx", import.meta.url), "utf8");
    const view = readFileSync(new URL("../src/games/merge/MergeLabGame.jsx", import.meta.url), "utf8");
    const transport = readFileSync(new URL("../src/games/merge/mergeLabTransport.js", import.meta.url), "utf8");
    assert.match(wrapper, /schemaVersion===3/);
    assert.match(wrapper, /createElement\(MergeLabGame/);
    assert.match(wrapper, /createElement\(LegacyMergeGame/);
    assert.match(wrapper, /snapshot\.player\.id\+':'\+snapshot\.merge\.serverEpoch/);
    assert.match(view, /h\(GameShell,\{gameId:'merge'/);
    assert.match(view, /createMergeLabTransport\(\{api,accountId/);
    assert.match(view, /transport\.resumePending\(\)/);
    assert.match(transport, /api\('\/api\/player\/mutate',\{accountId,action:'merge\.lab',payload:record\.payload\},\{isCurrent\}\)/);
    assert.match(transport, /storage\.setItem\(key,JSON\.stringify\(record\)\)/);
    assert.doesNotMatch(transport, /_optimistic|success:\s*true|apiBatched/);
  });

  it("keeps Merge free-tap claiming in the reference action dock language", () => {
    const mergeGame = readFileSync(new URL("../src/games/merge/LegacyMergeGame.jsx", import.meta.url), "utf8");
    const mergeCss = readFileSync(new URL("../src/games/merge/merge.css", import.meta.url), "utf8");
    const mergeI18n = readFileSync(new URL("../src/games/merge/i18n.js", import.meta.url), "utf8");

    assert.match(mergeGame, /canClaimFreeTaps\s*\?\s*t\("merge\.dailyTaps"/);
    assert.doesNotMatch(mergeGame, /canClaimFreeTaps \|\| canFreePull\s*\?\s*t\("merge\.claimDailyTokens"\)/);
    assert.match(mergeCss, /\.merge-daily-token-button\s*\{[\s\S]*\/games\/hud-redesign\/merge\/primary-button\.png/);
    assert.match(mergeI18n, /"merge\.dailyTaps":\s*"Free Taps \+\{count\}"/);
  });

  it("starts Brain Blitz duels only from the current active room without duplicate polling starts", () => {
    const controller = readFileSync(new URL("../src/games/trivia/triviaController.js", import.meta.url), "utf8");
    assert.match(controller, /if \(this\.lock \|\| this\.disposed\) return false/);
    assert.match(controller, /serial !== this\.pollSerial \|\| this\.state\.roomId !== id/);
    assert.match(controller, /data\.status === 'active' && this\.state\.view === 'duel-room' && !this\.lock/);
    assert.match(controller, /s\.view !== 'duel-room' \|\| s\.duel\?\.status !== 'active'/);
    assert.match(controller, /'\/api\/trivia\/duel\/start', \{ roomId: s\.roomId \}/);
  });

  it("wires shared overlay dismissal and mature Garden care watering through DOM text", () => {
    const dismissHook = readFileSync(new URL("../src/app/useDismissableLayer.js", import.meta.url), "utf8");
    const shell = readFileSync(new URL("../src/app/shell.jsx", import.meta.url), "utf8");
    const presentation = readSplitGameSource(new URL("../src/games/garden-shelf/GardenPresentation.tsx", import.meta.url));
    const gardenContext = readFileSync(new URL("../src/games/garden-shelf/lib/GameContext.tsx", import.meta.url), "utf8");

    assert.match(dismissHook, /event\.key !== ['"]Escape['"]/);
    assert.match(dismissHook, /document\.addEventListener\("pointerdown"/);
    assert.match(shell, /useEscapeDismiss\(canDismissOverlay, onDismiss\)/);
    assert.match(presentation, /useEscapeDismiss\(true, onClose\)/, "Every mounted Garden dialog must support Escape dismissal");
    assert.match(presentation, /className="gs2-scrim"[^>]*onClick=\{onClose\}/, "The visible scrim must dismiss its dialog");
    assert.match(presentation, /className="gs2-close" onClick=\{onClose\} aria-label=\{t\('ui.close'\)\}/);
    assert.match(gardenContext, /getGardenWaterCooldownMs\(plant\.phase\)/);
    assert.match(gardenContext, /getMatureWaterReward\(def\.baseClick, def\.baseXp, plant\.level\)/);
    assert.match(presentation, /canWater = !p.lastWatered \|\| \(r2 \? r2.serverNow : Date.now\(\)\) - p.lastWatered >= getGardenWaterCooldownMs\(p.phase\)/, "Care uses authoritative R2 time and retains the legacy cooldown");
    assert.match(presentation, /disabled=\{busy \|\| !canWater \|\| \(!!r2 && !accountingReady\)\} onClick=\{\(\) => run\(\(\) => waterPlant\(p.id\)\)\}/, "Care watering keeps its cooldown, R2 readiness fence and action handler");
    assert.match(presentation, /t\(mature \? 'plantDetail\.careWater' : 'plantDetail\.water'\)/, "Mature Care labels remain real localized DOM text");
  });

  it("keeps Garden Shelf live screen-first with compact hub chrome", () => {
    const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
    const indexCss = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
    const gardenGame = readSplitGameSource(new URL("../src/games/garden-shelf/GardenShelfGame.tsx", import.meta.url));
    const presentation = readSplitGameSource(new URL("../src/games/garden-shelf/GardenPresentation.tsx", import.meta.url));
    const gardenCss = readFileSync(new URL("../src/games/garden-shelf/garden-presentation.css", import.meta.url), "utf8");

    assert.match(app, /className="topbar-title"/);
    assert.match(indexCss, /\.telegram-app\[data-active-tab="garden"\]\s+\.topbar\s*\{[\s\S]*position:\s*absolute/);
    assert.match(indexCss, /\.telegram-app\[data-active-tab="garden"\]\s+\.topbar-title\s*\{[\s\S]*display:\s*none/);
    assert.match(indexCss, /\.telegram-app\[data-active-tab="garden"\]\s+\.status-dot\s*\{[\s\S]*font-size:\s*0/);
    assert.match(gardenGame, /<GardenPresentation\b/, "The account-bound game provider renders the live presentation");
    assert.match(presentation, /<HudRegion id="gardenRoot"[^>]*className="gs2-stage"/);
    assert.match(presentation, /<HudRegion id="gardenShelf"[^>]*className="gs2-shelf-viewport"/);
    assert.match(presentation, /useLayoutEffect\(\(\) => applyGardenHostLayout\(/, "The live screen installs the registered host reserve adapter");
    assert.match(gardenCss, /\.gs2-stage\s*\{[^}]*grid-template-rows:minmax\(0,1fr\) auto/, "Feedback owns a row outside the shelf playfield");
    assert.match(gardenCss, /\.telegram-app\[data-active-tab="garden"\]\[data-garden-presentation="living"\]\s*\{[^}]*var\(--safe-bottom,0px\) \+ var\(--garden-host-padding\)/, "The host applies safe area plus ordinary content padding");
    assert.doesNotMatch(gardenCss, /\.bottom-tabs/, "The removed global dock does not reserve Garden space");
    assert.match(presentation, /className="gs2-button gs2-home"[^>]*onClick=\{openHome\}/, "The header opens real Home navigation");
    assert.doesNotMatch(presentation, /Glass Dome Container/);
  });

  it("keeps Garden and Yard empty starts thematic instead of placeholder-empty", () => {
    const gardenCss = readFileSync(new URL("../src/games/garden-shelf/garden-presentation.css", import.meta.url), "utf8");
    const yardGame = readFileSync(new URL("../src/games/companion-yard-v2/CourtyardGame.jsx", import.meta.url), "utf8");
    const yardCss = readFileSync(new URL("../src/games/companion-yard-v2/courtyard.css", import.meta.url), "utf8");

    assert.match(yardGame, /!decorRows\.length && !savedDecorRows\.length && <Empty src=\{YARD_UI_ART\.decor\}/);
    assert.match(yardGame, /yard\.persistent\.emptyPlaced/);
    assert.match(yardGame, /yard\.persistent\.emptyInventory/);
    assert.match(yardGame, /<Empty src=\{YARD_UI_ART\.guests\}>\{t\('yard\.persistent\.noVisits'\)\}/);
    assert.match(yardCss, /\.cy-empty\{[^}]*min-height:118px/);
  });

  it("keeps split Pixi scenes off private runtime module state", () => {
    const mergeScene = readFileSync(new URL("../src/game-runtime/scenes/mergeScene.js", import.meta.url), "utf8");

    assert.ok(!mergeScene.includes("graphicsManifest?."));
    assert.match(mergeScene, /graphicsGameAsset/);
  });
});
