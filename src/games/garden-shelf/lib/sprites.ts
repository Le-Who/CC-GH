import { resolveAssetUrl } from "../../../game-runtime/assetBundles.js";

export const GARDEN_SHEET_PATH = "/games/garden-shelf/assets_transparent.png";
export const GARDEN_SHELF_PATH = "/games/garden-shelf/assets_shelf.png";
export const GARDEN_SIGN_PATH = "/games/garden-shelf/assets_garden_sign.png";
export const GARDEN_COG_PATH = "/games/garden-shelf/assets_garden_cog.png";
export const GARDEN_BOTTOM_PLANK_PATH = "/games/garden-shelf/assets_garden_bottom_plank.png";

export type GardenAssetPaths = {
  sheet: string;
  shelf: string;
  sign: string;
  settingsCog: string;
  bottomPlank: string;
};

export function resolveGardenAssetPaths(runtimeManifest?: unknown): GardenAssetPaths {
  return {
    sheet: resolveAssetUrl("gardenShelf.sheet.transparent", { runtimeManifest, legacyPath: GARDEN_SHEET_PATH }),
    shelf: resolveAssetUrl("gardenShelf.shelf", { runtimeManifest, legacyPath: GARDEN_SHELF_PATH }),
    sign: resolveAssetUrl("gardenShelf.sign", { runtimeManifest, legacyPath: GARDEN_SIGN_PATH }),
    settingsCog: resolveAssetUrl("gardenShelf.settingsCog", { runtimeManifest, legacyPath: GARDEN_COG_PATH }),
    bottomPlank: resolveAssetUrl("gardenShelf.bottomPlank", { runtimeManifest, legacyPath: GARDEN_BOTTOM_PLANK_PATH }),
  };
}

export const GARDEN_PLANT_COUNT = 14;
export const GARDEN_PHASE_COUNT = 4;
export const GARDEN_SHEET_COLUMNS = 8;
export const GARDEN_SHEET_ROWS = Math.ceil(GARDEN_PLANT_COUNT / 2);
export const GARDEN_SHEET_WIDTH = 1672;
export const GARDEN_SHEET_HEIGHT = 1645;
const GARDEN_CELL_WIDTH = GARDEN_SHEET_WIDTH / GARDEN_SHEET_COLUMNS;
const GARDEN_CELL_HEIGHT = GARDEN_SHEET_HEIGHT / GARDEN_SHEET_ROWS;
const GARDEN_FRAME_INSET_X = 18;
const GARDEN_FRAME_INSET_Y = 14;
const GARDEN_FRAME_WIDTH = 173;
const GARDEN_FRAME_HEIGHT = 207;
const GARDEN_NEW_PLANT_START_INDEX = 8;

export const spriteData = {
  "fullWidth": GARDEN_SHEET_WIDTH,
  "fullHeight": GARDEN_SHEET_HEIGHT,
  "sprites": [
    {
      "col": 0,
      "row": 0,
      "x": 79,
      "y": 135,
      "width": 98,
      "height": 116
    },
    {
      "col": 0,
      "row": 1,
      "x": 77,
      "y": 346,
      "width": 100,
      "height": 133
    },
    {
      "col": 0,
      "row": 2,
      "x": 76,
      "y": 570,
      "width": 96,
      "height": 129
    },
    {
      "col": 0,
      "row": 3,
      "x": 76,
      "y": 783,
      "width": 93,
      "height": 122
    },
    {
      "col": 1,
      "row": 0,
      "x": 250,
      "y": 90,
      "width": 108,
      "height": 162
    },
    {
      "col": 1,
      "row": 1,
      "x": 248,
      "y": 324,
      "width": 104,
      "height": 155
    },
    {
      "col": 1,
      "row": 2,
      "x": 245,
      "y": 536,
      "width": 106,
      "height": 164
    },
    {
      "col": 1,
      "row": 3,
      "x": 232,
      "y": 760,
      "width": 130,
      "height": 145
    },
    {
      "col": 2,
      "row": 0,
      "x": 417,
      "y": 45,
      "width": 149,
      "height": 208
    },
    {
      "col": 2,
      "row": 1,
      "x": 423,
      "y": 284,
      "width": 148,
      "height": 196
    },
    {
      "col": 2,
      "row": 2,
      "x": 412,
      "y": 506,
      "width": 142,
      "height": 195
    },
    {
      "col": 2,
      "row": 3,
      "x": 398,
      "y": 732,
      "width": 171,
      "height": 175
    },
    {
      "col": 3,
      "row": 0,
      "x": 611,
      "y": 24,
      "width": 194,
      "height": 231
    },
    {
      "col": 3,
      "row": 1,
      "x": 613,
      "y": 270,
      "width": 181,
      "height": 218
    },
    {
      "col": 3,
      "row": 2,
      "x": 593,
      "y": 488,
      "width": 201,
      "height": 217
    },
    {
      "col": 3,
      "row": 3,
      "x": 588,
      "y": 718,
      "width": 226,
      "height": 191
    },
    {
      "col": 4,
      "row": 0,
      "x": 906,
      "y": 116,
      "width": 90,
      "height": 138
    },
    {
      "col": 4,
      "row": 1,
      "x": 904,
      "y": 349,
      "width": 100,
      "height": 133
    },
    {
      "col": 4,
      "row": 2,
      "x": 899,
      "y": 579,
      "width": 97,
      "height": 122
    },
    {
      "col": 4,
      "row": 3,
      "x": 900,
      "y": 789,
      "width": 87,
      "height": 124
    },
    {
      "col": 5,
      "row": 0,
      "x": 1072,
      "y": 76,
      "width": 105,
      "height": 178
    },
    {
      "col": 5,
      "row": 1,
      "x": 1072,
      "y": 313,
      "width": 108,
      "height": 170
    },
    {
      "col": 5,
      "row": 2,
      "x": 1057,
      "y": 548,
      "width": 127,
      "height": 155
    },
    {
      "col": 5,
      "row": 3,
      "x": 1051,
      "y": 761,
      "width": 118,
      "height": 154
    },
    {
      "col": 6,
      "row": 0,
      "x": 1244,
      "y": 28,
      "width": 145,
      "height": 226
    },
    {
      "col": 6,
      "row": 1,
      "x": 1246,
      "y": 286,
      "width": 128,
      "height": 197
    },
    {
      "col": 6,
      "row": 2,
      "x": 1232,
      "y": 527,
      "width": 151,
      "height": 178
    },
    {
      "col": 6,
      "row": 3,
      "x": 1223,
      "y": 729,
      "width": 160,
      "height": 186
    },
    {
      "col": 7,
      "row": 0,
      "x": 1422,
      "y": 20,
      "width": 189,
      "height": 234
    },
    {
      "col": 7,
      "row": 1,
      "x": 1443,
      "y": 272,
      "width": 152,
      "height": 211
    },
    {
      "col": 7,
      "row": 2,
      "x": 1418,
      "y": 506,
      "width": 191,
      "height": 201
    },
    {
      "col": 7,
      "row": 3,
      "x": 1416,
      "y": 722,
      "width": 197,
      "height": 195
    }
  ]
};

function buildGardenSpriteFrames() {
  return Array.from({ length: GARDEN_PLANT_COUNT * GARDEN_PHASE_COUNT }, (_item, index) => {
    const spriteIndex = Math.floor(index / GARDEN_PHASE_COUNT);
    const phase = index % GARDEN_PHASE_COUNT;
    const col = (spriteIndex % 2) * GARDEN_PHASE_COUNT + phase;
    const row = Math.floor(spriteIndex / 2);
    const usesFullCell = spriteIndex >= GARDEN_NEW_PLANT_START_INDEX;
    return {
      col,
      row,
      x: Math.round(col * GARDEN_CELL_WIDTH + (usesFullCell ? 0 : GARDEN_FRAME_INSET_X)),
      y: Math.round(row * GARDEN_CELL_HEIGHT + (usesFullCell ? 0 : GARDEN_FRAME_INSET_Y)),
      width: usesFullCell ? Math.round(GARDEN_CELL_WIDTH) : GARDEN_FRAME_WIDTH,
      height: usesFullCell ? Math.round(GARDEN_CELL_HEIGHT) : GARDEN_FRAME_HEIGHT,
    };
  });
}

spriteData.sprites = buildGardenSpriteFrames();

export function getGardenSpriteFrame(spriteIndex = 0, phase = 0) {
  const safePhase = Math.max(0, Math.min(3, Number(phase) || 0));
  const safeIndex = Math.max(0, Math.min(GARDEN_PLANT_COUNT - 1, Math.floor(Number(spriteIndex) || 0)));
  const col = (safeIndex % 2) * 4 + safePhase;
  const row = Math.floor(safeIndex / 2);
  const usesFullCell = safeIndex >= GARDEN_NEW_PLANT_START_INDEX;
  return {
    col,
    row,
    x: Math.round(col * GARDEN_CELL_WIDTH + (usesFullCell ? 0 : GARDEN_FRAME_INSET_X)),
    y: Math.round(row * GARDEN_CELL_HEIGHT + (usesFullCell ? 0 : GARDEN_FRAME_INSET_Y)),
    width: usesFullCell ? Math.round(GARDEN_CELL_WIDTH) : GARDEN_FRAME_WIDTH,
    height: usesFullCell ? Math.round(GARDEN_CELL_HEIGHT) : GARDEN_FRAME_HEIGHT,
  };
}

export function getGardenSpriteStyle(spriteIndex = 0, phase = 0, scale = 1, sheetPath = GARDEN_SHEET_PATH) {
  const safePhase = Math.max(0, Math.min(3, Number(phase) || 0));
  const sprite = getGardenSpriteFrame(spriteIndex, safePhase);
  if (!sprite) {
    return {
      backgroundImage: `url('${sheetPath}')`,
      backgroundSize: `${GARDEN_SHEET_COLUMNS * 100}% ${GARDEN_SHEET_ROWS * 100}%`,
      backgroundPosition: `${(((spriteIndex % 2) * 4 + safePhase) / (GARDEN_SHEET_COLUMNS - 1)) * 100}% ${(Math.floor(spriteIndex / 2) / Math.max(1, GARDEN_SHEET_ROWS - 1)) * 100}%`,
      width: `${96 * scale}px`,
      height: `${96 * scale}px`,
      transformOrigin: "bottom center",
    };
  }

  const pX = (sprite.x / (spriteData.fullWidth - sprite.width)) * 100;
  const pY = (sprite.y / (spriteData.fullHeight - sprite.height)) * 100;
  return {
    backgroundImage: `url('${sheetPath}')`,
    backgroundSize: `${(spriteData.fullWidth / sprite.width) * 100}% ${(spriteData.fullHeight / sprite.height) * 100}%`,
    backgroundPosition: `${pX}% ${pY}%`,
    width: `${sprite.width * scale}px`,
    height: `${sprite.height * scale}px`,
    transformOrigin: "bottom center",
  };
}
