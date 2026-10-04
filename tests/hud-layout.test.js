import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatYardCurrencyBalance } from "../src/games/companion-yard/currencyDisplay.js";
import { VISIBLE_GAME_IDS } from "../src/app/gameRegistry.js";
import {
  EXACT_PREVIEW_PRESETS,
  createHudViewportSnapshot,
  detectHudOrientation,
  isHudEditorEnabled,
  parseCssPixelValue,
  readSafeAreaInsetsFromStyle,
  selectHudViewportProfile,
  semanticProfileForPreviewPreset,
} from "../src/app/hud-layout/profiles.js";
import {
  createHudLayoutExport,
  getHudLayoutCssVars,
  getHudRegionRuntimeStyle,
  getPixiSafeAreaFromHudLayout,
  mergeHudLayout,
  resolveHudLayout,
  validateHudLayout,
  validateHudLayoutExport,
} from "../src/app/hud-layout/resolver.js";
import {
  getHudRegionDefinition,
  hudLayoutRegistry,
} from "../src/app/hud-layout/registry.js";
import { HUD_LAYOUT_DEFAULTS } from "../src/app/hud-layout/defaultLayouts/index.js";
import {
  applyRegionPatch,
  getHudRegionBoxZIndex,
  resetGameOverrides,
  resetProfileOverrides,
  resetRegionOverride,
  shouldRenderHudEditor,
} from "../src/app/hud-editor/editorState.js";

describe("HUD layout viewport profiles", () => {
  it("detects orientation from dimensions instead of screen.orientation", () => {
    assert.equal(detectHudOrientation({ width: 568, height: 320 }), "landscape");
    assert.equal(detectHudOrientation({ width: 320, height: 568 }), "portrait");
  });

  it("selects semantic profiles by orientation before width-only matching", () => {
    assert.equal(selectHudViewportProfile({ width: 320, height: 568 }).id, "phone-small-portrait");
    assert.equal(selectHudViewportProfile({ width: 568, height: 320 }).id, "phone-landscape");
    assert.equal(selectHudViewportProfile({ width: 768, height: 1024 }).id, "tablet-portrait");
    assert.equal(selectHudViewportProfile({ width: 1280, height: 720 }).id, "desktop-landscape");
  });

  it("maps exact editor presets to semantic runtime profiles", () => {
    assert.equal(EXACT_PREVIEW_PRESETS.some((preset) => preset.id === "320x568"), true);
    assert.equal(EXACT_PREVIEW_PRESETS.some((preset) => preset.id === "360x800"), true);
    assert.equal(EXACT_PREVIEW_PRESETS.some((preset) => preset.id === "412x915"), true);
    assert.equal(semanticProfileForPreviewPreset("320x568"), "phone-small-portrait");
    assert.equal(semanticProfileForPreviewPreset("360x800"), "phone-small-portrait");
    assert.equal(semanticProfileForPreviewPreset("412x915"), "phone-tall-portrait");
    assert.equal(semanticProfileForPreviewPreset("568x320"), "phone-landscape");
    assert.equal(semanticProfileForPreviewPreset("844x390"), "phone-landscape");
    assert.equal(semanticProfileForPreviewPreset("1024x768"), "tablet-landscape");
  });

  it("builds deterministic viewport snapshots with visual viewport and safe-area fallbacks", () => {
    const snapshot = createHudViewportSnapshot({
      layoutWidth: 390,
      layoutHeight: 844,
      visualViewport: { width: 390, height: 812, offsetTop: 12, offsetLeft: 0 },
      devicePixelRatio: 2,
      safeAreaInsets: { top: 10, bottom: 18, left: 0, right: 0 },
    });
    assert.equal(snapshot.orientation, "portrait");
    assert.equal(snapshot.visualViewport.height, 812);
    assert.equal(snapshot.devicePixelRatio, 2);
    assert.equal(snapshot.keyboardLikelyVisible, true);
    assert.equal(snapshot.activeProfileId, "phone-default-portrait");
  });

  it("parses CSS safe-area fallback values without relying on CSS env reads", () => {
    assert.equal(parseCssPixelValue("12px"), 12);
    assert.equal(parseCssPixelValue("0"), 0);
    assert.equal(parseCssPixelValue("calc(1px + 2px)"), 0);
    assert.deepEqual(readSafeAreaInsetsFromStyle({
      getPropertyValue(name) {
        return {
          "--safe-top": "11px",
          "--safe-bottom": "19px",
          "--safe-left": "2px",
          "--safe-right": "3px",
        }[name] || "";
      },
    }), { top: 11, bottom: 19, left: 2, right: 3 });
  });
});

describe("HUD layout resolver and validation", () => {
  const sampleLayout = {
    schemaVersion: 1,
    layoutVersion: "test",
    gameId: "blox",
    base: {
      regions: {
        gameplayHud: { mode: "anchored", anchor: "top-center", x: 0, y: 12, maxWidth: 380, zIndex: 40, visible: true },
        pixiPlayfieldReserve: { mode: "reserveOnly", topReserve: 88, bottomReserve: 120, leftReserve: 0, rightReserve: 0 },
      },
    },
    profiles: {
      "phone-landscape": {
        match: { orientation: "landscape", maxHeight: 480 },
        regions: {
          gameplayHud: { anchor: "top-right", x: -16, y: 8 },
          pixiPlayfieldReserve: { topReserve: 44, bottomReserve: 66 },
        },
      },
    },
  };

  it("merges base, profile, local, and transient layers in deterministic order", () => {
    const merged = resolveHudLayout({
      repoLayout: sampleLayout,
      viewport: { width: 568, height: 320, orientation: "landscape", aspectRatio: 1.775 },
      localOverrides: {
        profiles: {
          "phone-landscape": {
            regions: { gameplayHud: { x: -24, maxWidth: 300 } },
          },
        },
      },
      transientOverrides: {
        regions: { gameplayHud: { y: 18 } },
      },
      allowLocalOverrides: true,
    });
    assert.equal(merged.activeProfileId, "phone-landscape");
    assert.equal(merged.regions.gameplayHud.anchor, "top-right");
    assert.equal(merged.regions.gameplayHud.x, -24);
    assert.equal(merged.regions.gameplayHud.y, 18);
    assert.equal(merged.regions.gameplayHud.maxWidth, 300);
  });

  it("ignores local overrides when editor/dev override mode is off", () => {
    const merged = resolveHudLayout({
      repoLayout: sampleLayout,
      viewport: { width: 568, height: 320, orientation: "landscape", aspectRatio: 1.775 },
      localOverrides: {
        profiles: {
          "phone-landscape": {
            regions: { gameplayHud: { x: -99 } },
          },
        },
      },
      allowLocalOverrides: false,
    });
    assert.equal(merged.regions.gameplayHud.x, -16);
  });

  it("extracts orientation-aware Pixi reserve values from resolved layout", () => {
    const portrait = resolveHudLayout({
      repoLayout: sampleLayout,
      viewport: { width: 390, height: 844, orientation: "portrait", aspectRatio: 0.462 },
    });
    const landscape = resolveHudLayout({
      repoLayout: sampleLayout,
      viewport: { width: 568, height: 320, orientation: "landscape", aspectRatio: 1.775 },
    });
    assert.deepEqual(getPixiSafeAreaFromHudLayout(portrait), { top: 88, bottom: 120, left: 0, right: 0 });
    assert.deepEqual(getPixiSafeAreaFromHudLayout(landscape), { top: 44, bottom: 66, left: 0, right: 0 });
  });

  it("creates CSS custom properties for layout-aware DOM regions", () => {
    const vars = getHudLayoutCssVars({
      mode: "anchored",
      x: 12,
      y: -8,
      maxWidth: 320,
      zIndex: 40,
      scale: 1.25,
      opacity: 0.8,
      rotation: 12,
    });
    assert.equal(vars["--hud-region-x"], "12px");
    assert.equal(vars["--hud-region-y"], "-8px");
    assert.equal(vars["--hud-region-max-width"], "320px");
    assert.equal(vars["--hud-region-z"], 40);
    assert.equal(vars["--hud-region-scale"], 1.25);
    assert.equal(vars["--hud-region-opacity"], 0.8);
    assert.equal(vars["--hud-region-rotation"], "12deg");
    const dock = getHudRegionRuntimeStyle({ mode: "dock", offset: 16, thickness: 72 });
    assert.equal(dock["--hud-dock-offset"], "16px");
    assert.equal(dock["--hud-dock-thickness"], "72px");
  });

  it("rejects unknown repo default region ids but only warns for imported unknown region ids", () => {
    const invalidRepo = structuredClone(sampleLayout);
    invalidRepo.base.regions.unknownRegion = { mode: "anchored" };
    const repoResult = validateHudLayout(invalidRepo, {
      knownRegionIds: ["gameplayHud", "pixiPlayfieldReserve"],
      source: "repo",
    });
    assert.equal(repoResult.valid, false);
    assert.match(repoResult.errors.join("\n"), /unknownRegion/);

    const exportResult = validateHudLayoutExport({
      schemaVersion: 1,
      exportedAt: new Date(0).toISOString(),
      games: {
        blox: invalidRepo,
      },
    }, {
      knownRegionIds: ["gameplayHud", "pixiPlayfieldReserve"],
      knownGameIds: ["blox"],
      source: "import",
    });
    assert.equal(exportResult.valid, true);
    assert.match(exportResult.warnings.join("\n"), /unknownRegion/);
  });

  it("round-trips exported layout JSON", () => {
    const exported = createHudLayoutExport({ gameId: "blox", layout: sampleLayout, appVersion: "test" });
    const validation = validateHudLayoutExport(exported, {
      knownRegionIds: ["gameplayHud", "pixiPlayfieldReserve"],
      knownGameIds: ["blox"],
    });
    assert.equal(validation.valid, true);
    assert.deepEqual(exported.games.blox.base.regions.gameplayHud, sampleLayout.base.regions.gameplayHud);
  });

  it("keeps mergeHudLayout immutable while inheriting missing fields", () => {
    const base = { regions: { eventLog: { mode: "anchored", x: 0, y: -96, maxWidth: 360 } } };
    const patch = { regions: { eventLog: { y: -120 } } };
    const merged = mergeHudLayout(base, patch);
    assert.deepEqual(base.regions.eventLog, { mode: "anchored", x: 0, y: -96, maxWidth: 360 });
    assert.deepEqual(merged.regions.eventLog, { mode: "anchored", x: 0, y: -120, maxWidth: 360 });
  });
});

describe("HUD layout defaults and editor state", () => {
  it("covers every visible game with base regions and orientation-aware profiles", () => {
    for (const gameId of VISIBLE_GAME_IDS) {
      const layout = HUD_LAYOUT_DEFAULTS[gameId];
      assert.ok(layout, `${gameId} has a default layout`);
      assert.ok(layout.base?.regions && Object.keys(layout.base.regions).length > 0, `${gameId} has base regions`);
      assert.ok(layout.profiles?.["phone-default-portrait"], `${gameId} has portrait fallback`);
      assert.ok(layout.profiles?.["phone-landscape"], `${gameId} has landscape fallback`);
      assert.equal(validateHudLayout(layout, {
        knownRegionIds: hudLayoutRegistry.allRegionIds,
        knownGameIds: VISIBLE_GAME_IDS,
        source: "repo",
      }).valid, true, `${gameId} validates`);
    }
  });

  it("registers high-value regions and at least one meaningful editable region per visible game", () => {
    for (const gameId of VISIBLE_GAME_IDS) {
      const regions = hudLayoutRegistry.games[gameId]?.regions || {};
      assert.ok(Object.keys(regions).length > 0, `${gameId} has registered regions`);
      assert.ok(Object.values(regions).some((region) => region.capabilities?.draggable || region.capabilities?.resizable || region.capabilities?.affectsPixiSafeArea), `${gameId} has an editable or reserve-affecting region`);
    }
    assert.equal(getHudRegionDefinition("blox", "pixiPlayfieldReserve").capabilities.affectsPixiSafeArea, true);
    assert.equal(getHudRegionDefinition("settlement", "settlementCanvas").capabilities.mode, "custom");
    assert.equal(getHudRegionDefinition("garden", "bottomDock.blox"), null);
    assert.equal(getHudRegionDefinition("garden", "gardenSignAsset").capabilities.asset, true);
  });

  it("removes obsolete global dock regions while retaining editable assets", () => {
    for (const gameId of VISIBLE_GAME_IDS) {
      const regions = HUD_LAYOUT_DEFAULTS[gameId].base.regions;
      assert.equal(regions["bottomDock.garden"], undefined);
      assert.equal(regions["bottomDock.blox"], undefined);
    }
    assert.equal(HUD_LAYOUT_DEFAULTS.garden.base.regions.gardenSignAsset.mode, "freeform");
    assert.equal(HUD_LAYOUT_DEFAULTS.garden.base.regions.gardenSignAsset.scale, 1);
  });

  it("gives every visible game at least one asset-capable editable region with defaults", () => {
    for (const gameId of VISIBLE_GAME_IDS) {
      const assetRegionIds = Object.values(hudLayoutRegistry.games[gameId]?.regions || {})
        .filter((region) => region.capabilities?.asset)
        .map((region) => region.id);
      assert.ok(assetRegionIds.length > 0, `${gameId} has an asset editable region`);
      for (const regionId of assetRegionIds) {
        const layout = HUD_LAYOUT_DEFAULTS[gameId].base.regions[regionId];
        assert.ok(layout, `${gameId}.${regionId} has base defaults`);
        if (gameId === "garden" && regionId === "gardenShelfAsset") {
          const definition = getHudRegionDefinition(gameId, regionId);
          assert.equal(layout.mode, "custom", "repeated shelf art follows its flow row");
          assert.equal(definition.capabilities.draggable, false);
          assert.equal(definition.capabilities.resizable, false);
          assert.match(definition.notes, /Repeated fixed-aspect/);
          continue;
        }
        assert.equal(layout.mode, "freeform", `${gameId}.${regionId} is freeform-editable`);
        assert.equal(layout.scale, 1, `${gameId}.${regionId} has a neutral scale default`);
        assert.equal(layout.opacity, 1, `${gameId}.${regionId} has a neutral opacity default`);
      }
    }
  });

  it("updates and resets selected region, profile, and game overrides", () => {
    const initial = {};
    const patched = applyRegionPatch(initial, "blox", "phone-landscape", "gameplayHud", { x: 16, y: 8 });
    assert.equal(patched.blox.profiles["phone-landscape"].regions.gameplayHud.x, 16);
    const noRegion = resetRegionOverride(patched, "blox", "phone-landscape", "gameplayHud");
    assert.equal(noRegion.blox.profiles["phone-landscape"].regions.gameplayHud, undefined);
    const profilePatched = applyRegionPatch(patched, "blox", "phone-default-portrait", "eventLog", { y: -120 });
    const noProfile = resetProfileOverrides(profilePatched, "blox", "phone-default-portrait");
    assert.equal(noProfile.blox.profiles["phone-default-portrait"], undefined);
    const noGame = resetGameOverrides(profilePatched, "blox");
    assert.equal(noGame.blox, undefined);
  });

  it("gates editor chrome and localStorage enablement explicitly", () => {
    assert.equal(isHudEditorEnabled({ search: "", localStorageValue: null, dev: false }), false);
    assert.equal(isHudEditorEnabled({ search: "?hudEditor=1", localStorageValue: null, dev: false }), true);
    assert.equal(isHudEditorEnabled({ search: "", localStorageValue: "true", dev: false }), true);
    assert.equal(shouldRenderHudEditor({ enabled: false }), false);
    assert.equal(shouldRenderHudEditor({ enabled: true }), true);
  });
});


describe("HUD editor map-placement selection", () => {
  it("keeps a construction handle above overlapping artwork independently of registration order", () => {
    const slot = getHudRegionDefinition("settlement", "settlementConstructionSlot.southwest-terrace");
    const art = getHudRegionDefinition("settlement", "settlementPrimaryBuildAsset");
    assert.equal(slot.capabilities.coordinateSpace, "settlementMap");
    // CI clicked (278.41,458.93), inside both recorded boxes. The old layer chose art.
    const records = [
      { id: slot.id, definition: slot, rect: { left: 237.281, top: 425.281, width: 82.2656, height: 67.3125 } },
      { id: art.id, definition: art, rect: { left: 252, top: 395.12, width: 44, height: 97.76 } },
    ];
    for (const order of [records, [...records].reverse()]) {
      const atClick = order.filter(({ rect }) => 278.41 >= rect.left && 278.41 <= rect.left + rect.width
        && 458.93 >= rect.top && 458.93 <= rect.top + rect.height);
      assert.equal(atClick.length, 2);
      const top = atClick.sort((a, b) => getHudRegionBoxZIndex(b.definition) - getHudRegionBoxZIndex(a.definition))[0];
      assert.equal(top.id, slot.id);
    }
    assert.ok(getHudRegionBoxZIndex(slot, true) > getHudRegionBoxZIndex(art, true));
    assert.equal(getHudRegionBoxZIndex(art), 2147483004);
    assert.equal(getHudRegionBoxZIndex(art, true), 2147483006);
    assert.equal(getHudRegionBoxZIndex({ capabilities: { mode: "custom" } }), 2147483001);
    assert.equal(getHudRegionBoxZIndex({ capabilities: { mode: "custom", control: true } }), 2147483004, "A header control must remain selectable over its background artwork");
  });
});


describe("legacy Yard small-phone currency budget", () => {
  it("keeps two phone header rows and bowl/flyout clearance in layout profiles", () => {
    for (const [width, height, maxWidth] of [[320, 568, 280], [360, 800, 280], [390, 844, 280], [414, 896, 280], [430, 932, 280], [431, 844, 280], [480, 844, 280], [568, 320, undefined], [768, 1024, undefined], [1024, 768, undefined]]) {
      const layout = resolveHudLayout({ repoLayout: HUD_LAYOUT_DEFAULTS.room, viewport: { width, height } });
      assert.equal(layout.regions.yardCurrencyStack.maxWidth, maxWidth, `${width}x${height}`);
      const style = getHudRegionRuntimeStyle(layout.regions.yardCurrencyStack);
      assert.equal(style.maxWidth, maxWidth === undefined ? undefined : "280px");
      const phonePortrait = maxWidth !== undefined;
      assert.equal(layout.regions.yardCornerActions.y, phonePortrait ? 54 : 0);
      assert.equal(layout.regions.yardSideTools.y, phonePortrait ? 56 : 0);
      assert.equal(layout.regions.yardSideTools.bottomReserve, phonePortrait || height <= 480 ? 88 : 92);
      assert.equal(getHudRegionRuntimeStyle(layout.regions.yardSideTools)["--hud-safe-bottom"], phonePortrait || height <= 480 ? "88px" : "92px");
      assert.equal(layout.regions.yardBowls.y, phonePortrait ? 40 : 0);
      assert.equal(layout.regions.yardActivityPill.maxWidth, phonePortrait ? 120 : undefined);
    }
  });

  it("preserves authorized editor offsets and sizing without enabling player overrides", () => {
    const input = {
      repoLayout: HUD_LAYOUT_DEFAULTS.room,
      viewport: { width: 320, height: 568 },
      localOverrides: { profiles: { "phone-small-portrait": { regions: { yardCurrencyStack: { x: 5, y: 7, maxWidth: 248 }, yardCornerActions: { x: -4, y: 60 } } } } },
    };
    const player = resolveHudLayout(input).regions.yardCurrencyStack;
    assert.deepEqual([player.x, player.y, player.maxWidth], [0, 0, 280]);
    const editor = resolveHudLayout({ ...input, allowLocalOverrides: true }).regions.yardCurrencyStack;
    assert.deepEqual([editor.x, editor.y, editor.maxWidth], [5, 7, 248]);
    const style = getHudRegionRuntimeStyle(editor);
    assert.equal(style["--hud-region-x"], "5px");
    assert.equal(style["--hud-region-y"], "7px");
    assert.equal(style.maxWidth, "248px");
    const playerControls = resolveHudLayout(input).regions.yardCornerActions;
    const editorControls = resolveHudLayout({ ...input, allowLocalOverrides: true }).regions.yardCornerActions;
    assert.deepEqual([playerControls.x, playerControls.y], [0, 54]);
    assert.deepEqual([editorControls.x, editorControls.y], [-4, 60]);
  });
});


describe("legacy Yard localized currency presentation", () => {
  for (const language of ["en", "ru"]) {
    it(`keeps exact ${language} balances accessible and visible units bounded through legal maxima`, () => {
      for (const amount of [0, 3, 999, 1000, 9999, 10000, 99949, 99999, 100000, 999000, 999499, 999500, 999999, 1000000, 999000000, 999499999, 999999999, 1000000000]) {
        const balance = formatYardCurrencyBalance(amount, language);
        assert.equal(balance.exact.replace(/[^0-9]/g, ""), String(amount));
        assert.ok(balance.compact.length <= 8, `${language} ${amount}: ${balance.compact}`);
        assert.doesNotMatch(balance.compact, /…|\.\.\.|e[+-]\d/);
        if (amount < 10000) assert.equal(balance.compact, String(amount));
      }
      assert.equal(formatYardCurrencyBalance(1000000000, language).compact, language === "ru" ? "1 млрд" : "1B");
      assert.equal(formatYardCurrencyBalance(1000000, language).compact, language === "ru" ? "1 млн" : "1M");
      assert.equal(formatYardCurrencyBalance(999000, language).compact, language === "ru" ? "999 тыс." : "999K");
    });
  }
});
