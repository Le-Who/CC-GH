import { existsSync } from "node:fs";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { GAME_REGISTRY, VISIBLE_GAME_IDS } from "../src/app/gameRegistry.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "assets-source", "imagegen", "hud-redesign");
const referenceRoot = path.join(sourceRoot, "references");
const assetSourceRoot = path.join(sourceRoot, "asset-sources");
const assetRoot = path.join(sourceRoot, "assets");
const publicSurfaceRoot = path.join(root, "public", "games", "ui-surfaces");
const publicRuntimeRoot = path.join(root, "public", "games", "hud-redesign");
const manifestPath = path.join(sourceRoot, "hud-redesign-manifest.json");

const DEFAULT_CHROMA_KEY = "#00ff00";
const MAGENTA_CHROMA_KEY = "#ff00ff";

const GAME_SPECS = {
  garden: {
    label: "Garden Shelf",
    title: "Garden",
    short: "GRD",
    palette: {
      bg: "#10241a",
      bg2: "#24402d",
      panel: "#f3d9a6",
      panel2: "#6a4b24",
      ink: "#2d220f",
      lightInk: "#fff5cc",
      accent: "#7cc46b",
      accent2: "#e2b84f",
      danger: "#c9564d",
      play: "#315640",
    },
    metrics: ["gold", "levelXp", "growthStage", "productionReady", "cooldown", "questClaim", "inventoryShop"],
    layout: {
      mode: "terrarium-first portrait",
      regions: [
        { id: "topMetricPlaque", anchor: "top", rect: "14,16,332,56", content: ["gold", "levelXp", "settings"] },
        { id: "questBadge", anchor: "left-edge", rect: "18,92,44,44", content: ["questClaim"] },
        { id: "shelfPlayfield", anchor: "center", rect: "14,82,332,506", content: ["plants", "growthStage", "cooldown"] },
        { id: "lowerQuestSheet", anchor: "bottom", rect: "16,604,328,84", content: ["questProgress", "reward"] },
        { id: "bottomToolDock", anchor: "bottom", rect: "16,704,328,72", content: ["shop", "water", "collect", "pot", "tasks"] },
      ],
    },
    surfaces: ["garden-panel.png", "garden-dialog-panel.png"],
  },
  blox: {
    label: "Blox",
    title: "Blox",
    short: "BLX",
    palette: {
      bg: "#120d24",
      bg2: "#201737",
      panel: "#1f1740",
      panel2: "#312558",
      ink: "#efe9ff",
      lightInk: "#f8f3ff",
      accent: "#7fe26b",
      accent2: "#ffd44d",
      danger: "#ff675c",
      play: "#0e1026",
    },
    metrics: ["score", "lines", "rewardTrack", "trayAvailability", "selectedPiece", "placementValidity"],
    layout: {
      mode: "board-first portrait",
      regions: [
        { id: "topScoreRail", anchor: "top", rect: "14,16,332,56", content: ["score", "stars", "pause"] },
        { id: "boardField", anchor: "center", rect: "16,88,328,416", content: ["grid", "placementPreview"] },
        { id: "pieceTray", anchor: "lower", rect: "18,520,324,76", content: ["threePieces", "selectedPiece"] },
        { id: "rewardRail", anchor: "lower", rect: "18,610,324,62", content: ["lines", "rewardTrack"] },
        { id: "feedbackBand", anchor: "bottom-reserve", rect: "18,688,324,84", content: ["validInvalid", "comboToast"] },
      ],
    },
    surfaces: ["blox-panel.png", "blox-dialog-panel.png"],
  },
  match3: {
    label: "Gem Crush",
    title: "Gems",
    short: "GEM",
    palette: {
      bg: "#1a0c24",
      bg2: "#352050",
      panel: "#422567",
      panel2: "#26163e",
      ink: "#fff4ff",
      lightInk: "#fff7f2",
      accent: "#ffce49",
      accent2: "#68d4ff",
      danger: "#ee4d7b",
      play: "#13214a",
    },
    metrics: ["score", "movesOrTime", "combo", "mode", "selectedGem", "cascadeLock", "dropRewards"],
    layout: {
      mode: "potion-board portrait",
      regions: [
        { id: "topPotionRail", anchor: "top", rect: "14,16,332,64", content: ["score", "moves", "combo", "pause"] },
        { id: "gemBoard", anchor: "center", rect: "18,94,324,414", content: ["grid", "selectedGem", "cascade"] },
        { id: "boosterBar", anchor: "lower", rect: "18,524,324,74", content: ["selectedGem", "boosters", "dropRewards"] },
        { id: "modeStrip", anchor: "lower", rect: "18,612,324,62", content: ["mode", "target"] },
        { id: "lowerActionReserve", anchor: "bottom", rect: "18,690,324,84", content: ["pause", "hint", "reward"] },
      ],
    },
    surfaces: ["match3-panel.png", "match3-dialog-panel.png"],
  },
  merge: {
    label: "Alchemy Merge",
    title: "Merge",
    short: "MRG",
    palette: {
      bg: "#24190f",
      bg2: "#47351c",
      panel: "#76552b",
      panel2: "#2c2115",
      ink: "#fff0cf",
      lightInk: "#fff8dc",
      accent: "#72d06a",
      accent2: "#dcbf70",
      danger: "#d85f42",
      play: "#c7a879",
    },
    metrics: ["essence", "freeTaps", "fuelTokens", "generatorCooldown", "selectedCell", "trashMode", "drawerState"],
    layout: {
      mode: "workbench portrait",
      regions: [
        { id: "topResourceRail", anchor: "top", rect: "14,16,332,56", content: ["essence", "fuel", "cooldown", "pause"] },
        { id: "mergeBoard", anchor: "center", rect: "18,92,324,418", content: ["board", "selectedCell"] },
        { id: "trashModeDock", anchor: "lower", rect: "18,524,324,72", content: ["trashMode", "generator"] },
        { id: "drawerStrip", anchor: "lower", rect: "18,610,324,72", content: ["activeDrawer", "inventory"] },
        { id: "bottomActionDock", anchor: "bottom", rect: "18,698,324,76", content: ["generate", "freeTaps", "library"] },
      ],
    },
    surfaces: ["merge-panel.png", "merge-dialog-panel.png"],
  },
  bubbo: {
    label: "Bubbo",
    title: "Bubbo",
    short: "BUB",
    palette: {
      bg: "#063053",
      bg2: "#0a5d79",
      panel: "#173b74",
      panel2: "#0e264a",
      ink: "#e8fbff",
      lightInk: "#ffffff",
      accent: "#72dbff",
      accent2: "#ffd75f",
      danger: "#ff6b7b",
      play: "#0b5a80",
    },
    metrics: ["score", "shotsOrTime", "pressureDanger", "currentBubble", "nextBubble", "remainingBubbles", "mode"],
    layout: {
      mode: "shooter-safe portrait",
      regions: [
        { id: "topDangerRail", anchor: "top", rect: "14,16,332,56", content: ["score", "shots", "danger", "pause"] },
        { id: "bubbleField", anchor: "center", rect: "12,82,336,506", content: ["bubbleCluster", "aimLine"] },
        { id: "cannonZone", anchor: "lower-center", rect: "118,568,124,98", content: ["currentBubble", "nextBubble"] },
        { id: "bottomCommandBar", anchor: "bottom", rect: "18,688,324,88", content: ["mode", "powerups", "remaining"] },
        { id: "feedbackPocket", anchor: "lower-right", rect: "248,608,82,58", content: ["comboToast"] },
      ],
    },
    surfaces: ["bubbo-panel.png", "bubbo-dialog-panel.png"],
  },
  trivia: {
    label: "Trivia",
    title: "Trivia",
    short: "TRV",
    palette: {
      bg: "#071127",
      bg2: "#101c3c",
      panel: "#18294f",
      panel2: "#10182f",
      ink: "#f5f7ff",
      lightInk: "#fff4bf",
      accent: "#ffd257",
      accent2: "#7a7dff",
      danger: "#ff6b6b",
      play: "#0e1732",
    },
    metrics: ["score", "streak", "timer", "questionIndex", "answerReveal", "duelRoom", "history"],
    layout: {
      mode: "quiz-card portrait",
      regions: [
        { id: "topQuestionRail", anchor: "top", rect: "14,16,332,56", content: ["timer", "streak", "questionIndex", "pause"] },
        { id: "questionPanel", anchor: "center", rect: "18,98,324,196", content: ["category", "question"] },
        { id: "answerGrid", anchor: "center", rect: "18,312,324,224", content: ["answers", "revealState"] },
        { id: "helpDock", anchor: "lower", rect: "18,552,324,72", content: ["ask", "reveal", "history"] },
        { id: "progressRail", anchor: "bottom", rect: "18,682,324,94", content: ["score", "rewardChests"] },
      ],
    },
    surfaces: ["trivia-panel.png", "trivia-dialog-panel.png"],
  },
  room: {
    label: "Cozy Yard",
    title: "Yard",
    short: "YRD",
    palette: {
      bg: "#20320f",
      bg2: "#556d25",
      panel: "#d9c28a",
      panel2: "#675225",
      ink: "#2b220d",
      lightInk: "#fff8da",
      accent: "#aacb49",
      accent2: "#f0c860",
      danger: "#d85d4d",
      play: "#5f7c35",
    },
    metrics: ["treats", "shinyTreats", "gifts", "visitors", "pendingSync", "activeTool", "placementDraft"],
    layout: {
      mode: "yard-first portrait",
      regions: [
        { id: "edgeCurrencyStack", anchor: "top", rect: "14,16,332,54", content: ["treats", "gifts", "visitors", "settings"] },
        { id: "yardStage", anchor: "center", rect: "12,82,336,536", content: ["companions", "decor", "placementDraft"] },
        { id: "activeToolCard", anchor: "lower", rect: "76,594,208,72", content: ["activeTool", "cooldown"] },
        { id: "bottomDock", anchor: "bottom", rect: "14,696,332,80", content: ["shop", "care", "home", "camera", "friends"] },
        { id: "syncNotice", anchor: "lower-left", rect: "18,626,108,48", content: ["pendingSync"] },
      ],
    },
    surfaces: ["yard-panel.png"],
  },
  settlement: {
    label: "Settlement",
    title: "Town",
    short: "STL",
    palette: {
      bg: "#07130c",
      bg2: "#18351f",
      panel: "#2a2418",
      panel2: "#533d21",
      ink: "#f6e4bb",
      lightInk: "#fff0bd",
      accent: "#f2ca62",
      accent2: "#93c96a",
      danger: "#ff6464",
      play: "#30543a",
    },
    metrics: ["coreResources", "morale", "population", "prestige", "collectReadiness", "selectedBuilding", "constructionState", "researchWorldMap"],
    layout: {
      mode: "map-first adaptive",
      regions: [
        { id: "topResourceRibbon", anchor: "top", rect: "10,12,340,58", content: ["resources", "morale", "population"] },
        { id: "mapCanvas", anchor: "center", rect: "0,0,360,800", content: ["map", "coordinateAnchors"] },
        { id: "leftToolRail", anchor: "left", rect: "10,94,58,256", content: ["build", "goals", "inventory", "council"] },
        { id: "mobileBottomSheet", anchor: "bottom", rect: "16,578,328,122", content: ["selectedBuilding", "constructionState"] },
        { id: "bottomNav", anchor: "bottom", rect: "14,710,332,70", content: ["build", "research", "world", "shop"] },
      ],
    },
    surfaces: ["settlement-panel.png"],
  },
};

const AUX_SPECS = {
  hub: {
    label: "Game Hub",
    title: "Hub",
    short: "HUB",
    palette: {
      bg: "#f4ebe8",
      bg2: "#dcead6",
      panel: "#fff1e8",
      panel2: "#e4c777",
      ink: "#263044",
      lightInk: "#fffaf0",
      accent: "#7bbf8a",
      accent2: "#d8a85c",
      danger: "#cf6873",
      play: "#dfead0",
    },
  },
  farmLegacy: {
    label: "Farm Legacy",
    title: "Farm",
    short: "FRM",
    palette: {
      bg: "#1d2d12",
      bg2: "#5c6c2c",
      panel: "#e4c784",
      panel2: "#74552a",
      ink: "#2a1c0d",
      lightInk: "#fff0c8",
      accent: "#8fc46e",
      accent2: "#efbd5b",
      danger: "#c7664c",
      play: "#7e9c4a",
    },
  },
};

const ASSET_KINDS = [
  { id: "hud-panel", width: 512, height: 256 },
  { id: "dialog-panel", width: 512, height: 768 },
  { id: "dock-panel", width: 512, height: 144 },
  { id: "screen-panel", width: 512, height: 512 },
  { id: "primary-button", width: 256, height: 96 },
  { id: "metric-chip", width: 220, height: 86 },
  { id: "icon-badge", width: 112, height: 112 },
  { id: "tool-slot", width: 128, height: 128 },
];

const SEMANTIC_ICON_SIZE = 96;
const SEMANTIC_ICON_SOURCES = {
  garden: [
    ["stat-gold", "public/games/garden-shelf/icon_collect.png"],
    ["stat-level-xp", "public/games/garden-shelf/icon_plant.png"],
    ["stat-quest", "public/games/garden-shelf/icon_quest.png"],
  ],
  blox: [
    ["stat-score", "public/games/blox/icon_score.png"],
    ["stat-lines", "public/games/blox/icon_lines.png"],
    ["stat-reward", "public/games/blox/icon_reward.png"],
    ["action-pause", "public/games/bubbo-bubbo/images/icon-pause.png"],
  ],
  match3: [
    ["stat-score", "public/games/puzzling-potions/images/drop-gold.png"],
    ["stat-moves", "public/games/puzzling-potions/images/moves-badge.png"],
    ["stat-combo", "public/games/puzzling-potions/images/combo-badge.png"],
    ["stat-reward", "public/games/puzzling-potions/images/reward-badge.png"],
    ["action-mix", "public/games/puzzling-potions/images/special-colour.png"],
    ["action-pause", "public/games/bubbo-bubbo/images/icon-pause.png"],
  ],
  merge: [
    ["stat-essence", "public/games/gacha-merge/ui/hudIconEssence.png"],
    ["stat-free-taps", "public/games/gacha-merge/ui/actionIconFreeTaps.png"],
    ["stat-fuel", "public/games/gacha-merge/ui/actionIconFuel.png"],
  ],
  bubbo: [
    ["stat-score", "public/games/bubbo-bubbo/fx/score-pop.png"],
    ["stat-shots", "public/games/bubbo-bubbo/images/cannon-arrow.png"],
    ["stat-pressure", "public/games/bubbo-bubbo/images/pressure-row-accent.png"],
    ["stat-reward", "public/games/bubbo-bubbo/images/bubble-glow.png"],
    ["action-swap", "public/games/bubbo-bubbo/images/bubble-reserve-ring.png"],
    ["action-pause", "public/games/bubbo-bubbo/images/icon-pause.png"],
  ],
  trivia: [
    ["stat-score", "public/games/trivia/icon-score.png"],
    ["stat-streak", "public/games/trivia/icon-streak.png"],
    ["stat-time", "public/games/trivia/icon-time.png"],
    ["action-fifty", "public/games/trivia/icon-ready.png"],
    ["action-reveal", "public/games/trivia/icon-category.png"],
  ],
  room: [
    ["dock-food", "public/games/companion-yard/foods/kibble.png"],
    ["dock-goodies", "public/games/companion-yard/goodies/yarn_mouse.png"],
    ["dock-shop", "public/games/companion-yard/ui/gift_box.png"],
    ["dock-petbook", "public/games/companion-yard/ui/daily_letter.png"],
    ["dock-album", "public/games/companion-yard/ui/photo_frame.png"],
    ["dock-gifts", "public/games/companion-yard/ui/gift_ready.png"],
    ["action-daily", "public/games/companion-yard/ui/stamp.png"],
    ["action-close", "public/games/gacha-merge/ui/actionIconClose.png"],
  ],
  settlement: [
    ["stat-gold", "public/games/settlement/icon-resource-gold.webp"],
    ["stat-food", "public/games/settlement/icon-resource-food.webp"],
    ["stat-wood", "public/games/settlement/icon-resource-wood.webp"],
    ["stat-stone", "public/games/settlement/icon-resource-stone.webp"],
  ],
};

const CHROMA_KEYS_BY_SPEC = {
  garden: MAGENTA_CHROMA_KEY,
  blox: DEFAULT_CHROMA_KEY,
  match3: DEFAULT_CHROMA_KEY,
  merge: MAGENTA_CHROMA_KEY,
  bubbo: DEFAULT_CHROMA_KEY,
  trivia: DEFAULT_CHROMA_KEY,
  room: MAGENTA_CHROMA_KEY,
  settlement: MAGENTA_CHROMA_KEY,
  hub: MAGENTA_CHROMA_KEY,
  farmLegacy: MAGENTA_CHROMA_KEY,
};

function ensureSpecOrder() {
  for (const gameId of VISIBLE_GAME_IDS) {
    if (!GAME_SPECS[gameId]) {
      throw new Error(`Missing HUD redesign spec for visible game: ${gameId}`);
    }
  }
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function sourceAssetPathFor(sourceId, kind) {
  return path.join(assetSourceRoot, sourceId, `${kind}.source.chromakey.png`);
}

function chromaKeyFor(sourceId) {
  return CHROMA_KEYS_BY_SPEC[sourceId] || DEFAULT_CHROMA_KEY;
}

function semanticIconSourcePath(gameId, iconId, extension = "png") {
  return path.join(sourceRoot, "semantic-icons", gameId, `${iconId}.source.${extension}`);
}

function colorDistance(r, g, b, key) {
  return Math.sqrt(((r - key.r) ** 2) + ((g - key.g) ** 2) + ((b - key.b) ** 2));
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clearPixel(output, index) {
  output[index] = 0;
  output[index + 1] = 0;
  output[index + 2] = 0;
  output[index + 3] = 0;
}

function despillKeyBlend(output, index, key, coverage) {
  const safeCoverage = Math.max(0.045, Math.min(1, coverage));
  output[index] = clampByte((output[index] - (key.r * (1 - safeCoverage))) / safeCoverage);
  output[index + 1] = clampByte((output[index + 1] - (key.g * (1 - safeCoverage))) / safeCoverage);
  output[index + 2] = clampByte((output[index + 2] - (key.b * (1 - safeCoverage))) / safeCoverage);
}

function averageBorderKey(data, info, fallback) {
  const samples = [
    [0, 0],
    [info.width - 1, 0],
    [0, info.height - 1],
    [info.width - 1, info.height - 1],
    [Math.floor(info.width / 2), 0],
    [Math.floor(info.width / 2), info.height - 1],
    [0, Math.floor(info.height / 2)],
    [info.width - 1, Math.floor(info.height / 2)],
  ];
  const closeSamples = [];
  for (const [x, y] of samples) {
    const index = (y * info.width + x) * 4;
    const sample = { r: data[index], g: data[index + 1], b: data[index + 2] };
    if (colorDistance(sample.r, sample.g, sample.b, fallback) < 120) closeSamples.push(sample);
  }
  const usable = closeSamples.length >= 3 ? closeSamples : samples.map(([x, y]) => {
    const index = (y * info.width + x) * 4;
    return { r: data[index], g: data[index + 1], b: data[index + 2] };
  });
  return usable.reduce(
    (acc, sample) => ({
      r: acc.r + (sample.r / usable.length),
      g: acc.g + (sample.g / usable.length),
      b: acc.b + (sample.b / usable.length),
    }),
    { r: 0, g: 0, b: 0 },
  );
}

function keyOutBackground(data, info, fallbackKey) {
  const detectedKey = averageBorderKey(data, info, fallbackKey);
  const output = Buffer.from(data);
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  let visiblePixels = 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * 4;
      const dist = colorDistance(output[index], output[index + 1], output[index + 2], detectedKey);
      const originalAlpha = output[index + 3];
      let alpha = originalAlpha;
      if (dist <= 38) {
        alpha = 0;
      } else if (dist < 118) {
        alpha = Math.round(originalAlpha * ((dist - 38) / 80));
      }
      if (alpha <= 2) {
        clearPixel(output, index);
        alpha = 0;
      } else if (alpha < originalAlpha && dist < 118) {
        despillKeyBlend(output, index, detectedKey, alpha / Math.max(1, originalAlpha));
        output[index + 3] = alpha;
      } else {
        output[index + 3] = alpha;
      }
      if (alpha > 30) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        visiblePixels += 1;
      }
    }
  }

  if (visiblePixels < 256 || maxX < minX || maxY < minY) {
    throw new Error("Imagegen asset cell did not contain enough visible non-key pixels after chromakey removal.");
  }

  const pad = 8;
  return {
    data: output,
    bounds: {
      left: Math.max(0, minX - pad),
      top: Math.max(0, minY - pad),
      width: Math.min(info.width - Math.max(0, minX - pad), (maxX - minX) + (pad * 2) + 1),
      height: Math.min(info.height - Math.max(0, minY - pad), (maxY - minY) + (pad * 2) + 1),
    },
    visiblePixels,
  };
}

async function stripRuntimeKeyPixels(inputBuffer, outputPath, key) {
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const output = Buffer.from(data);
  for (let index = 0; index < output.length; index += 4) {
    const dist = colorDistance(output[index], output[index + 1], output[index + 2], key);
    const alpha = output[index + 3];
    if (alpha <= 2 || dist <= 28 || (alpha <= 18 && dist <= 90)) {
      clearPixel(output, index);
    } else if (alpha < 255 && dist <= 96) {
      despillKeyBlend(output, index, key, alpha / 255);
      if (colorDistance(output[index], output[index + 1], output[index + 2], key) <= 80) {
        clearPixel(output, index);
      }
    }
  }
  await sharp(output, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

async function renderAssetFromSourceAsset(sourceId, kind, targetWidth, targetHeight, outputPath, { chromakey }) {
  const sourcePath = sourceAssetPathFor(sourceId, kind);
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing standalone imagegen source asset for ${sourceId}.${kind}: ${sourcePath}`);
  }

  const metadata = await sharp(sourcePath).metadata();
  if ((metadata.width || 0) < targetWidth || (metadata.height || 0) < targetHeight) {
    throw new Error(`${sourceId}.${kind} source asset is below target resolution: ${metadata.width}x${metadata.height}, target ${targetWidth}x${targetHeight}`);
  }

  const fallbackKey = hexToRgb(chromaKeyFor(sourceId));
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const keyed = keyOutBackground(data, info, fallbackKey);
  const cropped = await sharp(keyed.data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(keyed.bounds)
    .png()
    .toBuffer();
  const inset = kind === "dialog-panel" || kind === "screen-panel" ? 18 : 10;
  const fitted = await sharp(cropped)
    .resize(Math.max(1, targetWidth - (inset * 2)), Math.max(1, targetHeight - (inset * 2)), {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();
  const background = chromakey
    ? { ...fallbackKey, alpha: 1 }
    : { r: 0, g: 0, b: 0, alpha: 0 };

  const finalBuffer = await sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
      channels: 4,
      background,
    },
  })
    .composite([{ input: fitted, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  if (chromakey) {
    await sharp(finalBuffer).png({ compressionLevel: 9 }).toFile(outputPath);
  } else {
    await stripRuntimeKeyPixels(finalBuffer, outputPath, fallbackKey);
  }
}

async function writeAssetSet(gameId, spec) {
  const dir = path.join(assetRoot, gameId);
  const runtimeDir = path.join(publicRuntimeRoot, gameId);
  await mkdir(dir, { recursive: true });
  await mkdir(runtimeDir, { recursive: true });

  const assets = [];
  for (const kind of ASSET_KINDS) {
    const chromaPath = path.join(dir, `${kind.id}.chromakey.png`);
    const runtimePath = path.join(runtimeDir, `${kind.id}.png`);
    await renderAssetFromSourceAsset(gameId, kind.id, kind.width, kind.height, chromaPath, { chromakey: true });
    await renderAssetFromSourceAsset(gameId, kind.id, kind.width, kind.height, runtimePath, { chromakey: false });
    assets.push({
      id: kind.id,
      source: "imagegen-source-art-data-free",
      dataFree: true,
      sourcePath: path.relative(root, sourceAssetPathFor(gameId, kind.id)).replaceAll(path.sep, "/"),
      path: path.relative(root, chromaPath).replaceAll(path.sep, "/"),
      runtimePath: path.relative(root, runtimePath).replaceAll(path.sep, "/"),
      width: kind.width,
      height: kind.height,
      chromaKey: chromaKeyFor(gameId),
    });
  }
  return assets;
}

async function writeSemanticIcons(gameId) {
  const icons = SEMANTIC_ICON_SOURCES[gameId] || [];
  const sourceDir = path.join(sourceRoot, "semantic-icons", gameId);
  const runtimeDir = path.join(publicRuntimeRoot, gameId, "semantic-icons");
  await mkdir(sourceDir, { recursive: true });
  await mkdir(runtimeDir, { recursive: true });

  const outputs = [];
  for (const [iconId, relativeSourcePath] of icons) {
    const absoluteSourcePath = path.join(root, relativeSourcePath);
    if (!existsSync(absoluteSourcePath)) {
      throw new Error(`Missing production source art for ${gameId}.${iconId}: ${absoluteSourcePath}`);
    }
    const sourceExtension = path.extname(relativeSourcePath).replace(/^\./, "") || "png";
    const sourceCopyPath = semanticIconSourcePath(gameId, iconId, sourceExtension);
    await copyFile(absoluteSourcePath, sourceCopyPath);

    const runtimePath = path.join(runtimeDir, `${iconId}.png`);
    await sharp(absoluteSourcePath)
      .ensureAlpha()
      .resize(SEMANTIC_ICON_SIZE, SEMANTIC_ICON_SIZE, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: sharp.kernel.lanczos3,
      })
      .png({ compressionLevel: 9 })
      .toFile(runtimePath);

    outputs.push({
      id: iconId,
      source: "production-source-art-data-free",
      dataFree: true,
      sourcePath: path.relative(root, sourceCopyPath).replaceAll(path.sep, "/"),
      originalSourcePath: relativeSourcePath,
      runtimePath: path.relative(root, runtimePath).replaceAll(path.sep, "/"),
      width: SEMANTIC_ICON_SIZE,
      height: SEMANTIC_ICON_SIZE,
    });
  }
  return outputs;
}

async function writePublicSurface(fileName, sourceId, kind) {
  const config = kind === "dialog-panel"
    ? { width: 512, height: 768, id: "dialog-panel" }
    : { width: 512, height: 512, id: "screen-panel" };
  const outputPath = path.join(publicSurfaceRoot, fileName);
  await renderAssetFromSourceAsset(sourceId, config.id, config.width, config.height, outputPath, { chromakey: false });
  return {
    name: fileName.replace(/\.png$/, ""),
    file: fileName,
    width: config.width,
    height: config.height,
    source: "imagegen-source-art-data-free",
    sourcePath: path.relative(root, sourceAssetPathFor(sourceId, config.id)).replaceAll(path.sep, "/"),
  };
}

async function writeReference(gameId, spec) {
  const outputPath = path.join(referenceRoot, `${gameId}-hud-reference.png`);
  if (!existsSync(outputPath)) {
    throw new Error(`Missing production AI reference for ${gameId}: ${outputPath}`);
  }
  const metadata = await sharp(outputPath).metadata();
  if ((metadata.height || 0) <= (metadata.width || 0)) {
    throw new Error(`${gameId} production reference must be portrait, got ${metadata.width}x${metadata.height}`);
  }
  return {
    path: path.relative(root, outputPath).replaceAll(path.sep, "/"),
    width: metadata.width,
    height: metadata.height,
  };
}

async function writeLayoutBoard(gameEntries) {
  const cellW = 360;
  const cellH = 800;
  const gap = 24;
  const cols = 4;
  const rows = 2;
  const width = cols * cellW + (cols + 1) * gap;
  const height = rows * cellH + (rows + 1) * gap;
  const composites = [];

  for (let index = 0; index < gameEntries.length; index += 1) {
    const entry = gameEntries[index];
    const image = await sharp(path.join(root, entry.reference.path)).png().toBuffer();
    composites.push({
      input: image,
      left: gap + (index % cols) * (cellW + gap),
      top: gap + Math.floor(index / cols) * (cellH + gap),
    });
  }

  const outputPath = path.join(referenceRoot, "reference-board-layout.png");
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: "#11151d",
    },
  }).composite(composites).png({ compressionLevel: 9 }).toFile(outputPath);
  return path.relative(root, outputPath).replaceAll(path.sep, "/");
}

async function copyAiReferenceIfRequested() {
  const argPrefix = "--ai-reference=";
  const arg = process.argv.find((value) => value.startsWith(argPrefix));
  const target = path.join(referenceRoot, "reference-board-ai.png");
  if (!arg) {
    return existsSync(target) ? path.relative(root, target).replaceAll(path.sep, "/") : null;
  }
  const source = path.resolve(arg.slice(argPrefix.length));
  if (!existsSync(source)) throw new Error(`AI reference board not found: ${source}`);
  await copyFile(source, target);
  return path.relative(root, target).replaceAll(path.sep, "/");
}

async function writeSurfaceManifests(panelOutputs, dialogOutputs) {
  await writeFile(
    path.join(publicSurfaceRoot, "screen-surface-extract-manifest.json"),
    `${JSON.stringify({
      source: "assets-source/imagegen/hud-redesign",
      generatedBy: "scripts/generate-hud-redesign-pack.mjs",
      outputs: panelOutputs,
    }, null, 2)}\n`,
  );
  await writeFile(
    path.join(publicSurfaceRoot, "portrait-panel-extract-manifest.json"),
    `${JSON.stringify({
      source: "assets-source/imagegen/hud-redesign",
      generatedBy: "scripts/generate-hud-redesign-pack.mjs",
      outputs: dialogOutputs,
    }, null, 2)}\n`,
  );
}

async function main() {
  ensureSpecOrder();
  await mkdir(referenceRoot, { recursive: true });
  await mkdir(assetSourceRoot, { recursive: true });
  await mkdir(assetRoot, { recursive: true });
  await mkdir(publicSurfaceRoot, { recursive: true });
  await mkdir(publicRuntimeRoot, { recursive: true });
  await rm(path.join(referenceRoot, "reference-board-layout.png"), { force: true });

  const aiReferenceBoard = await copyAiReferenceIfRequested();
  const games = {};
  const entries = [];

  for (const gameId of VISIBLE_GAME_IDS) {
    const spec = GAME_SPECS[gameId];
    const reference = await writeReference(gameId, spec);
    const assets = await writeAssetSet(gameId, spec);
    const semanticIcons = await writeSemanticIcons(gameId);
    const entry = {
      id: gameId,
      label: spec.label,
      registry: GAME_REGISTRY[gameId],
      metrics: spec.metrics,
      layout: spec.layout,
      reference,
      assets,
      semanticIcons,
    };
    games[gameId] = entry;
    entries.push(entry);
  }

  const panelOutputs = [];
  const dialogOutputs = [];
  const publicJobs = [
    ["hub-panel.png", "hub", "panel"],
    ["garden-panel.png", "garden", "panel"],
    ["blox-panel.png", "blox", "panel"],
    ["match3-panel.png", "match3", "panel"],
    ["merge-panel.png", "merge", "panel"],
    ["bubbo-panel.png", "bubbo", "panel"],
    ["trivia-panel.png", "trivia", "panel"],
    ["yard-panel.png", "room", "panel"],
    ["farm-panel.png", "farmLegacy", "panel"],
    ["garden-dialog-panel.png", "garden", "dialog-panel"],
    ["blox-dialog-panel.png", "blox", "dialog-panel"],
    ["match3-dialog-panel.png", "match3", "dialog-panel"],
    ["merge-dialog-panel.png", "merge", "dialog-panel"],
    ["bubbo-dialog-panel.png", "bubbo", "dialog-panel"],
    ["trivia-dialog-panel.png", "trivia", "dialog-panel"],
  ];

  for (const [fileName, sourceId, kind] of publicJobs) {
    const output = await writePublicSurface(fileName, sourceId, kind);
    if (kind === "dialog-panel") dialogOutputs.push(output);
    else panelOutputs.push(output);
  }

  await writeSurfaceManifests(panelOutputs, dialogOutputs);

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/generate-hud-redesign-pack.mjs",
    chromaKeyPolicy: {
      allowedKeys: [DEFAULT_CHROMA_KEY, MAGENTA_CHROMA_KEY],
      rule: "Each standalone chromakey source asset uses a flat key color selected so the key does not appear in that asset. Runtime PNGs are transparent.",
    },
    assetProduction: {
      source: "imagegen-source-art-data-free",
      rule: "HUD runtime assets are extracted from individual production-quality imagegen source files, one source file per asset. They are not atlas/sheet crops, not crops from screenshot references, and not programmatic SVG/vector/placeholder drawings. They must not bake numbers, labels, semantic state icons, filled progress bars, or gameplay state into the art.",
    },
    references: {
      aiReferenceBoard,
    },
    games,
    hiddenLegacy: {
      farm: {
        visible: GAME_REGISTRY.farm.visible,
        reason: "Farm remains hidden legacy in the registry; a new panel surface is kept for compatibility only.",
      },
    },
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[hud-redesign] generated ${entries.length} visible game references and ${entries.length * ASSET_KINDS.length} chromakey assets`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
