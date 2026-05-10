import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PIECES } from "../game-logic/blox-pieces.js";

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, "assets-source", "imagegen");
const CUTOUT_ROOT = path.join(SOURCE_ROOT, "readability-cutouts");
const CONTACT_SHEET_DIR = path.join(SOURCE_ROOT, "qc-contact-sheets");
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const FORBIDDEN_KEY_COLORS = [
  { name: "#ff00ff", r: 255, g: 0, b: 255 },
  { name: "#123456", r: 18, g: 52, b: 86 },
];

function posixPath(value) {
  return value.replace(/\\/g, "/");
}

function publicTarget(relativePath) {
  return path.join(ROOT, "public", "games", ...relativePath.split("/"));
}

function cutoutTarget(relativePath) {
  return path.join(CUTOUT_ROOT, ...relativePath.split("/"));
}

function distSq(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function colorAt(data, index) {
  const offset = index * 4;
  return {
    r: data[offset],
    g: data[offset + 1],
    b: data[offset + 2],
    a: data[offset + 3],
  };
}

function quantizedKey(color, step = 8) {
  return [
    Math.round(color.r / step) * step,
    Math.round(color.g / step) * step,
    Math.round(color.b / step) * step,
  ].join(":");
}

function parseQuantizedKey(key) {
  const [r, g, b] = key.split(":").map(Number);
  return { r, g, b };
}

function borderSampleIndexes(width, height, inset = 3) {
  const indexes = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x < inset || y < inset || x >= width - inset || y >= height - inset) {
        indexes.push(y * width + x);
      }
    }
  }
  return indexes;
}

function backgroundPalette(data, info) {
  const counts = new Map();
  for (const index of borderSampleIndexes(info.width, info.height)) {
    const color = colorAt(data, index);
    if (color.a <= 8) continue;
    const key = quantizedKey(color);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key]) => parseQuantizedKey(key));
}

function isBackgroundLike(color, palette, threshold = 28) {
  if (color.a <= 8) return true;
  const thresholdSq = threshold * threshold;
  return palette.some((entry) => distSq(color, entry) <= thresholdSq);
}

function isMostlyBackgroundLikeComponent(component, data, palette, threshold = 18) {
  let backgroundLike = 0;
  for (const index of component.pixels) {
    if (isBackgroundLike(colorAt(data, index), palette, threshold)) {
      backgroundLike += 1;
    }
  }
  return backgroundLike / component.count >= 0.82;
}

function removeConnectedBackground(data, info, options = {}) {
  const palette = backgroundPalette(data, info);
  const threshold = options.backgroundThreshold || 28;
  const background = new Uint8Array(info.width * info.height);
  const queue = [];
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) return;
    const index = y * info.width + x;
    if (background[index]) return;
    if (!isBackgroundLike(colorAt(data, index), palette, threshold)) return;
    background[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < info.width; x += 1) {
    enqueue(x, 0);
    enqueue(x, info.height - 1);
  }
  for (let y = 1; y < info.height - 1; y += 1) {
    enqueue(0, y);
    enqueue(info.width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % info.width;
    const y = Math.floor(index / info.width);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  let removed = 0;
  for (let index = 0; index < background.length; index += 1) {
    if (!background[index]) continue;
    const offset = index * 4;
    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
    data[offset + 3] = 0;
    removed += 1;
  }
  return { palette, removed };
}

function scrubBackgroundLikePixels(data, info, palette, threshold = 18) {
  let scrubbed = 0;
  for (let index = 0; index < info.width * info.height; index += 1) {
    if (!isBackgroundLike(colorAt(data, index), palette, threshold)) continue;
    const offset = index * 4;
    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
    data[offset + 3] = 0;
    scrubbed += 1;
  }
  return scrubbed;
}

function findAlphaComponents(data, info, threshold = 8) {
  const seen = new Uint8Array(info.width * info.height);
  const components = [];
  const stack = [];

  for (let start = 0; start < seen.length; start += 1) {
    if (seen[start]) continue;
    seen[start] = 1;
    if (data[start * 4 + 3] <= threshold) continue;

    const component = {
      pixels: [],
      minX: info.width,
      minY: info.height,
      maxX: 0,
      maxY: 0,
      sumX: 0,
      sumY: 0,
    };
    stack.push(start);
    while (stack.length) {
      const index = stack.pop();
      const x = index % info.width;
      const y = Math.floor(index / info.width);
      component.pixels.push(index);
      component.minX = Math.min(component.minX, x);
      component.minY = Math.min(component.minY, y);
      component.maxX = Math.max(component.maxX, x);
      component.maxY = Math.max(component.maxY, y);
      component.sumX += x;
      component.sumY += y;

      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
        [x + 1, y + 1],
        [x - 1, y - 1],
        [x + 1, y - 1],
        [x - 1, y + 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height) continue;
        const next = ny * info.width + nx;
        if (seen[next]) continue;
        seen[next] = 1;
        if (data[next * 4 + 3] > threshold) stack.push(next);
      }
    }
    component.count = component.pixels.length;
    component.centerX = component.sumX / component.count;
    component.centerY = component.sumY / component.count;
    components.push(component);
  }

  return components;
}

function unionBounds(components, info, padding) {
  if (!components.length) {
    throw new Error("No visible alpha components found after background removal");
  }
  const minX = Math.max(0, Math.min(...components.map((component) => component.minX)) - padding);
  const minY = Math.max(0, Math.min(...components.map((component) => component.minY)) - padding);
  const maxX = Math.min(info.width - 1, Math.max(...components.map((component) => component.maxX)) + padding);
  const maxY = Math.min(info.height - 1, Math.max(...components.map((component) => component.maxY)) + padding);
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function isolateComponents(data, info, components, minComponentRatio = 0.003) {
  if (!components.length) return [];
  const largest = Math.max(...components.map((component) => component.count));
  const minimum = Math.max(18, Math.round(largest * minComponentRatio));
  const keep = components.filter((component) => component.count >= minimum);
  const keptPixels = new Uint8Array(info.width * info.height);
  for (const component of keep) {
    for (const index of component.pixels) keptPixels[index] = 1;
  }
  for (let index = 0; index < info.width * info.height; index += 1) {
    if (keptPixels[index]) continue;
    const offset = index * 4;
    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
    data[offset + 3] = 0;
  }
  return keep;
}

async function writePng(buffer, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buffer);
}

async function resizeCutout(buffer, maxWidth, maxHeight) {
  const metadata = await sharp(buffer).metadata();
  const scale = Math.min(1, maxWidth / metadata.width, maxHeight / metadata.height);
  if (scale >= 1) return buffer;
  return sharp(buffer)
    .resize(Math.max(1, Math.round(metadata.width * scale)), Math.max(1, Math.round(metadata.height * scale)), {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function alphaBounds(buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0 || maxY < 0) return null;
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

async function normalizeCutout(buffer, maxWidth, maxHeight, finalPadding = 0) {
  if (!finalPadding) return resizeCutout(buffer, maxWidth, maxHeight);
  const bounds = await alphaBounds(buffer);
  if (!bounds) return resizeCutout(buffer, maxWidth, maxHeight);
  const contentMaxWidth = Math.max(1, maxWidth - finalPadding * 2);
  const contentMaxHeight = Math.max(1, maxHeight - finalPadding * 2);
  const trimmed = await sharp(buffer)
    .extract(bounds)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const resizedContent = await resizeCutout(trimmed, contentMaxWidth, contentMaxHeight);
  const contentMetadata = await sharp(resizedContent).metadata();
  const width = contentMetadata.width + finalPadding * 2;
  const height = contentMetadata.height + finalPadding * 2;
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: TRANSPARENT,
    },
  })
    .composite([{ input: resizedContent, left: finalPadding, top: finalPadding }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function assertNoForbiddenKeyLeaks(filePath) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const leaks = Object.fromEntries(FORBIDDEN_KEY_COLORS.map((color) => [color.name, 0]));
  for (let index = 0; index < info.width * info.height; index += 1) {
    const offset = index * 4;
    if (data[offset + 3] <= 8) continue;
    for (const color of FORBIDDEN_KEY_COLORS) {
      if (data[offset] === color.r && data[offset + 1] === color.g && data[offset + 2] === color.b) {
        leaks[color.name] += 1;
      }
    }
  }
  const found = Object.entries(leaks).filter(([, count]) => count > 0);
  if (found.length) {
    throw new Error(`Forbidden key-color pixels remained in ${posixPath(path.relative(ROOT, filePath))}: ${JSON.stringify(leaks)}`);
  }
}

async function cutCell({ sourcePath, col, row, cols, rows, output, maxWidth, maxHeight, padding = 10, minComponentRatio, backgroundThreshold, finalPadding = 0 }) {
  const metadata = await sharp(sourcePath).metadata();
  const cellW = metadata.width / cols;
  const cellH = metadata.height / rows;
  const region = {
    left: Math.max(0, Math.floor(col * cellW)),
    top: Math.max(0, Math.floor(row * cellH)),
    width: Math.min(metadata.width - Math.floor(col * cellW), Math.ceil(cellW)),
    height: Math.min(metadata.height - Math.floor(row * cellH), Math.ceil(cellH)),
  };
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .extract(region)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);
  const background = removeConnectedBackground(pixels, info, { backgroundThreshold });
  const components = findAlphaComponents(pixels, info);
  const kept = isolateComponents(pixels, info, components, minComponentRatio);
  const bounds = unionBounds(kept, info, padding);
  const cutout = await sharp(pixels, { raw: info })
    .extract(bounds)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const resized = await normalizeCutout(cutout, maxWidth, maxHeight, finalPadding);
  const outputPath = publicTarget(output);
  const sourceCutoutPath = cutoutTarget(output);
  await writePng(resized, outputPath);
  await writePng(resized, sourceCutoutPath);
  await assertNoForbiddenKeyLeaks(outputPath);
  const finalMetadata = await sharp(outputPath).metadata();
  return {
    output: posixPath(path.relative(ROOT, outputPath)),
    source: posixPath(path.relative(ROOT, sourcePath)),
    width: finalMetadata.width,
    height: finalMetadata.height,
    components: kept.length,
    removedBackgroundPixels: background.removed,
  };
}

async function cutShadowCell({ sourcePath, index, spec, item }) {
  const metadata = await sharp(sourcePath).metadata();
  const row = Math.floor(index / spec.cols);
  const col = index % spec.cols;
  const cellW = metadata.width / spec.cols;
  const cellH = metadata.height / spec.rows;
  const region = {
    left: Math.max(0, Math.floor(col * cellW)),
    top: Math.max(0, Math.floor(row * cellH)),
    width: Math.min(metadata.width - Math.floor(col * cellW), Math.ceil(cellW)),
    height: Math.min(metadata.height - Math.floor(row * cellH), Math.ceil(cellH)),
  };
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .extract(region)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const offset = pixel * 4;
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    const lightness = (r + g + b) / 3;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    const alpha = spread < 38 ? Math.max(0, Math.min(150, Math.round((238 - lightness) * 3.3))) : 0;
    pixels[offset] = 42;
    pixels[offset + 1] = 36;
    pixels[offset + 2] = 30;
    pixels[offset + 3] = alpha > 12 ? alpha : 0;
  }
  const components = findAlphaComponents(pixels, info)
    .filter((component) => component.count > 20)
    .filter((component) => Math.abs(component.centerX - info.width / 2) < info.width * 0.28
      && Math.abs(component.centerY - info.height / 2) < info.height * 0.3);
  const bounds = unionBounds(components, info, item.padding ?? spec.padding ?? 8);
  const cutout = await sharp(pixels, { raw: info })
    .extract(bounds)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const resized = await normalizeCutout(
    cutout,
    item.maxWidth || spec.maxWidth,
    item.maxHeight || spec.maxHeight,
    item.finalPadding ?? spec.finalPadding ?? 0,
  );
  const outputPath = publicTarget(item.output);
  const sourceCutoutPath = cutoutTarget(item.output);
  await writePng(resized, outputPath);
  await writePng(resized, sourceCutoutPath);
  await assertNoForbiddenKeyLeaks(outputPath);
  const finalMetadata = await sharp(outputPath).metadata();
  return {
    output: posixPath(path.relative(ROOT, outputPath)),
    source: posixPath(path.relative(ROOT, sourcePath)),
    width: finalMetadata.width,
    height: finalMetadata.height,
    components: components.length,
    removedBackgroundPixels: 0,
  };
}

async function cutGridSheet(spec) {
  const sourcePath = path.join(ROOT, ...spec.source);
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sheetPixels = Buffer.from(data);
  const background = removeConnectedBackground(sheetPixels, info, { backgroundThreshold: spec.backgroundThreshold ?? 28 });
  if (spec.scrubInteriorBackgroundPixels) {
    scrubBackgroundLikePixels(
      sheetPixels,
      info,
      background.palette,
      spec.interiorBackgroundThreshold || 18,
    );
  }
  const components = findAlphaComponents(sheetPixels, info)
    .filter((component) => component.count >= (spec.minimumComponentArea || 18))
    .filter((component) => !isMostlyBackgroundLikeComponent(
      component,
      sheetPixels,
      background.palette,
      spec.interiorBackgroundThreshold || 18,
    ));
  const cellW = info.width / spec.cols;
  const cellH = info.height / spec.rows;
  const groups = new Map();
  for (const component of components) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let row = 0; row < spec.rows; row += 1) {
      for (let col = 0; col < spec.cols; col += 1) {
        const centerX = (col + 0.5) * cellW;
        const centerY = (row + 0.5) * cellH;
        const dx = (component.centerX - centerX) / cellW;
        const dy = (component.centerY - centerY) / cellH;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = row * spec.cols + col;
        }
      }
    }
    if (!groups.has(bestIndex)) groups.set(bestIndex, []);
    groups.get(bestIndex).push(component);
  }

  const written = [];
  for (let index = 0; index < spec.items.length; index += 1) {
    const item = spec.items[index];
    if (!item) continue;
    if (item.preserveExisting) continue;
    if (item.shadowFromLuminance) {
      written.push(await cutShadowCell({ sourcePath, index, spec, item }));
      continue;
    }
    const itemComponents = groups.get(index) || [];
    if (!itemComponents.length) {
      throw new Error(`No components assigned to ${item.output} from ${posixPath(path.relative(ROOT, sourcePath))}`);
    }
    const largest = Math.max(...itemComponents.map((component) => component.count));
    const minimum = Math.max(18, Math.round(largest * (item.minComponentRatio ?? spec.minComponentRatio ?? 0.003)));
    const kept = itemComponents.filter((component) => component.count >= minimum);
    const pixels = Buffer.alloc(info.width * info.height * 4);
    for (const component of kept) {
      for (const sourceIndex of component.pixels) {
        const sourceOffset = sourceIndex * 4;
        pixels[sourceOffset] = sheetPixels[sourceOffset];
        pixels[sourceOffset + 1] = sheetPixels[sourceOffset + 1];
        pixels[sourceOffset + 2] = sheetPixels[sourceOffset + 2];
        pixels[sourceOffset + 3] = sheetPixels[sourceOffset + 3];
      }
    }
    const bounds = unionBounds(kept, info, item.padding ?? spec.padding ?? 10);
    const cutout = await sharp(pixels, { raw: info })
      .extract(bounds)
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    const resized = await normalizeCutout(
      cutout,
      item.maxWidth || spec.maxWidth,
      item.maxHeight || spec.maxHeight,
      item.finalPadding ?? spec.finalPadding ?? 0,
    );
    const outputPath = publicTarget(item.output);
    const sourceCutoutPath = cutoutTarget(item.output);
    await writePng(resized, outputPath);
    await writePng(resized, sourceCutoutPath);
    await assertNoForbiddenKeyLeaks(outputPath);
    const finalMetadata = await sharp(outputPath).metadata();
    written.push({
      output: posixPath(path.relative(ROOT, outputPath)),
      source: posixPath(path.relative(ROOT, sourcePath)),
      width: finalMetadata.width,
      height: finalMetadata.height,
      components: kept.length,
      removedBackgroundPixels: background.removed,
    });
  }
  return written;
}

async function composeBloxPiecePreviews() {
  const tileByColor = {
    "#94a3b8": "block_tile_gray.png",
    "#60a5fa": "block_tile_blue.png",
    "#f97316": "block_tile_orange.png",
    "#22c55e": "block_tile_green.png",
    "#fbbf24": "block_tile_yellow.png",
    "#a78bfa": "block_tile_purple.png",
    "#ef4444": "block_tile_red.png",
    "#06b6d4": "block_tile_cyan.png",
    "#e879f9": "block_tile_pink.png",
  };
  const written = [];
  for (const piece of PIECES) {
    const rows = piece.cells.map(([r]) => r);
    const cols = piece.cells.map(([, c]) => c);
    const minRow = Math.min(...rows);
    const minCol = Math.min(...cols);
    const maxRow = Math.max(...rows);
    const maxCol = Math.max(...cols);
    const cell = 66;
    const gap = 5;
    const pad = 10;
    const width = (maxCol - minCol + 1) * cell + (maxCol - minCol) * gap + pad * 2;
    const height = (maxRow - minRow + 1) * cell + (maxRow - minRow) * gap + pad * 2;
    const tilePath = publicTarget(`blox/${tileByColor[String(piece.color).toLowerCase()] || "block_tile_gray.png"}`);
    const tile = await sharp(tilePath)
      .resize(cell, cell, { fit: "contain", background: TRANSPARENT })
      .png()
      .toBuffer();
    const composites = piece.cells.map(([r, c]) => ({
      input: tile,
      left: pad + (c - minCol) * (cell + gap),
      top: pad + (r - minRow) * (cell + gap),
    }));
    const buffer = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: TRANSPARENT,
      },
    })
      .composite(composites)
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    const output = `blox/piece_${piece.id}.png`;
    const outputPath = publicTarget(output);
    const sourceCutoutPath = cutoutTarget(output);
    await writePng(buffer, outputPath);
    await writePng(buffer, sourceCutoutPath);
    await assertNoForbiddenKeyLeaks(outputPath);
    written.push({
      output: posixPath(path.relative(ROOT, outputPath)),
      source: "generated from readable Blox block tiles",
      width,
      height,
      components: piece.cells.length,
      removedBackgroundPixels: 0,
    });
  }
  return written;
}

async function checkerBackground(width, height, cell = 16) {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f8fafc"/>
    ${Array.from({ length: Math.ceil(height / cell) }, (_row, y) =>
      Array.from({ length: Math.ceil(width / cell) }, (_col, x) =>
        ((x + y) % 2 ? `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="#e7edf3"/>` : ""),
      ).join(""),
    ).join("")}
  </svg>`;
  return Buffer.from(svg);
}

async function writeContactSheet(name, files) {
  const thumb = 116;
  const labelH = 28;
  const gap = 12;
  const cols = 5;
  const rows = Math.ceil(files.length / cols);
  const width = cols * thumb + (cols + 1) * gap;
  const height = rows * (thumb + labelH) + (rows + 1) * gap;
  const composites = [{ input: await checkerBackground(width, height), left: 0, top: 0 }];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const row = Math.floor(index / cols);
    const col = index % cols;
    const left = gap + col * (thumb + gap);
    const top = gap + row * (thumb + labelH + gap);
    const image = await sharp(publicTarget(file))
      .resize(thumb - 10, thumb - 26, { fit: "contain", background: TRANSPARENT })
      .png()
      .toBuffer();
    const label = path.basename(file).replace(/\.png$/, "");
    const text = Buffer.from(`<svg width="${thumb}" height="${labelH}" xmlns="http://www.w3.org/2000/svg">
      <text x="50%" y="17" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#273142">${label}</text>
    </svg>`);
    composites.push({ input: image, left: left + 5, top: top + 4 });
    composites.push({ input: text, left, top: top + thumb - 12 });
  }
  await fs.mkdir(CONTACT_SHEET_DIR, { recursive: true });
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: "#ffffff",
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(CONTACT_SHEET_DIR, `${name}.png`));
}

const bloxTileItems = [
  "blue",
  "green",
  "orange",
  "yellow",
  "purple",
  "red",
  "cyan",
  "pink",
  "gray",
].map((name) => ({ output: `blox/block_tile_${name}.png` }));

const bloxCellItems = [
  "cell_empty",
  "cell_valid",
  "cell_invalid",
  "cell_selected",
  "cell_clear_row",
  "cell_clear_col",
  "cell_pending",
  "grid_shadow",
  "tray_slot_empty",
].map((name) => ({
  output: `blox/${name}.png`,
  maxWidth: name === "tray_slot_empty" ? 260 : 150,
  maxHeight: 150,
  minComponentRatio: name === "grid_shadow" ? 0.0007 : 0.002,
  shadowFromLuminance: name === "grid_shadow",
}));

const match3PieceItems = [
  "dragon",
  "frog",
  "newt",
  "snake",
  "spider",
  "yeti",
].map((name) => ({
  output: `puzzling-potions/images/piece-${name}.png`,
  maxWidth: 156,
  maxHeight: 156,
  finalPadding: 10,
  minComponentRatio: 0.001,
}));

const match3SpecialItems = [
  { output: "puzzling-potions/images/special-row.png", maxWidth: 180, maxHeight: 120, minComponentRatio: 0.001 },
  { output: "puzzling-potions/images/special-column.png", maxWidth: 120, maxHeight: 180, minComponentRatio: 0.001 },
  { output: "puzzling-potions/images/special-blast.png", maxWidth: 156, maxHeight: 156, minComponentRatio: 0.001 },
  { output: "puzzling-potions/images/special-colour.png", maxWidth: 156, maxHeight: 156, minComponentRatio: 0.001 },
  { output: "puzzling-potions/images/drop-gold.png", maxWidth: 144, maxHeight: 144, minComponentRatio: 0.001 },
  { output: "puzzling-potions/images/drop-seeds.png", maxWidth: 144, maxHeight: 144, minComponentRatio: 0.001 },
  { output: "puzzling-potions/images/drop-energy.png", maxWidth: 144, maxHeight: 144, minComponentRatio: 0.001 },
  { output: "puzzling-potions/images/fx-clear-burst.png", maxWidth: 230, maxHeight: 230, minComponentRatio: 0.0004, padding: 4 },
];

const bloxFxItems = [
  { output: "blox/fx/place_settle.png", maxWidth: 150, maxHeight: 150, minComponentRatio: 0.0007, padding: 2 },
  { output: "blox/fx/row_wipe.png", maxWidth: 360, maxHeight: 104, minComponentRatio: 0.0005, padding: 2 },
  { output: "blox/fx/column_wipe.png", maxWidth: 104, maxHeight: 360, minComponentRatio: 0.0005, padding: 2 },
  { output: "blox/fx/multi_clear_burst.png", maxWidth: 230, maxHeight: 230, minComponentRatio: 0.0004, padding: 2 },
];

const specs = [
  {
    source: ["assets-source", "imagegen", "blox", "readable", "block-tiles-3x3-source.png"],
    cols: 3,
    rows: 3,
    maxWidth: 150,
    maxHeight: 150,
    padding: 8,
    minComponentRatio: 0.002,
    items: bloxTileItems,
  },
  {
    source: ["assets-source", "imagegen", "blox", "readable", "cells-3x3-source.png"],
    cols: 3,
    rows: 3,
    maxWidth: 150,
    maxHeight: 150,
    padding: 8,
    minComponentRatio: 0.0015,
    items: bloxCellItems,
  },
  {
    source: ["assets-source", "imagegen", "blox", "readable", "fx-2x2-source.png"],
    cols: 2,
    rows: 2,
    padding: 4,
    backgroundThreshold: 30,
    interiorBackgroundThreshold: 20,
    scrubInteriorBackgroundPixels: true,
    items: bloxFxItems,
  },
  {
    source: ["assets-source", "imagegen", "match3", "readable", "pieces-2x3-source.png"],
    cols: 3,
    rows: 2,
    maxWidth: 156,
    maxHeight: 156,
    padding: 6,
    minComponentRatio: 0.0008,
    items: match3PieceItems,
  },
  {
    source: ["assets-source", "imagegen", "match3", "readable", "specials-drops-2x4-source.png"],
    cols: 4,
    rows: 2,
    padding: 6,
    backgroundThreshold: 30,
    items: match3SpecialItems,
  },
];

const written = [];
for (const spec of specs) {
  written.push(...await cutGridSheet(spec));
}
written.push(...await composeBloxPiecePreviews());

await writeContactSheet("blox-readable", [
  ...bloxTileItems.map((item) => item.output),
  ...bloxCellItems.map((item) => item.output),
  ...bloxFxItems.map((item) => item.output),
  ...PIECES.map((piece) => `blox/piece_${piece.id}.png`),
]);
await writeContactSheet("puzzling-potions-readable", [
  ...match3PieceItems.map((item) => item.output),
  ...match3SpecialItems.map((item) => item.output),
]);

const manifest = {
  generatedAt: new Date().toISOString(),
  notes: [
    "Raw art sources were generated as separate sheets, then cut from connected alpha pixels.",
    "Uniform grid cells are used only to locate the intended object; runtime PNGs are tight per-object cutouts.",
    "No opaque #ff00ff or #123456 pixels are allowed in outputs.",
  ],
  written,
};
await fs.writeFile(
  path.join(CUTOUT_ROOT, "readability-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

console.log(JSON.stringify({
  written: written.length,
  manifest: posixPath(path.relative(ROOT, path.join(CUTOUT_ROOT, "readability-manifest.json"))),
  contactSheets: [
    posixPath(path.relative(ROOT, path.join(CONTACT_SHEET_DIR, "blox-readable.png"))),
    posixPath(path.relative(ROOT, path.join(CONTACT_SHEET_DIR, "puzzling-potions-readable.png"))),
  ],
}, null, 2));
