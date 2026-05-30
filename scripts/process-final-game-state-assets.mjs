import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const RAW_ROOT = path.join(ROOT, "assets-source", "imagegen");
const STATUS_PATH = path.join(RAW_ROOT, "final-game-state-asset-status.json");

function source(...parts) {
  return path.join(RAW_ROOT, ...parts);
}

function publicTarget(relativePath) {
  return path.join(ROOT, "public", "games", ...relativePath.split("/"));
}

function asPosix(relativePath) {
  return relativePath.replace(/\\/g, "/");
}

function cellName(relativePath) {
  return `public/games/${asPosix(relativePath)}`;
}

const singleObjectSheetOutputs = new Set([
  "garden-shelf/button_primary.png",
  "garden-shelf/button_secondary.png",
  "garden-shelf/button_danger.png",
]);

function isChromaLike(r, g, b, a) {
  if (a <= 8) return true;
  return (
    (r >= 170 && b >= 165 && g <= 100 && Math.abs(r - b) <= 92 && r - g >= 70 && b - g >= 65)
    || isSoftChromakeySpill(r, g, b, a)
  );
}

function isStrictChromakey(r, g, b, a) {
  return a > 8 && r >= 248 && g <= 10 && b >= 248;
}

function isResidualChromakey(r, g, b, a) {
  if (a <= 8) return false;
  return (
    (r >= 210 && b >= 195 && g <= 90 && Math.abs(r - b) <= 80 && r - g >= 120 && b - g >= 110)
    || isSoftChromakeySpill(r, g, b, a)
  );
}

function isSoftChromakeySpill(r, g, b, a) {
  if (a <= 8) return false;
  return r >= 120 && b >= 115 && g <= 100 && Math.abs(r - b) <= 112 && r - g >= 64 && b - g >= 58;
}

function removeChromakey(data, width, height) {
  const pixels = width * height;
  const keyed = new Uint8Array(pixels);
  const queue = [];
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (keyed[index]) return;
    const offset = index * 4;
    if (!isChromaLike(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])) return;
    keyed[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % width;
    const y = Math.floor(index / width);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  let removed = 0;
  let strictRemoved = 0;
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    if (
      keyed[index]
      || isStrictChromakey(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])
      || isResidualChromakey(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])
    ) {
      if (!keyed[index]) strictRemoved += 1;
      data[offset + 3] = 0;
      removed += 1;
    }
  }

  return { removed, strictRemoved };
}

async function writePngFromRaw(data, width, height, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
}

async function walkPngFiles(directory) {
  let items;
  try {
    items = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const item of items) {
    const child = path.join(directory, item.name);
    if (item.isDirectory()) {
      files.push(...await walkPngFiles(child));
    } else if (item.name.toLowerCase().endsWith(".png")) {
      files.push(child);
    }
  }
  return files.sort();
}

async function scrubStrictChromakey(filePath) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);
  let scrubbed = 0;
  for (let index = 0; index < info.width * info.height; index += 1) {
    const offset = index * 4;
    const alpha = pixels[offset + 3];
    if (!isStrictChromakey(pixels[offset], pixels[offset + 1], pixels[offset + 2], alpha)) continue;
    pixels[offset + 3] = 0;
    scrubbed += 1;
  }
  if (scrubbed) {
    await writePngFromRaw(pixels, info.width, info.height, filePath);
  }
  return scrubbed;
}

async function writeKeyedAsset(inputPath, relativeOutput) {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);
  const chroma = removeChromakey(pixels, info.width, info.height);
  const outputPath = publicTarget(relativeOutput);
  await writePngFromRaw(pixels, info.width, info.height, outputPath);
  return {
    source: asPosix(path.relative(ROOT, inputPath)),
    output: cellName(relativeOutput),
    width: info.width,
    height: info.height,
    chromaRemoved: chroma.removed,
    strictChromaRemoved: chroma.strictRemoved,
  };
}

function findAlphaComponents(data, width, height, threshold = 8) {
  const seen = new Uint8Array(width * height);
  const components = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (seen[start]) continue;
      seen[start] = 1;
      if (data[start * 4 + 3] <= threshold) continue;

      const componentIndex = components.length;
      const component = {
        index: componentIndex,
        pixels: [],
        minX: x,
        minY: y,
        maxX: x,
        maxY: y,
        sumX: 0,
        sumY: 0,
      };
      const stack = [start];

      while (stack.length) {
        const index = stack.pop();
        const px = index % width;
        const py = Math.floor(index / width);
        component.pixels.push(index);
        component.minX = Math.min(component.minX, px);
        component.minY = Math.min(component.minY, py);
        component.maxX = Math.max(component.maxX, px);
        component.maxY = Math.max(component.maxY, py);
        component.sumX += px;
        component.sumY += py;

        for (const next of [index + 1, index - 1, index + width, index - width]) {
          if (next < 0 || next >= width * height || seen[next]) continue;
          const nx = next % width;
          const ny = Math.floor(next / width);
          if (Math.abs(nx - px) + Math.abs(ny - py) !== 1) continue;
          seen[next] = 1;
          if (data[next * 4 + 3] > threshold) stack.push(next);
        }
      }

      component.count = component.pixels.length;
      component.centerX = component.sumX / component.count;
      component.centerY = component.sumY / component.count;
      if (component.count > 3) components.push(component);
    }
  }

  return components;
}

function nearestGridIndex(component, cols, rows, width, height) {
  const cellW = width / cols;
  const cellH = height / rows;
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const centerX = (col + 0.5) * cellW;
      const centerY = (row + 0.5) * cellH;
      const dx = (component.centerX - centerX) / cellW;
      const dy = (component.centerY - centerY) / cellH;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = row * cols + col;
      }
    }
  }
  return bestIndex;
}

async function writeGridSheet({ input, cols, rows, outputs }) {
  const inputPath = source(...input);
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const sheetPixels = Buffer.from(data);
  const chroma = removeChromakey(sheetPixels, info.width, info.height);
  const components = findAlphaComponents(sheetPixels, info.width, info.height);
  const componentsByCell = new Map();
  for (const component of components) {
    const index = nearestGridIndex(component, cols, rows, info.width, info.height);
    if (!componentsByCell.has(index)) componentsByCell.set(index, []);
    componentsByCell.get(index).push(component);
  }

  const written = [];
  const skipped = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      const relativeOutput = outputs[index];
      if (!relativeOutput) {
        skipped.push({ sheet: asPosix(path.relative(ROOT, inputPath)), row, col });
        continue;
      }

      let cellComponents = componentsByCell.get(index) || [];
      if (singleObjectSheetOutputs.has(relativeOutput) && cellComponents.length > 1) {
        cellComponents = [cellComponents.reduce((largest, component) => (
          component.count > largest.count ? component : largest
        ), cellComponents[0])];
      }
      const cellW = info.width / cols;
      const cellH = info.height / rows;
      const fallbackLeft = Math.round(col * cellW);
      const fallbackTop = Math.round(row * cellH);
      const fallbackRight = Math.round((col + 1) * cellW) - 1;
      const fallbackBottom = Math.round((row + 1) * cellH) - 1;
      const padding = Math.max(8, Math.round(Math.min(cellW, cellH) * 0.035));

      let minX = fallbackLeft;
      let minY = fallbackTop;
      let maxX = fallbackRight;
      let maxY = fallbackBottom;
      if (cellComponents.length) {
        minX = Math.min(...cellComponents.map((component) => component.minX));
        minY = Math.min(...cellComponents.map((component) => component.minY));
        maxX = Math.max(...cellComponents.map((component) => component.maxX));
        maxY = Math.max(...cellComponents.map((component) => component.maxY));
      }

      const left = Math.max(0, minX - padding);
      const top = Math.max(0, minY - padding);
      const right = Math.min(info.width - 1, maxX + padding);
      const bottom = Math.min(info.height - 1, maxY + padding);
      const width = right - left + 1;
      const height = bottom - top + 1;
      const pixels = Buffer.alloc(width * height * 4);

      for (const component of cellComponents) {
        for (const sourceIndex of component.pixels) {
          const sx = sourceIndex % info.width;
          const sy = Math.floor(sourceIndex / info.width);
          if (sx < left || sy < top || sx > right || sy > bottom) continue;
          const sourceOffset = sourceIndex * 4;
          const targetOffset = ((sy - top) * width + (sx - left)) * 4;
          pixels[targetOffset] = sheetPixels[sourceOffset];
          pixels[targetOffset + 1] = sheetPixels[sourceOffset + 1];
          pixels[targetOffset + 2] = sheetPixels[sourceOffset + 2];
          pixels[targetOffset + 3] = sheetPixels[sourceOffset + 3];
        }
      }

      const outputPath = publicTarget(relativeOutput);
      await writePngFromRaw(pixels, width, height, outputPath);
      written.push({
        source: asPosix(path.relative(ROOT, inputPath)),
        cell: { row, col },
        output: cellName(relativeOutput),
        width,
        height,
        chromaRemoved: chroma.removed,
        strictChromaRemoved: chroma.strictRemoved,
      });
    }
  }

  return { written, skipped };
}

async function writeCopiedImage(input, relativeOutput) {
  const inputPath = source(...input);
  const outputPath = publicTarget(relativeOutput);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const image = sharp(inputPath).ensureAlpha();
  const metadata = await image.metadata();
  await image.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(outputPath);
  return {
    source: asPosix(path.relative(ROOT, inputPath)),
    output: cellName(relativeOutput),
    width: metadata.width,
    height: metadata.height,
    chromaRemoved: 0,
    strictChromaRemoved: 0,
  };
}

async function scanChromakeyLeaks(filePath, includeResidual = true) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let exact = 0;
  let strict = 0;
  let opaque = 0;
  for (let index = 0; index < info.width * info.height; index += 1) {
    const offset = index * 4;
    const a = data[offset + 3];
    if (a <= 8) continue;
    opaque += 1;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    if (r === 255 && g === 0 && b === 255) exact += 1;
    if (isStrictChromakey(r, g, b, a) || (includeResidual && isResidualChromakey(r, g, b, a))) strict += 1;
  }
  return { exact, strict, opaque };
}

const sheets = [
  {
    input: ["blox", "raw", "block-tiles-3x3.png"],
    cols: 3,
    rows: 3,
    outputs: [
      "blox/block_tile_blue.png",
      "blox/block_tile_green.png",
      "blox/block_tile_orange.png",
      "blox/block_tile_yellow.png",
      "blox/block_tile_purple.png",
      "blox/block_tile_red.png",
      "blox/block_tile_cyan.png",
      "blox/block_tile_pink.png",
      "blox/block_tile_gray.png",
    ],
  },
  {
    input: ["blox", "raw", "cells-3x3.png"],
    cols: 3,
    rows: 3,
    outputs: [
      "blox/cell_empty.png",
      "blox/cell_valid.png",
      "blox/cell_invalid.png",
      "blox/cell_selected.png",
      "blox/cell_clear_row.png",
      "blox/cell_clear_col.png",
      "blox/cell_pending.png",
      "blox/grid_shadow.png",
      "blox/tray_slot_empty.png",
    ],
  },
  {
    input: ["blox", "raw", "pieces-3x4.png"],
    cols: 3,
    rows: 4,
    outputs: [
      "blox/piece_dot.png",
      "blox/piece_h2.png",
      "blox/piece_v2.png",
      "blox/piece_l3.png",
      "blox/piece_l3r.png",
      "blox/piece_h3.png",
      "blox/piece_v3.png",
      "blox/piece_sq.png",
      "blox/piece_t4.png",
      "blox/piece_s4.png",
      "blox/piece_i4.png",
      "blox/piece_i5.png",
    ],
  },
  {
    input: ["blox", "raw", "panels-2x4.png"],
    cols: 4,
    rows: 2,
    outputs: [
      "blox/board_frame.png",
      "blox/tray_panel.png",
      "blox/tray_slot_selected.png",
      "blox/hud_bar.png",
      "blox/pause_panel.png",
      "blox/result_panel.png",
      "blox/button_primary.png",
      "blox/button_secondary.png",
    ],
  },
  {
    input: ["blox", "raw", "icons-2x3.png"],
    cols: 3,
    rows: 2,
    outputs: [
      "blox/icon_score.png",
      "blox/icon_lines.png",
      "blox/icon_reward.png",
      "blox/icon_restart.png",
      "blox/icon_settle.png",
      "blox/icon_exit.png",
    ],
  },
  {
    input: ["blox", "raw", "fx-2x4.png"],
    cols: 4,
    rows: 2,
    outputs: [
      "blox/fx/place_settle.png",
      "blox/fx/valid_glow.png",
      "blox/fx/invalid_pulse.png",
      "blox/fx/row_wipe.png",
      "blox/fx/column_wipe.png",
      "blox/fx/multi_clear_burst.png",
      "blox/fx/tray_refill.png",
      "blox/fx/reward_spark.png",
    ],
  },
  {
    input: ["garden-shelf", "raw", "support-5x5.png"],
    cols: 5,
    rows: 5,
    outputs: [
      "garden-shelf/shelf_slot_empty.png",
      "garden-shelf/shelf_slot_locked.png",
      "garden-shelf/shelf_unlock_glow.png",
      "garden-shelf/garden_shadow_soft.png",
      "garden-shelf/icon_plant.png",
      "garden-shelf/icon_water.png",
      "garden-shelf/icon_upgrade.png",
      "garden-shelf/icon_collect.png",
      "garden-shelf/icon_quest.png",
      "garden-shelf/icon_level_up.png",
      "garden-shelf/icon_offline.png",
      "garden-shelf/icon_language.png",
      "garden-shelf/icon_info.png",
      "garden-shelf/icon_close.png",
      null,
      "garden-shelf/detail_panel.png",
      "garden-shelf/quest_panel.png",
      "garden-shelf/level_reward_panel.png",
      "garden-shelf/offline_panel.png",
      "garden-shelf/button_primary.png",
      "garden-shelf/button_secondary.png",
      "garden-shelf/button_danger.png",
      "garden-shelf/fx/unlock-burst.png",
      "garden-shelf/fx/level-confetti.png",
      null,
    ],
  },
  {
    input: ["match3", "raw", "extras-4x5.png"],
    cols: 5,
    rows: 4,
    outputs: [
      null,
      null,
      "puzzling-potions/images/mode-card-classic.png",
      "puzzling-potions/images/mode-card-timed.png",
      "puzzling-potions/images/mode-card-drop.png",
      "puzzling-potions/images/timer-ring.png",
      "puzzling-potions/images/moves-badge.png",
      "puzzling-potions/images/combo-badge.png",
      "puzzling-potions/images/reward-badge.png",
      "puzzling-potions/images/button-primary.png",
      "puzzling-potions/images/button-secondary.png",
      "puzzling-potions/images/fx-swap-trail.png",
      "puzzling-potions/images/fx-invalid-swap.png",
      "puzzling-potions/images/fx-cascade-dust.png",
      "puzzling-potions/images/fx-row-clear.png",
      "puzzling-potions/images/fx-column-clear.png",
      "puzzling-potions/images/fx-blast-clear.png",
      "puzzling-potions/images/fx-colour-clear.png",
      "puzzling-potions/images/fx-drop-credit.png",
      "puzzling-potions/images/fx-combo-pop.png",
    ],
  },
  {
    input: ["match3", "raw", "cells-2x2.png"],
    cols: 2,
    rows: 2,
    outputs: [
      "puzzling-potions/images/cell-hint.png",
      "puzzling-potions/images/cell-invalid.png",
      null,
      null,
    ],
  },
  {
    input: ["gacha-merge", "raw", "extras-4x5.png"],
    cols: 5,
    rows: 4,
    outputs: [
      "gacha-merge/ui/cellInvalid.png",
      "gacha-merge/ui/cellTrashTarget.png",
      "gacha-merge/ui/itemShadow.png",
      "gacha-merge/fx/missPuff.png",
      "gacha-merge/fx/itemLiftGlow.png",
      "gacha-merge/fx/perfectReactionBurst.png",
      "gacha-merge/fx/discoveryBurst.png",
      "gacha-merge/ui/recipePanel.png",
      "gacha-merge/ui/itemPanel.png",
      "gacha-merge/ui/sourceChipFree.png",
      "gacha-merge/ui/sourceChipCrop.png",
      "gacha-merge/ui/sourceChipEmpty.png",
      "gacha-merge/ui/actionIconFreeTaps.png",
      "gacha-merge/ui/actionIconFuel.png",
      "gacha-merge/ui/actionIconClose.png",
      "gacha-merge/ui/actionIconBack.png",
      "gacha-merge/ui/exchangeIconTreats.png",
      "gacha-merge/ui/exchangeIconShinyTreat.png",
      "gacha-merge/ui/exchangeIconFuture.png",
      null,
    ],
  },
  {
    input: ["bubbo-bubbo", "raw", "bubbles-2x5.png"],
    cols: 5,
    rows: 2,
    outputs: [
      "bubbo-bubbo/images/bubble-mint.png",
      "bubbo-bubbo/images/bubble-amber.png",
      "bubbo-bubbo/images/bubble-coral.png",
      "bubbo-bubbo/images/bubble-sky.png",
      "bubbo-bubbo/images/bubble-berry.png",
      "bubbo-bubbo/images/bubble-shine.png",
      "bubbo-bubbo/images/bubble-shadow.png",
      "bubbo-bubbo/images/bubble-glow.png",
      "bubbo-bubbo/images/bubble-reserve-base.png",
      "bubbo-bubbo/images/bubble-reserve-ring.png",
    ],
  },
  {
    input: ["bubbo-bubbo", "raw", "field-cannon-4x4.png"],
    cols: 4,
    rows: 4,
    outputs: [
      "bubbo-bubbo/images/background-tile.png",
      "bubbo-bubbo/images/game-side-border.png",
      "bubbo-bubbo/images/top-tray.png",
      "bubbo-bubbo/images/danger-line.png",
      "bubbo-bubbo/images/pressure-row-accent.png",
      "bubbo-bubbo/images/field-mask.png",
      "bubbo-bubbo/images/cannon-main.png",
      "bubbo-bubbo/images/cannon-barrel.png",
      "bubbo-bubbo/images/cannon-top.png",
      "bubbo-bubbo/images/cannon-arrow.png",
      "bubbo-bubbo/images/bottom-tray.png",
      "bubbo-bubbo/images/laser-line.png",
      "bubbo-bubbo/images/laser-line-glow.png",
      "bubbo-bubbo/images/shot-visualiser.png",
      "bubbo-bubbo/images/wall-bank-spark.png",
      "bubbo-bubbo/images/info-bg.png",
    ],
  },
  {
    input: ["bubbo-bubbo", "raw", "ui-3x4.png"],
    cols: 4,
    rows: 3,
    outputs: [
      "bubbo-bubbo/images/pause-panel.png",
      "bubbo-bubbo/images/results-panel-base.png",
      "bubbo-bubbo/images/results-panel-points-total.png",
      "bubbo-bubbo/images/results-panel-points-breakdown.png",
      "bubbo-bubbo/images/button-flat.png",
      "bubbo-bubbo/images/button-flat-small.png",
      "bubbo-bubbo/images/icon-pause.png",
      "bubbo-bubbo/images/icon-back.png",
      "bubbo-bubbo/images/icon-sound-on.png",
      "bubbo-bubbo/images/icon-sound-off.png",
      null,
      null,
    ],
  },
  {
    input: ["bubbo-bubbo", "raw", "fx-2x5.png"],
    cols: 5,
    rows: 2,
    outputs: [
      "bubbo-bubbo/fx/pop-mint.png",
      "bubbo-bubbo/fx/pop-amber.png",
      "bubbo-bubbo/fx/pop-coral.png",
      "bubbo-bubbo/fx/pop-sky.png",
      "bubbo-bubbo/fx/pop-berry.png",
      "bubbo-bubbo/fx/island-drop.png",
      "bubbo-bubbo/fx/pressure-shift.png",
      "bubbo-bubbo/fx/sparse-refill.png",
      "bubbo-bubbo/fx/score-pop.png",
      "bubbo-bubbo/fx/timed-finish.png",
    ],
  },
  {
    input: ["brain-blitz", "raw", "panels-buttons-4x4.png"],
    cols: 4,
    rows: 4,
    outputs: [
      "trivia/panel-menu.png",
      "trivia/panel-question.png",
      "trivia/panel-duel-room.png",
      "trivia/panel-results.png",
      "trivia/panel-history.png",
      "trivia/timer-ring-empty.png",
      "trivia/timer-urgent-glow.png",
      "trivia/answer-default.png",
      "trivia/answer-hover-focus.png",
      "trivia/answer-selected.png",
      "trivia/answer-correct.png",
      "trivia/answer-incorrect.png",
      "trivia/answer-disabled.png",
      "trivia/button-primary.png",
      "trivia/button-secondary.png",
      "trivia/button-danger.png",
    ],
  },
  {
    input: ["brain-blitz", "raw", "icons-5x5.png"],
    cols: 5,
    rows: 5,
    outputs: [
      "trivia/icon-solo.png",
      "trivia/icon-duel.png",
      "trivia/icon-ready.png",
      "trivia/icon-refresh.png",
      "trivia/icon-category.png",
      "trivia/icon-difficulty.png",
      "trivia/icon-streak.png",
      "trivia/icon-score.png",
      "trivia/icon-time.png",
      "trivia/badge-easy.png",
      "trivia/badge-medium.png",
      "trivia/badge-hard.png",
      "trivia/badge-all.png",
      "trivia/badge-winner.png",
      "trivia/badge-loser.png",
      "trivia/trophy-result.png",
      "trivia/duel-ticket.png",
      "trivia/category-general.png",
      "trivia/category-science.png",
      "trivia/category-history.png",
      "trivia/category-games.png",
      "trivia/category-nature.png",
      "trivia/category-culture.png",
      "trivia/fx-correct-pop.png",
      "trivia/fx-incorrect-shake.png",
    ],
  },
  {
    input: ["brain-blitz", "raw", "fx-2x2.png"],
    cols: 2,
    rows: 2,
    outputs: [
      "trivia/fx-streak-flare.png",
      "trivia/fx-time-warning.png",
      "trivia/fx-result-confetti.png",
      null,
    ],
  },
  {
    input: ["farm", "raw", "plots-3x4.png"],
    cols: 4,
    rows: 3,
    outputs: [
      "farm/plot-empty.png",
      "farm/plot-selected.png",
      "farm/plot-locked.png",
      "farm/plot-pending.png",
      "farm/plot-watered-overlay.png",
      "farm/plot-ready-overlay.png",
      "farm/plot-disabled-overlay.png",
      "farm/plot-theme-default.png",
      "farm/plot-theme-stone.png",
      "farm/plot-theme-flower.png",
      "farm/plot-theme-moon.png",
      "farm/plot-shadow.png",
    ],
  },
  {
    input: ["farm", "raw", "crops-berries-4x4.png"],
    cols: 4,
    rows: 4,
    outputs: [
      "farm/crops/strawberry_seed.png",
      "farm/crops/strawberry_sprout.png",
      "farm/crops/strawberry_growing.png",
      "farm/crops/strawberry_ready.png",
      "farm/crops/blueberry_seed.png",
      "farm/crops/blueberry_sprout.png",
      "farm/crops/blueberry_growing.png",
      "farm/crops/blueberry_ready.png",
      "farm/crops/tomato_seed.png",
      "farm/crops/tomato_sprout.png",
      "farm/crops/tomato_growing.png",
      "farm/crops/tomato_ready.png",
      "farm/crops/golden_rose_seed.png",
      "farm/crops/golden_rose_sprout.png",
      "farm/crops/golden_rose_growing.png",
      "farm/crops/golden_rose_ready.png",
    ],
  },
  {
    input: ["farm", "raw", "crops-field-4x4.png"],
    cols: 4,
    rows: 4,
    outputs: [
      "farm/crops/corn_seed.png",
      "farm/crops/corn_sprout.png",
      "farm/crops/corn_growing.png",
      "farm/crops/corn_ready.png",
      "farm/crops/sunflower_seed.png",
      "farm/crops/sunflower_sprout.png",
      "farm/crops/sunflower_growing.png",
      "farm/crops/sunflower_ready.png",
      "farm/crops/watermelon_seed.png",
      "farm/crops/watermelon_sprout.png",
      "farm/crops/watermelon_growing.png",
      "farm/crops/watermelon_ready.png",
      "farm/crops/pumpkin_seed.png",
      "farm/crops/pumpkin_sprout.png",
      "farm/crops/pumpkin_growing.png",
      "farm/crops/pumpkin_ready.png",
    ],
  },
  {
    input: ["farm", "raw", "inventory-4x5.png"],
    cols: 5,
    rows: 4,
    outputs: [
      "farm/seeds/strawberry_packet.png",
      "farm/seeds/blueberry_packet.png",
      "farm/seeds/tomato_packet.png",
      "farm/seeds/golden_rose_packet.png",
      "farm/seeds/corn_packet.png",
      "farm/seeds/sunflower_packet.png",
      "farm/seeds/watermelon_packet.png",
      "farm/seeds/pumpkin_packet.png",
      "farm/harvest/strawberry.png",
      "farm/harvest/blueberry.png",
      "farm/harvest/tomato.png",
      "farm/harvest/golden_rose.png",
      "farm/harvest/corn.png",
      "farm/harvest/sunflower.png",
      "farm/harvest/watermelon.png",
      "farm/harvest/pumpkin.png",
      "farm/boosters/watering_can.png",
      "farm/boosters/fertilizer.png",
      "farm/boosters/time_charm.png",
      "farm/ui/empty_slot_placeholder.png",
    ],
  },
  {
    input: ["farm", "raw", "ui-fx-5x5.png"],
    cols: 5,
    rows: 5,
    outputs: [
      "farm/ui/hud_bar.png",
      "farm/ui/side_panel.png",
      "farm/ui/shop_panel.png",
      "farm/ui/bag_panel.png",
      "farm/ui/badges_panel.png",
      "farm/ui/icon_gold.png",
      "farm/ui/icon_xp.png",
      "farm/ui/icon_plot.png",
      null,
      null,
      "farm/ui/icon_seed.png",
      "farm/ui/icon_harvest.png",
      "farm/ui/icon_water.png",
      "farm/ui/icon_uproot.png",
      "farm/ui/icon_buy_plot.png",
      "farm/ui/icon_theme.png",
      "farm/fx/plant_puff.png",
      "farm/fx/water_splash.png",
      "farm/fx/growth_glow.png",
      "farm/fx/harvest_pop.png",
      "farm/fx/offline_report.png",
      "farm/fx/booster_flash.png",
      "farm/fx/level_up.png",
      "farm/ui/button_primary.png",
      "farm/ui/button_secondary.png",
    ],
  },
  {
    input: ["farm", "raw", "journal-season-1x2.png"],
    cols: 2,
    rows: 1,
    outputs: [
      "farm/ui/journal_panel.png",
      "farm/ui/season_panel.png",
    ],
  },
  {
    input: ["companion-yard", "raw", "expressions-2x3.png"],
    cols: 3,
    rows: 2,
    outputs: [
      "companion-yard/expressions/ecstatic.png",
      "companion-yard/expressions/happy.png",
      "companion-yard/expressions/content.png",
      "companion-yard/expressions/neutral.png",
      "companion-yard/expressions/sad.png",
      "companion-yard/expressions/miserable.png",
    ],
  },
  {
    input: ["companion-yard", "raw", "mementos-2x4.png"],
    cols: 4,
    rows: 2,
    outputs: [
      "companion-yard/mementos/mika_bell.png",
      "companion-yard/mementos/pebble_tag.png",
      "companion-yard/mementos/mochi_ribbon.png",
      "companion-yard/mementos/pip_seed.png",
      "companion-yard/mementos/willow_leaf.png",
      "companion-yard/mementos/basil_pebble.png",
      "companion-yard/mementos/starlit_charm.png",
      "companion-yard/mementos/sage_shell_chip.png",
    ],
  },
  {
    input: ["companion-yard", "raw", "ui-4x4.png"],
    cols: 4,
    rows: 4,
    outputs: [
      "companion-yard/ui/gift_box.png",
      "companion-yard/ui/gift_ready.png",
      "companion-yard/ui/photo_frame.png",
      "companion-yard/ui/photo_favorite.png",
      "companion-yard/ui/stamp.png",
      "companion-yard/ui/daily_letter.png",
      "companion-yard/ui/panel_food.png",
      "companion-yard/ui/panel_goodies.png",
      "companion-yard/ui/panel_shop.png",
      "companion-yard/ui/panel_petbook.png",
      "companion-yard/ui/panel_album.png",
      "companion-yard/ui/panel_gifts.png",
      "companion-yard/ui/panel_settings.png",
      "companion-yard/ui/bottom_dock.png",
      "companion-yard/ui/activity_pill.png",
      "companion-yard/ui/button_small_empty.png",
    ],
  },
  {
    input: ["companion-yard", "raw", "fx-2x5.png"],
    cols: 5,
    rows: 2,
    outputs: [
      "companion-yard/fx/visitor_arrive.png",
      "companion-yard/fx/visitor_leave.png",
      "companion-yard/fx/gift_pop.png",
      "companion-yard/fx/memento_glow.png",
      "companion-yard/fx/photo_flash.png",
      "companion-yard/fx/repair_spark.png",
      "companion-yard/fx/place_goodie.png",
      "companion-yard/fx/move_goodie.png",
      "companion-yard/fx/remodel_transition.png",
      "companion-yard/fx/pending_sync.png",
    ],
  },
];

const keyedSingles = [
  {
    input: ["garden-shelf", "raw", "tap-ring.png"],
    output: "garden-shelf/fx/tap-ring.png",
  },
];

const copiedImages = [
  {
    input: ["blox", "raw", "background.png"],
    output: "blox/background.png",
  },
  {
    input: ["brain-blitz", "raw", "background-quiz-room.png"],
    output: "trivia/background-quiz-room.png",
  },
  {
    input: ["farm", "raw", "background-field.png"],
    output: "farm/background-field.png",
  },
];

async function main() {
  const written = [];
  const skipped = [];

  for (const image of copiedImages) {
    written.push(await writeCopiedImage(image.input, image.output));
  }

  for (const image of keyedSingles) {
    written.push(await writeKeyedAsset(source(...image.input), image.output));
  }

  for (const sheet of sheets) {
    const result = await writeGridSheet(sheet);
    written.push(...result.written);
    skipped.push(...result.skipped);
  }

  const leaks = [];
  const scrubbed = [];
  for (const file of await walkPngFiles(path.join(ROOT, "public", "games"))) {
    const count = await scrubStrictChromakey(file);
    if (count) {
      scrubbed.push({
        output: asPosix(path.relative(ROOT, file)),
        strictChromakeyPixelsScrubbed: count,
      });
    }
  }

  for (const item of written) {
    const outputPath = path.join(ROOT, item.output);
    const leak = await scanChromakeyLeaks(outputPath, item.chromaRemoved > 0);
    item.opaquePixels = leak.opaque;
    item.exactChromakeyPixels = leak.exact;
    item.strictChromakeyPixels = leak.strict;
    if (leak.exact || leak.strict) leaks.push({ output: item.output, ...leak });
  }

  const status = {
    generatedAt: new Date().toISOString(),
    writtenCount: written.length,
    skippedCells: skipped,
    chromakey: {
      exactColor: "#FF00FF",
      rule: "border-connected chroma pixels plus strict near-exact chromakey pixels are made transparent",
      leakCount: leaks.length,
      leaks,
      scrubbedPublicFallbacks: scrubbed,
    },
    written,
  };

  await fs.mkdir(path.dirname(STATUS_PATH), { recursive: true });
  await fs.writeFile(STATUS_PATH, `${JSON.stringify(status, null, 2)}\n`);

  if (leaks.length) {
    console.error(`Chromakey leak check failed for ${leaks.length} output assets.`);
    for (const leak of leaks.slice(0, 20)) {
      console.error(`${leak.output}: exact=${leak.exact} strict=${leak.strict}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Processed ${written.length} game assets.`);
  console.log("Chromakey leak check passed: 0 opaque #FF00FF / near-exact chromakey pixels.");
  console.log(`Wrote ${asPosix(path.relative(ROOT, STATUS_PATH))}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
