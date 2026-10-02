import {
  SETTLEMENT_CONSTRUCTION_PLACEMENT_SLOTS,
  settlementConstructionSlotRegionId,
} from "../../games/settlement/placementSlots.js";

const COMMON_REGIONS = {
  appTopbar: {
    id: "appTopbar",
    editorLabel: "Top app header",
    editorGroup: "Global shell",
    capabilities: { draggable: true, resizable: false, canChangeVisibility: true, affectsPixiSafeArea: false, measured: true, mode: "custom" },
    notes: "Global Hub header. Existing CSS owns composition; layout may only offset or hide it in editor mode.",
  },
  globalStats: {
    id: "globalStats",
    editorLabel: "Global stats chips",
    editorGroup: "Global shell",
    capabilities: { draggable: true, resizable: true, canChangeVisibility: true, affectsPixiSafeArea: false, measured: true, mode: "stack" },
  },
  activeGameFrame: {
    id: "activeGameFrame",
    editorLabel: "Active game frame",
    editorGroup: "Global shell",
    capabilities: { draggable: false, resizable: false, canChangeVisibility: false, affectsPixiSafeArea: false, measured: true, mode: "custom" },
  },
  bottomDock: {
    id: "bottomDock",
    editorLabel: "Bottom tab dock",
    editorGroup: "Global shell",
    capabilities: { draggable: true, resizable: true, canChangeVisibility: true, affectsPixiSafeArea: true, measured: true, mode: "dock" },
  },
  gameShell: {
    id: "gameShell",
    editorLabel: "Game shell",
    editorGroup: "Shared game shell",
    capabilities: { draggable: false, resizable: false, canChangeVisibility: false, affectsPixiSafeArea: false, measured: true, mode: "custom" },
  },
  gameplayHud: {
    id: "gameplayHud",
    editorLabel: "Gameplay HUD",
    editorGroup: "Shared game shell",
    capabilities: { draggable: true, resizable: true, canChangeVisibility: true, affectsPixiSafeArea: true, measured: true, mode: "anchored" },
  },
  eventLog: {
    id: "eventLog",
    editorLabel: "Action/event log",
    editorGroup: "Shared game shell",
    capabilities: { draggable: true, resizable: true, canChangeVisibility: true, affectsPixiSafeArea: true, measured: true, mode: "anchored" },
  },
  pauseOverlay: {
    id: "pauseOverlay",
    editorLabel: "Pause/menu/result overlay",
    editorGroup: "Shared game shell",
    capabilities: { draggable: true, resizable: true, canChangeVisibility: true, affectsPixiSafeArea: false, measured: true, mode: "anchored" },
  },
  pixiPlayfieldReserve: {
    id: "pixiPlayfieldReserve",
    editorLabel: "Pixi playfield safe/reserve area",
    editorGroup: "Pixi",
    capabilities: { draggable: false, resizable: true, canChangeVisibility: false, affectsPixiSafeArea: true, measured: false, mode: "reserveOnly" },
    notes: "Reserve-only adapter. It does not move DOM nodes; Pixi scenes consume these values through the runtime adapter.",
  },
};

function region(id, label, group, capabilities, notes = "") {
  return {
    id,
    editorLabel: label,
    editorGroup: group,
    capabilities: {
      draggable: false,
      resizable: false,
      canChangeVisibility: true,
      affectsPixiSafeArea: false,
      measured: true,
      mode: "custom",
      ...capabilities,
    },
    notes,
  };
}

function assetRegion(id, label, group, notes = "") {
  return region(id, label, group, {
    draggable: true,
    resizable: true,
    canChangeVisibility: true,
    measured: true,
    mode: "freeform",
    asset: true,
  }, notes || "Editable visual asset region. This adjusts presentation values, not gameplay state.");
}

function settlementConstructionSlotRegion(slot) {
  const id = settlementConstructionSlotRegionId(slot.id);
  return region(
    id,
    `Settlement placement: ${slot.label}`,
    "Settlement construction placement",
    {
      draggable: true,
      resizable: false,
      canChangeVisibility: true,
      measured: true,
      mode: "custom",
      placement: true,
      coordinateSpace: "settlementMap",
      axisLocks: { x: false, y: false },
      min: { x: 0, y: 0, scale: 0.2 },
      max: { x: 2816, y: 2112, scale: 1.2 },
    },
    "Absolute Settlement map-coordinate slot. Dragging edits the source x/y used by both construction ghosts and built sprites.",
  );
}

const SETTLEMENT_CONSTRUCTION_SLOT_REGIONS = Object.fromEntries(
  SETTLEMENT_CONSTRUCTION_PLACEMENT_SLOTS.map((slot) => [settlementConstructionSlotRegionId(slot.id), settlementConstructionSlotRegion(slot)]),
);

const BOTTOM_DOCK_BUTTONS = {
  "bottomDock.garden": region("bottomDock.garden", "Garden tab button", "Bottom dock buttons", { draggable: true, resizable: true, mode: "freeform" }),
  "bottomDock.blox": region("bottomDock.blox", "Blox tab button", "Bottom dock buttons", { draggable: true, resizable: true, mode: "freeform" }),
  "bottomDock.match3": region("bottomDock.match3", "Gems tab button", "Bottom dock buttons", { draggable: true, resizable: true, mode: "freeform" }),
  "bottomDock.merge": region("bottomDock.merge", "Merge tab button", "Bottom dock buttons", { draggable: true, resizable: true, mode: "freeform" }),
  "bottomDock.bubbo": region("bottomDock.bubbo", "Bubbo tab button", "Bottom dock buttons", { draggable: true, resizable: true, mode: "freeform" }),
  "bottomDock.trivia": region("bottomDock.trivia", "Trivia tab button", "Bottom dock buttons", { draggable: true, resizable: true, mode: "freeform" }),
  "bottomDock.room": region("bottomDock.room", "Yard tab button", "Bottom dock buttons", { draggable: true, resizable: true, mode: "freeform" }),
  "bottomDock.settlement": region("bottomDock.settlement", "Town tab button", "Bottom dock buttons", { draggable: true, resizable: true, mode: "freeform" }),
};

const GAME_REGIONS = {
  garden: {
    gardenComposition:region("gardenComposition","Garden responsive composition","Garden Shelf",{measured:true,mode:"custom"},"Measured local-area adapter owns both orientations and exactly three plant spots per shelf."),
    gardenStatusRail:region("gardenStatusRail","Garden resource and action rail","Garden Shelf",{measured:true,mode:"custom"}),
    gardenBackgroundAsset:region("gardenBackgroundAsset","Garden greenhouse background","Garden Shelf assets",{draggable:true,resizable:true,asset:true,mode:"freeform"}),
    gardenShelfAsset:region("gardenShelfAsset","Garden repeated shelf art","Garden Shelf assets",{measured:true,asset:true,mode:"custom"},"Repeated fixed-aspect decorative planks belong to each flow shelf, not freely moved gameplay anchors."),
    gardenSheet:region("gardenSheet","Garden detail/shop sheet","Garden Shelf",{measured:true,mode:"custom"},"Bounded modal flow adapter; sticky dismissal and content scrolling stay owned by Garden rather than transformed artwork slots."),
    gardenQuestSheet:region("gardenQuestSheet","Garden quest sheet","Garden Shelf",{measured:true,mode:"custom"},"Bounded modal flow adapter for localized quest lists; content and dismissal remain reachable at every profile."),

    gardenRoot: region("gardenRoot", "Garden root", "Garden Shelf", { measured: true, mode: "custom" }),
    gardenSign: region("gardenSign", "Garden sign", "Garden Shelf", { draggable: true, resizable: true, mode: "anchored" }),
    gardenSignAsset: region("gardenSignAsset", "Garden sign image asset", "Garden Shelf assets", { draggable: true, resizable: true, mode: "freeform", asset: true }, "Editable visual asset inside the Garden sign. This moves/scales the image, not the gameplay data."),
    gardenShelf: region("gardenShelf", "Garden shelf viewport", "Garden Shelf", { measured: true, mode: "custom" }),
    gardenBottomPlank: region("gardenBottomPlank", "Garden bottom plank reserve", "Garden Shelf", { resizable: true, affectsPixiSafeArea: false, measured: true, mode: "reserveOnly" }),
  },
  blox: {
    bloxComposition: region("bloxComposition", "Blox field composition", "Blox v2", { measured: true, mode: "custom", draggable: false, resizable: false }, "Pure composition adapter owns board/tray hit geometry."),
    bloxActions: region("bloxActions", "Blox actions", "Blox v2", { measured: true, mode: "custom", draggable: false, resizable: false }),
    bloxTitle: region("bloxTitle", "Blox title", "Blox v2", { measured: true, mode: "custom", draggable: false, resizable: false }),
    bloxTrayDock: region("bloxTrayDock", "Blox tray", "Blox v2", { measured: true, mode: "custom", draggable: false, resizable: false }),
    puzzleComposition: region("puzzleComposition", "Legacy puzzle composition", "Blox v2", { measured: true, mode: "custom", draggable: false, resizable: false }),
    gameplayHud: COMMON_REGIONS.gameplayHud,
    eventLog: COMMON_REGIONS.eventLog,
    pauseOverlay: COMMON_REGIONS.pauseOverlay,
    pixiPlayfieldReserve: COMMON_REGIONS.pixiPlayfieldReserve,
    bloxBackgroundAsset: assetRegion("bloxBackgroundAsset", "Blox background asset", "Blox Pixi assets", "Visual Pixi background calibration. It does not move board hit targets."),
    bloxBoardFrameAsset: assetRegion("bloxBoardFrameAsset", "Blox board frame asset", "Blox Pixi assets", "Visual Pixi frame calibration. Keep it aligned with the play grid."),
    bloxTrayPanelAsset: assetRegion("bloxTrayPanelAsset", "Blox tray panel asset", "Blox Pixi assets", "Visual Pixi tray panel calibration. Tray slot input remains owned by the Pixi scene."),
  },
  match3: {
    match3Composition: region("match3Composition", "Match3 composition", "Match3 v2", { measured: true, mode: "custom", draggable: false, resizable: false }, "Pure adapter owns board, tool and hit geometry."),
    match3TitleAsset: assetRegion("match3TitleAsset", "Match3 title plaque", "Match3 v2 assets"),
    match3SelectionHud: region("match3SelectionHud", "Match3 selection", "Match3 v2", { measured: true, mode: "custom", draggable: false, resizable: false }),
    match3ModeLabel: region("match3ModeLabel", "Match3 mode label", "Match3 v2", { measured: true, mode: "custom", draggable: false, resizable: false }),
    gameplayHud: COMMON_REGIONS.gameplayHud,
    pauseOverlay: COMMON_REGIONS.pauseOverlay,
    match3ActionDock: region("match3ActionDock", "Gems booster dock", "Gems", { draggable: true, resizable: true, affectsPixiSafeArea: true, mode: "dock" }),
    pixiPlayfieldReserve: COMMON_REGIONS.pixiPlayfieldReserve,
    match3BackgroundAsset: assetRegion("match3BackgroundAsset", "Gems table background asset", "Gems Pixi assets", "Visual Pixi background calibration. It does not move board hit targets."),
    match3BoardFrameAsset: assetRegion("match3BoardFrameAsset", "Gems board frame asset", "Gems Pixi assets", "Visual Pixi frame calibration. Keep it aligned with the play grid."),
  },
  merge: {
    mergeLabComposition: region("mergeLabComposition", "Merge Laboratory Composition", "Merge Laboratory", { draggable: false, resizable: false, canChangeVisibility: false, measured: true, mode: "custom" }),
    mergeLabHud: region("mergeLabHud", "Merge Laboratory Hud", "Merge Laboratory", { draggable: false, resizable: false, canChangeVisibility: false, measured: true, mode: "custom" }),
    mergeLabExperiment: region("mergeLabExperiment", "Merge Laboratory Experiment", "Merge Laboratory", { draggable: false, resizable: false, canChangeVisibility: false, measured: true, mode: "custom" }),
    mergeLabSamples: region("mergeLabSamples", "Merge Laboratory Samples", "Merge Laboratory", { draggable: false, resizable: false, canChangeVisibility: false, measured: true, mode: "custom" }),
    mergeLabDialog: region("mergeLabDialog", "Merge Laboratory Dialog", "Merge Laboratory", { draggable: false, resizable: false, canChangeVisibility: false, measured: true, mode: "custom" }),
    mergeLabBackdropAsset: assetRegion("mergeLabBackdropAsset", "Merge Laboratory background", "Merge Laboratory assets", "Visual-only background; flow controls and sample wells stay fixed."),
    mergeSceneHud: region("mergeSceneHud", "Merge top HUD", "Merge", { draggable: true, resizable: true, affectsPixiSafeArea: true, mode: "anchored" }),
    mergeActionDock: region("mergeActionDock", "Merge action dock", "Merge", { draggable: true, resizable: true, affectsPixiSafeArea: true, mode: "dock" }),
    mergeSceneDrawer: region("mergeSceneDrawer", "Merge in-scene drawer", "Merge", { draggable: true, resizable: true, mode: "anchored" }),
    pixiPlayfieldReserve: COMMON_REGIONS.pixiPlayfieldReserve,
    pauseOverlay: COMMON_REGIONS.pauseOverlay,
    mergeTableAsset: assetRegion("mergeTableAsset", "Merge table background asset", "Merge Pixi assets", "Visual Pixi table calibration. It does not move merge hit targets."),
    mergeBoardFrameAsset: assetRegion("mergeBoardFrameAsset", "Merge board frame asset", "Merge Pixi assets", "Visual Pixi board-frame calibration. Keep it aligned with the merge grid."),
    mergeActionGenerateAsset: assetRegion("mergeActionGenerateAsset", "Merge generate button asset", "Merge DOM assets", "Editable DOM asset/control inside the Merge action dock."),
  },
  bubbo: {
    bubboComposition: region("bubboComposition", "Bubbo field composition", "Bubbo v2", { measured: true, mode: "custom", draggable: false, resizable: false }, "The pure composition adapter owns the field, cannon and hit geometry; edit shared layout configuration rather than independent token anchors."),
    bubboActionDock: region("bubboActionDock", "Bubbo actions", "Bubbo v2", { measured: true, mode: "custom", draggable: false, resizable: false }),
    bubboCompactScroll: region("bubboCompactScroll", "Bubbo compact scroll navigation", "Bubbo v2", { measured: true, mode: "custom", draggable: false, resizable: false }),
    bubboBackgroundAsset: assetRegion("bubboBackgroundAsset", "Bubbo scenic background", "Bubbo v2 assets", "Editable background. Cannon and bubbles intentionally remain tied to analytical shot geometry."),
    gameplayHud: COMMON_REGIONS.gameplayHud,
    eventLog: COMMON_REGIONS.eventLog,
    pauseOverlay: COMMON_REGIONS.pauseOverlay,
    pixiPlayfieldReserve: COMMON_REGIONS.pixiPlayfieldReserve,
    bubboBottomTrayAsset: assetRegion("bubboBottomTrayAsset", "Bubbo bottom tray asset", "Bubbo Pixi assets", "Visual Pixi tray calibration. Shot origin and hit targets remain scene-owned."),
    bubboCannonAsset: assetRegion("bubboCannonAsset", "Bubbo cannon asset", "Bubbo Pixi assets", "Visual Pixi cannon calibration. Keep it near the actual shot origin."),
  },
  trivia: {
    triviaSetup: region("triviaSetup", "Trivia setup flow", "Trivia", { measured: true, mode: "custom" }),
    triviaResult: region("triviaResult", "Trivia results flow", "Trivia", { measured: true, mode: "custom" }),
    triviaFeedback: region("triviaFeedback", "Trivia reserved answer feedback", "Trivia", { measured: true, mode: "custom" }),
    triviaAnswerGrid: region("triviaAnswerGrid", "Trivia answer grid", "Trivia", { measured: true, mode: "custom" }, "Flow adapter preserves four untruncated answers: one column in portrait, two in landscape with internal scrolling."),
    triviaLifelineDock: region("triviaLifelineDock", "Trivia solo lifelines", "Trivia", { measured: true, mode: "custom" }, "Three real solo lifelines in a fixed 44px-minimum control row. Absent during duels."),
    triviaShell: region("triviaShell", "Trivia shell", "Trivia", { measured: true, mode: "custom" }),
    triviaQuestionPanel: region("triviaQuestionPanel", "Question panel", "Trivia", { measured: true, mode: "custom" }),
    triviaPausePanel: region("triviaPausePanel", "Trivia bounded pause dialog", "Trivia", { measured: true, mode: "custom" }),
    gameplayHud: COMMON_REGIONS.gameplayHud,
    triviaBackgroundAsset: assetRegion("triviaBackgroundAsset", "Trivia room background asset", "Trivia DOM assets"),
    triviaQuestionSurfaceAsset: assetRegion("triviaQuestionSurfaceAsset", "Trivia question panel surface asset", "Trivia DOM assets"),
  },
  room: {
    yardStage: region("yardStage", "Yard play stage", "Cozy Yard", { measured: true, affectsPixiSafeArea: false, mode: "custom" }),
    yardHudLayer: region("yardHudLayer", "Yard HUD layer", "Cozy Yard", { draggable: false, resizable: false, mode: "custom" }),
    yardCurrencyStack: region("yardCurrencyStack", "Yard currency stack", "Cozy Yard", { draggable: true, resizable: true, mode: "stack" }),
    yardBottomDock: region("yardBottomDock", "Yard bottom dock", "Cozy Yard", { draggable: true, resizable: true, affectsPixiSafeArea: true, mode: "dock" }),
    yardGameScreen: region("yardGameScreen", "Yard game screen/dialog", "Cozy Yard", { draggable: true, resizable: true, mode: "anchored" }),
    yardBackgroundAsset: assetRegion("yardBackgroundAsset", "Yard background art asset", "Cozy Yard assets"),
    yardCompanionAsset: assetRegion("yardCompanionAsset", "Yard companion image asset", "Cozy Yard assets"),
  },
  settlement: {
    settlementCanvas: region("settlementCanvas", "Settlement Pixi canvas", "Settlement", { measured: true, affectsPixiSafeArea: true, mode: "custom" }, "Settlement owns a custom Pixi lifecycle; this adapter records layout and reserve boundaries without rewriting the scene."),
    settlementTopHud: region("settlementTopHud", "Settlement top HUD", "Settlement", { draggable: true, resizable: true, affectsPixiSafeArea: true, mode: "dock" }),
    settlementLeftDock: region("settlementLeftDock", "Settlement left dock", "Settlement", { draggable: true, resizable: true, affectsPixiSafeArea: true, mode: "dock" }),
    settlementRightPanel: region("settlementRightPanel", "Settlement right panel", "Settlement", { draggable: true, resizable: true, affectsPixiSafeArea: true, mode: "dock" }),
    settlementCompactDetail: region("settlementCompactDetail", "Settlement compact building card", "Settlement", { draggable: true, resizable: true, affectsPixiSafeArea: false, mode: "dock" }, "Contextual bottom card shown only while the full right panel is closed; it is an overlay control and does not reserve camera space."),
    settlementBottomNav: region("settlementBottomNav", "Settlement bottom nav", "Settlement", { draggable: true, resizable: true, affectsPixiSafeArea: true, mode: "dock" }),
    settlementNotices: region("settlementNotices", "Settlement notices", "Settlement", { draggable: true, resizable: true, mode: "stack" }),
    settlementPrimaryBuildAsset: assetRegion("settlementPrimaryBuildAsset", "Settlement primary build button asset", "Settlement DOM assets"),
    settlementCollectAsset: assetRegion("settlementCollectAsset", "Settlement collect button asset", "Settlement DOM assets"),
    ...SETTLEMENT_CONSTRUCTION_SLOT_REGIONS,
  },
};

function mergeCommon(gameRegions = {}) {
  return {
    appTopbar: COMMON_REGIONS.appTopbar,
    globalStats: COMMON_REGIONS.globalStats,
    activeGameFrame: COMMON_REGIONS.activeGameFrame,
    bottomDock: COMMON_REGIONS.bottomDock,
    ...BOTTOM_DOCK_BUTTONS,
    gameShell: COMMON_REGIONS.gameShell,
    ...gameRegions,
  };
}

const games = Object.fromEntries(
  Object.entries(GAME_REGIONS).map(([gameId, regions]) => [gameId, { gameId, regions: mergeCommon(regions) }]),
);

const allRegionIds = Array.from(new Set(Object.values(games).flatMap((entry) => Object.keys(entry.regions)))).sort();

export const hudLayoutRegistry = {
  commonRegions: COMMON_REGIONS,
  games,
  allRegionIds,
};

export function getHudRegionDefinition(gameId, regionId) {
  return hudLayoutRegistry.games[gameId]?.regions?.[regionId] || COMMON_REGIONS[regionId] || null;
}

export function getHudRegionCapabilities(gameId, regionId) {
  return getHudRegionDefinition(gameId, regionId)?.capabilities || {
    draggable: false,
    resizable: false,
    canChangeVisibility: true,
    affectsPixiSafeArea: false,
    measured: false,
    mode: "custom",
  };
}
