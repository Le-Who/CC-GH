import { resolveAssetUrl } from "../../../game-runtime/assetBundles.js";

export const GARDEN_SHEET_PATH = "/games/garden-shelf/assets_transparent.png";
export const GARDEN_SHELF_PATH = "/games/garden-shelf/assets_shelf.png";
export const GARDEN_SIGN_PATH = "/games/garden-shelf/assets_garden_sign.png";
export const GARDEN_COG_PATH = "/games/garden-shelf/assets_garden_cog.png";
export const GARDEN_BOTTOM_PLANK_PATH = "/games/garden-shelf/assets_garden_bottom_plank.png";
const GARDEN_FX_PATHS = {
  coinGlint: "/games/garden-shelf/fx/coin-glint.png",
  xpLeafSparkle: "/games/garden-shelf/fx/xp-leaf-sparkle.png",
  waterSplash: "/games/garden-shelf/fx/water-splash.png",
  careSprout: "/games/garden-shelf/fx/care-sprout.png",
  leafGlint: "/games/garden-shelf/fx/leaf-glint.png",
} as const;
const TRANSPARENT_PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

export type GardenAssetPaths = {
  sheet: string;
  shelf: string;
  sign: string;
  settingsCog: string;
  bottomPlank: string;
  fx: {
    coinGlint: string;
    xpLeafSparkle: string;
    waterSplash: string;
    careSprout: string;
    leafGlint: string;
  };
};

export function resolveGardenAssetPaths(runtimeManifest?: unknown): GardenAssetPaths {
  if (runtimeManifest === undefined) {
    const emptyFx = {
      coinGlint: "",
      xpLeafSparkle: "",
      waterSplash: "",
      careSprout: "",
      leafGlint: "",
    };
    return {
      sheet: TRANSPARENT_PLACEHOLDER,
      shelf: TRANSPARENT_PLACEHOLDER,
      sign: TRANSPARENT_PLACEHOLDER,
      settingsCog: TRANSPARENT_PLACEHOLDER,
      bottomPlank: TRANSPARENT_PLACEHOLDER,
      fx: emptyFx,
    };
  }

  return {
    sheet: resolveAssetUrl("gardenShelf.sheet.transparent", { runtimeManifest, legacyPath: GARDEN_SHEET_PATH }),
    shelf: resolveAssetUrl("gardenShelf.shelf", { runtimeManifest, legacyPath: GARDEN_SHELF_PATH }),
    sign: resolveAssetUrl("gardenShelf.sign", { runtimeManifest, legacyPath: GARDEN_SIGN_PATH }),
    settingsCog: resolveAssetUrl("gardenShelf.settingsCog", { runtimeManifest, legacyPath: GARDEN_COG_PATH }),
    bottomPlank: resolveAssetUrl("gardenShelf.bottomPlank", { runtimeManifest, legacyPath: GARDEN_BOTTOM_PLANK_PATH }),
    fx: {
      coinGlint: resolveAssetUrl("gardenShelf.fx.coin-glint", { runtimeManifest, legacyPath: GARDEN_FX_PATHS.coinGlint }),
      xpLeafSparkle: resolveAssetUrl("gardenShelf.fx.xp-leaf-sparkle", { runtimeManifest, legacyPath: GARDEN_FX_PATHS.xpLeafSparkle }),
      waterSplash: resolveAssetUrl("gardenShelf.fx.water-splash", { runtimeManifest, legacyPath: GARDEN_FX_PATHS.waterSplash }),
      careSprout: resolveAssetUrl("gardenShelf.fx.care-sprout", { runtimeManifest, legacyPath: GARDEN_FX_PATHS.careSprout }),
      leafGlint: resolveAssetUrl("gardenShelf.fx.leaf-glint", { runtimeManifest, legacyPath: GARDEN_FX_PATHS.leafGlint }),
    },
  };
}

export const GARDEN_PLANT_COUNT = 14;
export const GARDEN_PHASE_COUNT = 4;
export const GARDEN_SHEET_COLUMNS = 8;
export const GARDEN_SHEET_ROWS = Math.ceil(GARDEN_PLANT_COUNT / 2);
export const GARDEN_SHEET_WIDTH = 1672;
export const GARDEN_SHEET_HEIGHT = 1645;

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

const PRECISE_GARDEN_SPRITE_FRAMES = [
  { col: 0, row: 0, x: 81, y: 135, width: 89, height: 113 },
  { col: 1, row: 0, x: 251, y: 90, width: 102, height: 159 },
  { col: 2, row: 0, x: 418, y: 45, width: 149, height: 205 },
  { col: 3, row: 0, x: 612, y: 24, width: 194, height: 228 },
  { col: 4, row: 0, x: 907, y: 116, width: 87, height: 135 },
  { col: 5, row: 0, x: 1073, y: 76, width: 101, height: 175 },
  { col: 6, row: 0, x: 1245, y: 28, width: 145, height: 223 },
  { col: 7, row: 0, x: 1424, y: 20, width: 188, height: 231 },
  { col: 0, row: 1, x: 79, y: 346, width: 97, height: 130 },
  { col: 1, row: 1, x: 250, y: 324, width: 102, height: 152 },
  { col: 2, row: 1, x: 424, y: 284, width: 148, height: 193 },
  { col: 3, row: 1, x: 615, y: 269, width: 180, height: 212 },
  { col: 4, row: 1, x: 905, y: 348, width: 95, height: 131 },
  { col: 5, row: 1, x: 1073, y: 313, width: 103, height: 167 },
  { col: 6, row: 1, x: 1248, y: 286, width: 127, height: 194 },
  { col: 7, row: 1, x: 1444, y: 272, width: 151, height: 209 },
  { col: 0, row: 2, x: 77, y: 569, width: 93, height: 128 },
  { col: 1, row: 2, x: 246, y: 536, width: 103, height: 161 },
  { col: 2, row: 2, x: 413, y: 505, width: 142, height: 193 },
  { col: 3, row: 2, x: 594, y: 484, width: 201, height: 218 },
  { col: 4, row: 2, x: 901, y: 578, width: 96, height: 120 },
  { col: 5, row: 2, x: 1058, y: 547, width: 127, height: 153 },
  { col: 6, row: 2, x: 1233, y: 526, width: 150, height: 175 },
  { col: 7, row: 2, x: 1419, y: 505, width: 191, height: 199 },
  { col: 0, row: 3, x: 77, y: 782, width: 88, height: 119 },
  { col: 1, row: 3, x: 233, y: 759, width: 130, height: 141 },
  { col: 2, row: 3, x: 399, y: 732, width: 171, height: 170 },
  { col: 3, row: 3, x: 590, y: 717, width: 224, height: 186 },
  { col: 4, row: 3, x: 901, y: 788, width: 85, height: 121 },
  { col: 5, row: 3, x: 1052, y: 760, width: 117, height: 151 },
  { col: 6, row: 3, x: 1225, y: 728, width: 158, height: 183 },
  { col: 7, row: 3, x: 1418, y: 722, width: 195, height: 191 },
  { col: 0, row: 4, x: 63, y: 1099, width: 83, height: 65 },
  { col: 1, row: 4, x: 261, y: 1047, width: 105, height: 117 },
  { col: 2, row: 4, x: 452, y: 1006, width: 142, height: 158 },
  { col: 3, row: 4, x: 639, y: 982, width: 186, height: 182 },
  { col: 4, row: 4, x: 901, y: 947, width: 80, height: 147 },
  { col: 5, row: 4, x: 1104, y: 947, width: 91, height: 186 },
  { col: 6, row: 4, x: 1305, y: 947, width: 108, height: 201 },
  { col: 7, row: 4, x: 1510, y: 947, width: 116, height: 222 },
  { col: 0, row: 5, x: 66, y: 1260, width: 77, height: 140 },
  { col: 1, row: 5, x: 268, y: 1240, width: 92, height: 160 },
  { col: 2, row: 5, x: 467, y: 1210, width: 112, height: 190 },
  { col: 3, row: 5, x: 662, y: 1192, width: 140, height: 208 },
  { col: 4, row: 5, x: 900, y: 1290, width: 81, height: 110 },
  { col: 5, row: 5, x: 1104, y: 1272, width: 91, height: 128 },
  { col: 6, row: 5, x: 1297, y: 1233, width: 124, height: 167 },
  { col: 7, row: 5, x: 1477, y: 1212, width: 183, height: 188 },
  { col: 0, row: 6, x: 68, y: 1517, width: 73, height: 118 },
  { col: 1, row: 6, x: 269, y: 1484, width: 90, height: 151 },
  { col: 2, row: 6, x: 469, y: 1458, width: 107, height: 177 },
  { col: 3, row: 6, x: 674, y: 1437, width: 116, height: 198 },
  { col: 4, row: 6, x: 910, y: 1544, width: 61, height: 90 },
  { col: 5, row: 6, x: 1093, y: 1498, width: 113, height: 136 },
  { col: 6, row: 6, x: 1274, y: 1472, width: 169, height: 162 },
  { col: 7, row: 6, x: 1473, y: 1458, width: 190, height: 176 },
];

spriteData.sprites = PRECISE_GARDEN_SPRITE_FRAMES;

export function getGardenSpriteFrame(spriteIndex = 0, phase = 0) {
  const safePhase = Math.max(0, Math.min(3, Number(phase) || 0));
  const safeIndex = Math.max(0, Math.min(GARDEN_PLANT_COUNT - 1, Math.floor(Number(spriteIndex) || 0)));
  return spriteData.sprites[safeIndex * GARDEN_PHASE_COUNT + safePhase];
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
