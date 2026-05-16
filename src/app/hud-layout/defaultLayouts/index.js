import garden from "./garden.json" with { type: "json" };
import blox from "./blox.json" with { type: "json" };
import match3 from "./match3.json" with { type: "json" };
import merge from "./merge.json" with { type: "json" };
import bubbo from "./bubbo.json" with { type: "json" };
import trivia from "./trivia.json" with { type: "json" };
import room from "./room.json" with { type: "json" };
import settlement from "./settlement.json" with { type: "json" };
import {
  SETTLEMENT_CONSTRUCTION_PLACEMENT_SLOTS,
  settlementConstructionSlotRegionId,
} from "../../../games/settlement/placementSlots.js";

const BOTTOM_DOCK_BUTTON_DEFAULTS = Object.fromEntries(
  ["garden", "blox", "match3", "merge", "bubbo", "trivia", "room", "settlement"]
    .map((id) => [`bottomDock.${id}`, { mode: "freeform", x: 0, y: 0, scale: 1, opacity: 1, visible: true }]),
);

const GARDEN_ASSET_DEFAULTS = {
  gardenSignAsset: { mode: "freeform", x: 0, y: 0, scale: 1, opacity: 1, zIndex: 111, visible: true },
};

const GAME_ASSET_DEFAULTS = {
  garden: GARDEN_ASSET_DEFAULTS,
  blox: {
    bloxBackgroundAsset: { mode: "freeform", x: 0, y: 0, scale: 1, opacity: 1, rotation: 0, visible: true },
    bloxBoardFrameAsset: { mode: "freeform", x: 0, y: 0, scale: 1, opacity: 1, rotation: 0, visible: true },
    bloxTrayPanelAsset: { mode: "freeform", x: 0, y: 0, scale: 1, opacity: 1, rotation: 0, visible: true },
  },
  match3: {
    match3BackgroundAsset: { mode: "freeform", x: 0, y: 0, scale: 1, opacity: 1, rotation: 0, visible: true },
    match3BoardFrameAsset: { mode: "freeform", x: 0, y: 0, scale: 1, opacity: 1, rotation: 0, visible: true },
  },
  merge: {
    mergeTableAsset: { mode: "freeform", x: 0, y: 0, scale: 1, opacity: 1, rotation: 0, visible: true },
    mergeBoardFrameAsset: { mode: "freeform", x: 0, y: 0, scale: 1, opacity: 1, rotation: 0, visible: true },
    mergeActionGenerateAsset: { mode: "freeform", x: 0, y: 0, scale: 1, opacity: 1, rotation: 0, visible: true },
  },
  bubbo: {
    bubboBottomTrayAsset: { mode: "freeform", x: 0, y: 0, scale: 1, opacity: 1, rotation: 0, visible: true },
    bubboCannonAsset: { mode: "freeform", x: 0, y: 0, scale: 1, opacity: 1, rotation: 0, visible: true },
  },
  trivia: {
    triviaBackgroundAsset: { mode: "freeform", x: 0, y: 0, scale: 1, opacity: 1, rotation: 0, visible: true },
    triviaQuestionSurfaceAsset: { mode: "freeform", x: 0, y: 0, scale: 1, opacity: 1, rotation: 0, visible: true },
  },
  room: {
    yardBackgroundAsset: { mode: "freeform", x: 0, y: 0, scale: 1, opacity: 1, rotation: 0, visible: true },
    yardCompanionAsset: { mode: "freeform", x: 0, y: 0, scale: 1, opacity: 1, rotation: 0, visible: true },
  },
  settlement: {
    settlementPrimaryBuildAsset: { mode: "freeform", x: 0, y: 0, scale: 1, opacity: 1, rotation: 0, visible: true },
    settlementCollectAsset: { mode: "freeform", x: 0, y: 0, scale: 1, opacity: 1, rotation: 0, visible: true },
    ...Object.fromEntries(
      SETTLEMENT_CONSTRUCTION_PLACEMENT_SLOTS.map((slot) => [
        settlementConstructionSlotRegionId(slot.id),
        { mode: "custom", x: slot.x, y: slot.y, scale: slot.scale, visible: true },
      ]),
    ),
  },
};

function withSharedEditorDefaults(layout) {
  const extraRegions = {
    ...BOTTOM_DOCK_BUTTON_DEFAULTS,
    ...(GAME_ASSET_DEFAULTS[layout.gameId] || {}),
  };
  return {
    ...layout,
    base: {
      ...(layout.base || {}),
      regions: {
        ...extraRegions,
        ...(layout.base?.regions || {}),
      },
    },
  };
}

export const HUD_LAYOUT_DEFAULTS = {
  garden: withSharedEditorDefaults(garden),
  blox: withSharedEditorDefaults(blox),
  match3: withSharedEditorDefaults(match3),
  merge: withSharedEditorDefaults(merge),
  bubbo: withSharedEditorDefaults(bubbo),
  trivia: withSharedEditorDefaults(trivia),
  room: withSharedEditorDefaults(room),
  settlement: withSharedEditorDefaults(settlement),
};

export function getDefaultHudLayout(gameId) {
  return HUD_LAYOUT_DEFAULTS[gameId] || null;
}
