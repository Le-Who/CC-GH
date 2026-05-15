import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const KEY_HEX = "#123456";
const ROOT = process.cwd();
const TMP_DIR = path.join(ROOT, "tmp", "imagegen");
const GARDEN_DIR = path.join(ROOT, "public", "games", "garden-shelf");
const MATCH3_DIR = path.join(ROOT, "public", "games", "puzzling-potions", "images");
const IMAGEGEN_SOURCE_DIR = path.join(ROOT, "assets-source", "imagegen");
const GARDEN_SOURCE_DIR = path.join(IMAGEGEN_SOURCE_DIR, "garden-shelf");
const MATCH3_SOURCE_DIR = path.join(IMAGEGEN_SOURCE_DIR, "match3");
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

const KEY_RGB = hexToRgb(KEY_HEX);

const imagegenSources = {
  gardenExistingTransparent: path.join(GARDEN_SOURCE_DIR, "existing-8-transparent.png"),
  match3Pieces: path.join(MATCH3_SOURCE_DIR, "pieces-transparent.png"),
  match3SpecialsDrops: path.join(MATCH3_SOURCE_DIR, "specials-drops-transparent.png"),
  match3Ui: path.join(MATCH3_SOURCE_DIR, "ui-transparent.png"),
  match3BackgroundTable: path.join(MATCH3_SOURCE_DIR, "background-table-transparent.png"),
};

const GARDEN = {
  width: 1672,
  height: 1645,
  columns: 8,
  rows: 7,
  phases: 4,
  frameInsetX: 18,
  frameInsetY: 14,
  frameWidth: 173,
  frameHeight: 207,
};
GARDEN.cellWidth = GARDEN.width / GARDEN.columns;
GARDEN.cellHeight = GARDEN.height / GARDEN.rows;

const plantFamilies = [
  { id: "daisy", leaf: "#67a65c", accent: "#fff6c9", pot: "#c88958" },
  { id: "lavender", leaf: "#6aa071", accent: "#a477d6", pot: "#8b6ab0" },
  { id: "basil", leaf: "#4eaf66", accent: "#b7f0a0", pot: "#c37443" },
  { id: "rosemary", leaf: "#4a9b83", accent: "#9edecb", pot: "#5c9ba2" },
  { id: "monstera", leaf: "#2f8e59", accent: "#77c98d", pot: "#84614b" },
  { id: "succulent", leaf: "#8fcf89", accent: "#c8e5a0", pot: "#d6a85c" },
  { id: "pothos", leaf: "#56a96b", accent: "#c5e887", pot: "#748a54" },
  { id: "strawberry", leaf: "#4f9c57", accent: "#e25358", pot: "#b4574f" },
  { id: "bonsai", leaf: "#45a36e", accent: "#f49c86", pot: "#2f9da4" },
  { id: "string_of_pearls", leaf: "#75c98a", accent: "#d8f5b0", pot: "#d9c8a8" },
  { id: "orchid", leaf: "#517f61", accent: "#e678c5", pot: "#7d5aa8" },
  { id: "venus_flytrap", leaf: "#78bd50", accent: "#f17469", pot: "#59734d" },
  { id: "moon_cactus", leaf: "#6da964", accent: "#f06c39", pot: "#d4a94c" },
  { id: "fern", leaf: "#5fbf7a", accent: "#b8ef9f", pot: "#567a4e" },
];

const gardenImagegenFamilies = plantFamilies.slice(8).map((family) => family.id);

const gardenFamilySources = Object.fromEntries(gardenImagegenFamilies.map((id) => [
  id,
  {
    keyed: path.join(GARDEN_SOURCE_DIR, "families", `${id}-keyed.png`),
    transparent: path.join(GARDEN_SOURCE_DIR, "families", `${id}-transparent.png`),
  },
]));

const gardenFamilyPlacement = {
  bonsai: { maxWidth: 0.92, maxHeight: 0.88, bottomPad: 8 },
  string_of_pearls: { maxWidth: 0.86, maxHeight: 0.96, topPad: 5, anchor: "top" },
  orchid: { maxWidth: 0.84, maxHeight: 0.9, bottomPad: 8 },
  venus_flytrap: { maxWidth: 0.9, maxHeight: 0.9, bottomPad: 8 },
  moon_cactus: { maxWidth: 0.82, maxHeight: 0.86, bottomPad: 8 },
  fern: { maxWidth: 0.94, maxHeight: 0.9, bottomPad: 8 },
};

function ensurePosix(value) {
  return value.replace(/\\/g, "/");
}

async function ensureDirs() {
  await Promise.all([
    fs.mkdir(TMP_DIR, { recursive: true }),
    fs.mkdir(GARDEN_DIR, { recursive: true }),
    fs.mkdir(MATCH3_DIR, { recursive: true }),
  ]);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function useImagegenGardenFamilySources() {
  const checks = await Promise.all(Object.values(gardenFamilySources).flatMap((source) => [
    fileExists(source.keyed),
    fileExists(source.transparent),
  ]));
  return checks.every(Boolean);
}

async function useExistingGardenTopRows() {
  return fileExists(imagegenSources.gardenExistingTransparent);
}

async function useImagegenMatch3Sources() {
  return (await fileExists(imagegenSources.match3Pieces))
    && (await fileExists(imagegenSources.match3SpecialsDrops))
    && (await fileExists(imagegenSources.match3Ui))
    && (await fileExists(imagegenSources.match3BackgroundTable));
}

async function writeImagegenManifest(sourceMode) {
  await fs.writeFile(
    path.join(TMP_DIR, "imagegen-source-manifest.json"),
    `${JSON.stringify({
      sourceMode,
      chromaKey: KEY_HEX,
      sources: {
        ...Object.fromEntries(Object.entries(imagegenSources).map(([key, value]) => [
          key,
          ensurePosix(path.relative(ROOT, value)),
        ])),
        gardenFamilies: Object.fromEntries(Object.entries(gardenFamilySources).map(([id, source]) => [
          id,
          {
            keyed: ensurePosix(path.relative(ROOT, source.keyed)),
            transparent: ensurePosix(path.relative(ROOT, source.transparent)),
          },
        ])),
      },
    }, null, 2)}\n`,
  );
}

async function resizeSourceToPng(sourcePath, publicPath, width, height, resize = {}) {
  await sharp(sourcePath)
    .ensureAlpha()
    .resize(width, height, {
      fit: "fill",
      background: TRANSPARENT,
      ...resize,
    })
    .png()
    .toFile(publicPath);
}

async function keyTransparentSheet(sourceBuffer, publicPath, width, height) {
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: KEY_HEX,
    },
  })
    .composite([{ input: sourceBuffer, left: 0, top: 0 }])
    .png()
    .toFile(publicPath);
}

function alphaBoundsFromRaw(data, info) {
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (alpha > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0 || maxY < 0) {
    return null;
  }
  const pad = 8;
  return {
    left: Math.max(0, minX - pad),
    top: Math.max(0, minY - pad),
    width: Math.min(info.width, maxX + pad + 1) - Math.max(0, minX - pad),
    height: Math.min(info.height, maxY + pad + 1) - Math.max(0, minY - pad),
  };
}

async function filteredCellFromRegion(sourcePath, region) {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .extract(region)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const labels = new Int32Array(info.width * info.height);
  const components = [];
  const neighbors = [-info.width - 1, -info.width, -info.width + 1, -1, 1, info.width - 1, info.width, info.width + 1];
  const stack = [];
  let componentId = 0;

  for (let start = 0; start < labels.length; start += 1) {
    if (labels[start] !== 0) {
      continue;
    }
    const alpha = data[start * 4 + 3];
    if (alpha <= 8) {
      labels[start] = -1;
      continue;
    }
    componentId += 1;
    let area = 0;
    labels[start] = componentId;
    stack.push(start);
    while (stack.length) {
      const current = stack.pop();
      area += 1;
      const x = current % info.width;
      for (const delta of neighbors) {
        const next = current + delta;
        if (next < 0 || next >= labels.length || labels[next] !== 0) {
          continue;
        }
        const nx = next % info.width;
        if (Math.abs(nx - x) > 1) {
          continue;
        }
        if (data[next * 4 + 3] <= 8) {
          labels[next] = -1;
          continue;
        }
        labels[next] = componentId;
        stack.push(next);
      }
    }
    components[componentId] = area;
  }

  const largest = Math.max(0, ...components.filter(Boolean));
  if (!largest) {
    return null;
  }
  const minimumKeptArea = Math.max(48, Math.round(largest * 0.08));
  for (let pixel = 0; pixel < labels.length; pixel += 1) {
    const label = labels[pixel];
    if (label > 0 && components[label] < minimumKeptArea) {
      const offset = pixel * 4;
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 0;
    }
  }

  const bounds = alphaBoundsFromRaw(data, info);
  if (!bounds) {
    return null;
  }

  return {
    buffer: await sharp(data, { raw: info }).png().toBuffer(),
    bounds,
    width: bounds.width,
    height: bounds.height,
  };
}

async function detectFamilySpriteRegions(sourcePath, expectedCount = GARDEN.phases) {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const columnCounts = Array.from({ length: info.width }, (_item, x) => {
    let count = 0;
    for (let y = 0; y < info.height; y += 1) {
      if (data[(y * info.width + x) * 4 + 3] > 8) {
        count += 1;
      }
    }
    return count;
  });

  const rawSegments = [];
  let start = null;
  let last = -1;
  for (let x = 0; x < columnCounts.length; x += 1) {
    if (columnCounts[x] > 2) {
      if (start === null) {
        start = x;
      }
      last = x;
    } else if (start !== null) {
      rawSegments.push({ left: start, right: last });
      start = null;
    }
  }
  if (start !== null) {
    rawSegments.push({ left: start, right: last });
  }

  const mergedSegments = [];
  const mergeGap = Math.max(18, Math.round(info.width * 0.008));
  for (const segment of rawSegments) {
    const previous = mergedSegments.at(-1);
    if (!previous || segment.left - previous.right > mergeGap) {
      mergedSegments.push({ ...segment });
    } else {
      previous.right = segment.right;
    }
  }

  const candidates = mergedSegments
    .map((segment) => ({
      ...segment,
      width: segment.right - segment.left + 1,
      area: columnCounts.slice(segment.left, segment.right + 1).reduce((sum, value) => sum + value, 0),
    }))
    .filter((segment) => segment.area > 200)
    .sort((a, b) => b.area - a.area)
    .slice(0, expectedCount)
    .sort((a, b) => a.left - b.left);

  if (candidates.length === expectedCount) {
    return candidates.map((segment) => {
      const pad = Math.max(20, Math.round(segment.width * 0.08));
      return clampRegion({
        left: segment.left - pad,
        top: 0,
        width: segment.width + pad * 2,
        height: info.height,
      }, info);
    });
  }

  return Array.from({ length: expectedCount }, (_item, phase) => {
    const rawSourceCell = clampRegion(cellRegion(info, expectedCount, 1, phase, 0), info);
    const horizontalSafeInset = Math.round(rawSourceCell.width * 0.045);
    return clampRegion({
      left: rawSourceCell.left + horizontalSafeInset,
      top: rawSourceCell.top,
      width: rawSourceCell.width - horizontalSafeInset * 2,
      height: rawSourceCell.height,
    }, info);
  });
}

function detectAxisSegments(counts, {
  threshold = 2,
  mergeGap = 18,
  minimumArea = 200,
} = {}) {
  const rawSegments = [];
  let start = null;
  let last = -1;
  for (let index = 0; index < counts.length; index += 1) {
    if (counts[index] > threshold) {
      if (start === null) {
        start = index;
      }
      last = index;
    } else if (start !== null) {
      rawSegments.push({ left: start, right: last });
      start = null;
    }
  }
  if (start !== null) {
    rawSegments.push({ left: start, right: last });
  }

  const mergedSegments = [];
  for (const segment of rawSegments) {
    const previous = mergedSegments.at(-1);
    if (!previous || segment.left - previous.right > mergeGap) {
      mergedSegments.push({ ...segment });
    } else {
      previous.right = segment.right;
    }
  }

  return mergedSegments
    .map((segment) => ({
      ...segment,
      width: segment.right - segment.left + 1,
      area: counts.slice(segment.left, segment.right + 1).reduce((sum, value) => sum + value, 0),
    }))
    .filter((segment) => segment.area >= minimumArea);
}

async function detectGridSpriteRegions(sourcePath, columns, rows) {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rowCounts = Array.from({ length: info.height }, (_item, y) => {
    let count = 0;
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] > 8) {
        count += 1;
      }
    }
    return count;
  });
  const rowSegments = detectAxisSegments(rowCounts, {
    mergeGap: Math.max(18, Math.round(info.height * 0.012)),
    minimumArea: Math.max(200, Math.round(info.width * 0.08)),
  })
    .sort((a, b) => b.area - a.area)
    .slice(0, rows)
    .sort((a, b) => a.left - b.left);

  if (rowSegments.length !== rows) {
    return Array.from({ length: rows * columns }, (_item, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      return cellRegion(info, columns, rows, col, row);
    });
  }

  const regions = [];
  for (const rowSegment of rowSegments) {
    const columnCounts = Array.from({ length: info.width }, (_item, x) => {
      let count = 0;
      for (let y = rowSegment.left; y <= rowSegment.right; y += 1) {
        if (data[(y * info.width + x) * 4 + 3] > 8) {
          count += 1;
        }
      }
      return count;
    });
    const columnSegments = detectAxisSegments(columnCounts, {
      mergeGap: Math.max(18, Math.round(info.width * 0.012)),
      minimumArea: Math.max(200, Math.round(info.height * 0.04)),
    })
      .sort((a, b) => b.area - a.area)
      .slice(0, columns)
      .sort((a, b) => a.left - b.left);

    if (columnSegments.length !== columns) {
      const rowIndex = regions.length / columns;
      for (let col = 0; col < columns; col += 1) {
        regions.push(cellRegion(info, columns, rows, col, rowIndex));
      }
      continue;
    }

    for (const columnSegment of columnSegments) {
      const padX = Math.max(20, Math.round(columnSegment.width * 0.08));
      const padY = Math.max(20, Math.round(rowSegment.width * 0.08));
      regions.push(clampRegion({
        left: columnSegment.left - padX,
        top: rowSegment.left - padY,
        width: columnSegment.width + padX * 2,
        height: rowSegment.width + padY * 2,
      }, info));
    }
  }

  return regions;
}

async function detectAlphaComponents(sourcePath, minimumArea = 500) {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const labels = new Int32Array(info.width * info.height);
  const components = [];
  const neighbors = [-info.width - 1, -info.width, -info.width + 1, -1, 1, info.width - 1, info.width, info.width + 1];
  const stack = [];
  let componentId = 0;

  for (let start = 0; start < labels.length; start += 1) {
    if (labels[start] !== 0) {
      continue;
    }
    if (data[start * 4 + 3] <= 8) {
      labels[start] = -1;
      continue;
    }
    componentId += 1;
    let area = 0;
    let minX = info.width;
    let minY = info.height;
    let maxX = 0;
    let maxY = 0;
    labels[start] = componentId;
    stack.push(start);
    while (stack.length) {
      const current = stack.pop();
      area += 1;
      const x = current % info.width;
      const y = Math.floor(current / info.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (const delta of neighbors) {
        const next = current + delta;
        if (next < 0 || next >= labels.length || labels[next] !== 0) {
          continue;
        }
        const nx = next % info.width;
        if (Math.abs(nx - x) > 1) {
          continue;
        }
        if (data[next * 4 + 3] <= 8) {
          labels[next] = -1;
          continue;
        }
        labels[next] = componentId;
        stack.push(next);
      }
    }
    if (area >= minimumArea) {
      components.push({
        area,
        left: minX,
        top: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        right: maxX,
        bottom: maxY,
      });
    }
  }
  return { components, info };
}

function paddedRegion(component, metadata, pad = 24) {
  return clampRegion({
    left: component.left - pad,
    top: component.top - pad,
    width: component.width + pad * 2,
    height: component.height + pad * 2,
  }, metadata);
}

async function composeGardenFamilyRuntimeSheet() {
  const topRows = 4;
  const topHeight = Math.round(GARDEN.cellHeight * topRows);
  const oldRows = await sharp(imagegenSources.gardenExistingTransparent)
    .ensureAlpha()
    .resize(GARDEN.width, topHeight, { fit: "fill", background: TRANSPARENT })
    .png()
    .toBuffer();

  const composites = [{ input: oldRows, left: 0, top: 0 }];

  for (const [familyOffset, id] of gardenImagegenFamilies.entries()) {
    const sourcePath = gardenFamilySources[id].transparent;
    const sourceRegions = await detectFamilySpriteRegions(sourcePath);
    const cells = [];
    for (let phase = 0; phase < GARDEN.phases; phase += 1) {
      const filteredCell = await filteredCellFromRegion(sourcePath, sourceRegions[phase]);
      if (!filteredCell) {
        cells.push(null);
        continue;
      }
      cells.push(filteredCell);
    }

    const nonEmptyCells = cells.filter(Boolean);
    if (!nonEmptyCells.length) {
      continue;
    }
    const placement = gardenFamilyPlacement[id] || {};
    const maxSourceWidth = Math.max(...nonEmptyCells.map((cell) => cell.width));
    const maxSourceHeight = Math.max(...nonEmptyCells.map((cell) => cell.height));
    const maxRuntimeWidth = Math.round(GARDEN.cellWidth * (placement.maxWidth || 0.88));
    const maxRuntimeHeight = Math.round(GARDEN.cellHeight * (placement.maxHeight || 0.9));
    const familyScale = Math.min(maxRuntimeWidth / maxSourceWidth, maxRuntimeHeight / maxSourceHeight);
    const plantIndex = 8 + familyOffset;
    const targetRow = Math.floor(plantIndex / 2);

    for (let phase = 0; phase < GARDEN.phases; phase += 1) {
      const cell = cells[phase];
      if (!cell) {
        continue;
      }
      const targetCol = (plantIndex % 2) * GARDEN.phases + phase;
      const targetWidth = Math.max(1, Math.round(cell.width * familyScale));
      const targetHeight = Math.max(1, Math.round(cell.height * familyScale));
      const input = await sharp(cell.buffer)
        .ensureAlpha()
        .extract(cell.bounds)
        .resize(targetWidth, targetHeight, { fit: "fill", background: TRANSPARENT })
        .png()
        .toBuffer();
      const cellLeft = Math.round(targetCol * GARDEN.cellWidth);
      const cellTop = Math.round(targetRow * GARDEN.cellHeight);
      const left = Math.round(cellLeft + (GARDEN.cellWidth - targetWidth) / 2 + (placement.offsetX || 0));
      const top = placement.anchor === "top"
        ? Math.round(cellTop + (placement.topPad || 0) + (placement.offsetY || 0))
        : Math.round(cellTop + GARDEN.cellHeight - (placement.bottomPad || 8) - targetHeight + (placement.offsetY || 0));
      composites.push({ input, left, top });
    }
  }

  return sharp({
    create: {
      width: GARDEN.width,
      height: GARDEN.height,
      channels: 4,
      background: TRANSPARENT,
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

function cellRegion(metadata, columns, rows, col, row) {
  const left = Math.round((metadata.width * col) / columns);
  const top = Math.round((metadata.height * row) / rows);
  const right = Math.round((metadata.width * (col + 1)) / columns);
  const bottom = Math.round((metadata.height * (row + 1)) / rows);
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function clampRegion(region, metadata) {
  const left = Math.max(0, Math.min(metadata.width - 1, Math.round(region.left)));
  const top = Math.max(0, Math.min(metadata.height - 1, Math.round(region.top)));
  return {
    left,
    top,
    width: Math.max(1, Math.min(metadata.width - left, Math.round(region.width))),
    height: Math.max(1, Math.min(metadata.height - top, Math.round(region.height))),
  };
}

async function extractSourceRegion({
  sourcePath,
  publicPath,
  region,
  width,
  height,
  fit = "contain",
  trim = false,
  resize = {},
}) {
  const metadata = await sharp(sourcePath).metadata();
  const safeRegion = clampRegion(region, metadata);
  let image = sharp(sourcePath).ensureAlpha().extract(safeRegion);
  if (trim) {
    image = image.trim({ background: TRANSPARENT, threshold: 12 });
  }
  await image
    .resize(width, height, {
      fit,
      background: TRANSPARENT,
      ...resize,
    })
    .png()
    .toFile(publicPath);
}

async function extractSourceRegionContained({
  sourcePath,
  publicPath,
  region,
  width,
  height,
  contentScale = 0.9,
  filterComponents = false,
}) {
  const metadata = await sharp(sourcePath).metadata();
  const safeRegion = clampRegion(region, metadata);
  const innerWidth = Math.max(1, Math.round(width * contentScale));
  const innerHeight = Math.max(1, Math.round(height * contentScale));
  const filteredCell = filterComponents ? await filteredCellFromRegion(sourcePath, safeRegion) : null;
  const image = filteredCell
    ? sharp(filteredCell.buffer).ensureAlpha().extract(filteredCell.bounds)
    : sharp(sourcePath).ensureAlpha().extract(safeRegion);
  const input = await image
      .resize(innerWidth, innerHeight, {
        fit: "contain",
        background: TRANSPARENT,
      })
      .png()
      .toBuffer();
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: TRANSPARENT,
    },
  })
    .composite([{
      input,
      left: Math.round((width - innerWidth) / 2),
      top: Math.round((height - innerHeight) / 2),
    }])
    .png()
    .toFile(publicPath);
}

async function extractSourceCell({
  sourcePath,
  publicPath,
  columns,
  rows,
  col,
  row,
  width,
  height,
  fit = "contain",
}) {
  const metadata = await sharp(sourcePath).metadata();
  await extractSourceRegion({
    sourcePath,
    publicPath,
    region: cellRegion(metadata, columns, rows, col, row),
    width,
    height,
    fit,
  });
}

function svgRoot(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="${KEY_HEX}"/>
${body}
</svg>`;
}

async function chromaKeyToTransparent(buffer) {
  const image = sharp(buffer).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const keyDistance = Math.max(
      Math.abs(r - KEY_RGB.r),
      Math.abs(g - KEY_RGB.g),
      Math.abs(b - KEY_RGB.b),
    );
    if (keyDistance <= 16) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    }
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function renderKeyedAsset({ width, height, body, publicPath, tmpName }) {
  const keyedBuffer = await sharp(Buffer.from(svgRoot(width, height, body))).png().toBuffer();
  const transparentBuffer = await chromaKeyToTransparent(keyedBuffer);
  await fs.writeFile(path.join(TMP_DIR, tmpName), keyedBuffer);
  await fs.writeFile(publicPath, transparentBuffer);
}

function pot(cx, base, width, height, fill, accent = "#f5d18a") {
  const left = cx - width / 2;
  const top = base - height;
  return `
  <path d="M${left + 8} ${top + 14} L${left + width - 8} ${top + 14} L${left + width - 18} ${base} L${left + 18} ${base} Z" fill="${fill}"/>
  <rect x="${left}" y="${top}" width="${width}" height="22" rx="8" fill="${accent}"/>
  <ellipse cx="${cx}" cy="${top + 13}" rx="${width * 0.43}" ry="9" fill="#3a251b" opacity="0.82"/>
  <path d="M${left + 18} ${top + 37} Q${cx} ${top + 47} ${left + width - 18} ${top + 37}" stroke="#fff3cd" stroke-width="4" opacity="0.28" fill="none"/>`;
}

function leaf(cx, cy, rx, ry, fill, rotate = 0) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" transform="rotate(${rotate} ${cx} ${cy})"/>`;
}

function petalFlower(cx, cy, radius, fill, center = "#f6c85d") {
  const petals = Array.from({ length: 7 }, (_item, index) => {
    const angle = (Math.PI * 2 * index) / 7;
    const px = cx + Math.cos(angle) * radius * 0.62;
    const py = cy + Math.sin(angle) * radius * 0.62;
    return leaf(px, py, radius * 0.33, radius * 0.18, fill, angle * 180 / Math.PI);
  }).join("");
  return `${petals}<circle cx="${cx}" cy="${cy}" r="${radius * 0.22}" fill="${center}"/>`;
}

function drawGenericLeaves(cx, top, base, phase, fill, accent) {
  const count = 3 + phase * 3;
  return Array.from({ length: count }, (_item, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    const side = index % 2 ? 1 : -1;
    const y = base - 34 - t * (base - top);
    const x = cx + side * (14 + t * 28);
    return leaf(x, y, 13 + phase * 2, 7 + phase, index % 3 === 0 ? accent : fill, side * (26 + t * 24));
  }).join("");
}

function drawPlant(family, phase, index) {
  const col = (index % 2) * GARDEN.phases + phase;
  const row = Math.floor(index / 2);
  const x0 = col * GARDEN.cellWidth;
  const y0 = row * GARDEN.cellHeight;
  const cx = x0 + GARDEN.cellWidth / 2;
  const base = y0 + 214;
  const scale = 0.72 + phase * 0.12;
  const potWidth = 54 + phase * 8;
  const potHeight = 34 + phase * 4;
  const stemTop = base - 62 - phase * 22;
  const stem = `<path d="M${cx} ${base - potHeight + 6} C${cx - 10} ${stemTop + 48} ${cx + 12} ${stemTop + 22} ${cx} ${stemTop}" stroke="#5d3b24" stroke-width="${4 + phase}" fill="none" stroke-linecap="round"/>`;
  let crown;

  switch (family.id) {
    case "daisy":
      crown = drawGenericLeaves(cx, stemTop + 14, base - potHeight, phase, family.leaf, "#87c46f")
        + Array.from({ length: Math.max(1, phase + 1) }, (_item, i) => petalFlower(cx - phase * 7 + i * 14, stemTop + 4 + i * 4, 15, family.accent)).join("");
      break;
    case "lavender":
      crown = drawGenericLeaves(cx, stemTop + 18, base - potHeight, phase, family.leaf, "#87b882")
        + Array.from({ length: 3 + phase }, (_item, i) => {
          const x = cx - 20 + i * (40 / Math.max(1, phase + 2));
          return `<path d="M${x} ${base - potHeight + 4} L${x - 2} ${stemTop}" stroke="#587c59" stroke-width="3" stroke-linecap="round"/>
          ${Array.from({ length: 5 }, (_n, j) => `<ellipse cx="${x + (j % 2 ? 3 : -3)}" cy="${stemTop + j * 9}" rx="5" ry="8" fill="${family.accent}" transform="rotate(${j % 2 ? 24 : -24} ${x} ${stemTop + j * 9})"/>`).join("")}`;
        }).join("");
      break;
    case "monstera":
      crown = Array.from({ length: 4 + phase }, (_item, i) => {
        const angle = -50 + i * (100 / (3 + phase));
        const x = cx + Math.cos(angle * Math.PI / 180) * (18 + phase * 8);
        const y = stemTop + 28 + Math.sin(angle * Math.PI / 180) * 16;
        return `<path d="M${x} ${y - 26} C${x + 26} ${y - 28} ${x + 31} ${y + 8} ${x + 5} ${y + 22} C${x - 20} ${y + 12} ${x - 18} ${y - 16} ${x} ${y - 26}Z" fill="${i % 2 ? family.accent : family.leaf}" transform="rotate(${angle / 4} ${x} ${y})"/>`;
      }).join("");
      break;
    case "succulent":
      crown = Array.from({ length: 14 + phase * 5 }, (_item, i) => {
        const ring = i / (14 + phase * 5);
        const angle = ring * Math.PI * 2;
        const dist = 10 + (i % 5) * (3 + phase);
        return leaf(cx + Math.cos(angle) * dist, stemTop + 36 + Math.sin(angle) * dist * 0.5, 18, 7, i % 2 ? family.leaf : family.accent, angle * 180 / Math.PI);
      }).join("");
      break;
    case "pothos":
    case "string_of_pearls":
      crown = `<path d="M${cx - 34} ${y0 + 40} C${cx - 22} ${y0 + 20} ${cx + 22} ${y0 + 20} ${cx + 34} ${y0 + 40}" stroke="#d8c5a1" stroke-width="3" fill="none"/>
      <line x1="${cx - 24}" y1="${y0 + 34}" x2="${cx - 24}" y2="${base - 86}" stroke="#d8c5a1" stroke-width="3"/>
      <line x1="${cx + 24}" y1="${y0 + 34}" x2="${cx + 24}" y2="${base - 86}" stroke="#d8c5a1" stroke-width="3"/>`;
      crown += Array.from({ length: 4 + phase * 3 }, (_item, i) => {
        const x = cx - 28 + (i % 4) * 18 + (i % 2) * 5;
        const y = base - 82 + Math.floor(i / 4) * 27;
        if (family.id === "string_of_pearls") {
          return `<path d="M${x} ${base - 84} C${x - 8} ${y + 8} ${x + 6} ${y + 30} ${x - 3} ${y + 48}" stroke="#79ad76" stroke-width="2" fill="none"/>
          <circle cx="${x - 3}" cy="${y + 18}" r="${5 + phase}" fill="${i % 2 ? family.leaf : family.accent}"/>`;
        }
        return `<path d="M${x} ${base - 84} C${x - 16} ${y + 10} ${x + 14} ${y + 25} ${x - 4} ${y + 52}" stroke="#4f8b4d" stroke-width="3" fill="none"/>
        ${leaf(x - 3, y + 22, 11, 8, i % 2 ? family.leaf : family.accent, i % 2 ? -28 : 30)}`;
      }).join("");
      break;
    case "bonsai":
      crown = `<path d="M${cx - 4} ${base - potHeight + 2} C${cx - 22} ${stemTop + 48} ${cx + 28} ${stemTop + 34} ${cx + 2} ${stemTop}" stroke="#6b3d22" stroke-width="${8 + phase}" fill="none" stroke-linecap="round"/>
      ${Array.from({ length: 4 + phase }, (_item, i) => {
        const x = cx - 34 + (i % 3) * 32;
        const y = stemTop + 8 + Math.floor(i / 3) * 18;
        return `<ellipse cx="${x}" cy="${y}" rx="${26 + phase * 5}" ry="${18 + phase * 3}" fill="${i % 2 ? family.accent : family.leaf}"/>`;
      }).join("")}`;
      break;
    case "orchid":
      crown = drawGenericLeaves(cx, stemTop + 44, base - potHeight, phase, family.leaf, "#6fa172")
        + Array.from({ length: 2 + phase }, (_item, i) => {
          const x = cx - 20 + i * (40 / Math.max(1, phase + 1));
          const y = stemTop + i * 8;
          return `<path d="M${cx} ${base - potHeight} C${x} ${stemTop + 54} ${x} ${stemTop + 28} ${x} ${y}" stroke="#6f815e" stroke-width="3" fill="none"/>
          ${petalFlower(x, y, 20, family.accent, "#ffe6a2")}`;
        }).join("");
      break;
    case "venus_flytrap":
      crown = drawGenericLeaves(cx, stemTop + 18, base - potHeight, phase, family.leaf, "#9ace65")
        + Array.from({ length: 2 + phase }, (_item, i) => {
          const x = cx - 26 + i * (52 / Math.max(1, phase + 1));
          const y = stemTop + 16 + i * 8;
          return `<path d="M${cx} ${base - potHeight + 4} C${x} ${stemTop + 62} ${x} ${stemTop + 36} ${x} ${y}" stroke="#629045" stroke-width="3" fill="none"/>
          <path d="M${x - 22} ${y} Q${x} ${y - 24} ${x + 22} ${y} Q${x} ${y + 20} ${x - 22} ${y}Z" fill="${family.accent}"/>
          <path d="M${x - 18} ${y} Q${x} ${y - 14} ${x + 18} ${y}" stroke="#fff1c9" stroke-width="3" fill="none"/>`;
        }).join("");
      break;
    case "moon_cactus":
      crown = `<rect x="${cx - 16 - phase * 2}" y="${stemTop + 18}" width="${32 + phase * 4}" height="${70 + phase * 15}" rx="${16 + phase * 2}" fill="${family.leaf}"/>
      <path d="M${cx} ${stemTop + 22} L${cx} ${stemTop + 88 + phase * 14}" stroke="#d9f1ac" stroke-width="3" opacity="0.55"/>
      <circle cx="${cx}" cy="${stemTop + 10}" r="${18 + phase * 5}" fill="${family.accent}"/>
      <circle cx="${cx - 8}" cy="${stemTop + 4}" r="${5 + phase}" fill="#ffd36f" opacity="0.8"/>`;
      break;
    case "fern":
      crown = Array.from({ length: 5 + phase * 2 }, (_item, i) => {
        const angle = -62 + i * (124 / (4 + phase * 2));
        const length = 48 + phase * 16;
        const x2 = cx + Math.cos(angle * Math.PI / 180) * length;
        const y2 = base - potHeight - 8 + Math.sin(angle * Math.PI / 180) * length * 0.6;
        const frondLeaves = Array.from({ length: 6 }, (_n, j) => {
          const t = (j + 1) / 7;
          const lx = cx + (x2 - cx) * t;
          const ly = base - potHeight - 8 + (y2 - (base - potHeight - 8)) * t;
          return `${leaf(lx - 5, ly, 9, 3, family.leaf, angle - 38)}${leaf(lx + 5, ly, 9, 3, family.accent, angle + 38)}`;
        }).join("");
        return `<path d="M${cx} ${base - potHeight - 8} C${cx} ${stemTop + 50} ${x2} ${stemTop + 35} ${x2} ${y2}" stroke="#4d8b56" stroke-width="3" fill="none"/>${frondLeaves}`;
      }).join("");
      break;
    default:
      crown = stem + drawGenericLeaves(cx, stemTop, base - potHeight, phase, family.leaf, family.accent);
      break;
  }

  const maybeStem = ["bonsai", "succulent", "pothos", "string_of_pearls", "moon_cactus", "fern", "monstera"].includes(family.id) ? "" : stem;
  return `<g transform="translate(0 0) scale(${scale} ${scale}) translate(${cx * (1 / scale - 1)} ${base * (1 / scale - 1)})">
    ${maybeStem}
    ${crown}
    ${pot(cx, base, potWidth, potHeight, family.pot, family.accent)}
  </g>`;
}

function gardenSheetSvg() {
  return plantFamilies.map((family, index) => (
    Array.from({ length: GARDEN.phases }, (_item, phase) => drawPlant(family, phase, index)).join("")
  )).join("\n");
}

function gardenSpriteFrames() {
  const frames = [];
  plantFamilies.forEach((_family, index) => {
    for (let phase = 0; phase < GARDEN.phases; phase += 1) {
      const col = (index % 2) * GARDEN.phases + phase;
      const row = Math.floor(index / 2);
      const usesFullCell = index >= 8;
      frames.push({
        col,
        row,
        x: Math.round(col * GARDEN.cellWidth + (usesFullCell ? 0 : GARDEN.frameInsetX)),
        y: Math.round(row * GARDEN.cellHeight + (usesFullCell ? 0 : GARDEN.frameInsetY)),
        width: usesFullCell ? Math.round(GARDEN.cellWidth) : GARDEN.frameWidth,
        height: usesFullCell ? Math.round(GARDEN.cellHeight) : GARDEN.frameHeight,
      });
    }
  });
  return frames;
}

async function generateGardenAssets() {
  if ((await useExistingGardenTopRows()) && (await useImagegenGardenFamilySources())) {
    const transparentBuffer = await composeGardenFamilyRuntimeSheet();
    await keyTransparentSheet(transparentBuffer, path.join(GARDEN_DIR, "plants_sheet.png"), GARDEN.width, GARDEN.height);
    await fs.writeFile(path.join(GARDEN_DIR, "plants_sheet_clean.png"), transparentBuffer);
    await fs.writeFile(path.join(GARDEN_DIR, "assets_transparent.png"), transparentBuffer);
    await fs.writeFile(
      path.join(GARDEN_DIR, "sprites.json"),
      `${JSON.stringify({ fullWidth: GARDEN.width, fullHeight: GARDEN.height, sprites: gardenSpriteFrames() }, null, 2)}\n`,
    );
    return "imagegen-family";
  }

  const keyedBuffer = await sharp(Buffer.from(svgRoot(GARDEN.width, GARDEN.height, gardenSheetSvg()))).png().toBuffer();
  const transparentBuffer = await chromaKeyToTransparent(keyedBuffer);
  await fs.writeFile(path.join(TMP_DIR, "garden-shelf-expanded-14-plants-key.png"), keyedBuffer);
  await fs.writeFile(path.join(GARDEN_DIR, "plants_sheet.png"), keyedBuffer);
  await fs.writeFile(path.join(GARDEN_DIR, "plants_sheet_clean.png"), transparentBuffer);
  await fs.writeFile(path.join(GARDEN_DIR, "assets_transparent.png"), transparentBuffer);
  await fs.writeFile(
    path.join(GARDEN_DIR, "sprites.json"),
    `${JSON.stringify({ fullWidth: GARDEN.width, fullHeight: GARDEN.height, sprites: gardenSpriteFrames() }, null, 2)}\n`,
  );
  return "procedural";
}

function gemPiece(type, fill, accent, detail) {
  return `<g>
  <circle cx="72" cy="76" r="48" fill="${fill}"/>
  <circle cx="56" cy="55" r="14" fill="#fff8e9" opacity="0.38"/>
  <path d="M37 88 C46 120 99 124 112 86" stroke="#2d1d20" stroke-width="6" opacity="0.18" fill="none"/>
  ${detail}
  <circle cx="72" cy="76" r="51" fill="none" stroke="${accent}" stroke-width="6" opacity="0.92"/>
  <circle cx="72" cy="76" r="60" fill="none" stroke="#fff8e9" stroke-width="3" opacity="0.24"/>
</g>`;
}

function simpleAssetBody(kind) {
  switch (kind) {
    case "piece-dragon":
      return gemPiece("dragon", "#e55d42", "#ffc861", `<path d="M49 73 C56 47 82 47 94 67 C79 63 70 75 62 94 C57 88 52 82 49 73Z" fill="#ffd18c"/><path d="M91 55 L116 39 L106 69Z" fill="#ff8f57"/>`);
    case "piece-frog":
      return gemPiece("frog", "#56b783", "#aaf0ca", `<circle cx="56" cy="56" r="7" fill="#243326"/><circle cx="89" cy="56" r="7" fill="#243326"/><path d="M51 88 Q72 102 94 88" stroke="#243326" stroke-width="5" fill="none" stroke-linecap="round"/>`);
    case "piece-newt":
      return gemPiece("newt", "#8ac36c", "#f3d36e", `<path d="M43 85 C62 54 93 54 105 82 C83 76 64 84 45 106Z" fill="#4c7f50"/><circle cx="92" cy="72" r="6" fill="#fff3b4"/>`);
    case "piece-snake":
      return gemPiece("snake", "#8dcfd4", "#f7f1c8", `<path d="M48 91 C91 118 100 46 62 59 C42 66 47 84 72 82" stroke="#315f65" stroke-width="11" fill="none" stroke-linecap="round"/><circle cx="61" cy="56" r="5" fill="#fff4b7"/>`);
    case "piece-spider":
      return gemPiece("spider", "#d9b86d", "#fff0a4", `<circle cx="72" cy="76" r="20" fill="#47362f"/><circle cx="72" cy="51" r="12" fill="#47362f"/><path d="M48 71 L24 58 M50 82 L24 91 M96 71 L120 58 M94 82 L120 91" stroke="#47362f" stroke-width="5" stroke-linecap="round"/>`);
    case "piece-yeti":
      return gemPiece("yeti", "#8b72c9", "#d8cff5", `<path d="M45 88 C43 52 101 48 101 91 C91 112 57 112 45 88Z" fill="#f1f0ff"/><circle cx="62" cy="76" r="5" fill="#332a4c"/><circle cx="84" cy="76" r="5" fill="#332a4c"/><path d="M61 91 Q72 99 84 91" stroke="#332a4c" stroke-width="4" fill="none"/>`);
    case "special-row":
      return `<g><circle cx="72" cy="72" r="52" fill="#b76044"/><path d="M28 72 H116" stroke="#ffd36b" stroke-width="18" stroke-linecap="round"/><path d="M31 72 H113" stroke="#fff8d6" stroke-width="7" stroke-linecap="round"/><circle cx="72" cy="72" r="58" fill="none" stroke="#ffd36b" stroke-width="5"/></g>`;
    case "special-column":
      return `<g><circle cx="72" cy="72" r="52" fill="#4f8ba8"/><path d="M72 28 V116" stroke="#bdf0ff" stroke-width="18" stroke-linecap="round"/><path d="M72 31 V113" stroke="#fff8d6" stroke-width="7" stroke-linecap="round"/><circle cx="72" cy="72" r="58" fill="none" stroke="#bdf0ff" stroke-width="5"/></g>`;
    case "special-blast":
      return `<g><circle cx="72" cy="72" r="52" fill="#b84b59"/><path d="M72 18 L83 55 L122 45 L93 73 L121 101 L82 91 L72 128 L61 91 L23 101 L51 73 L22 45 L61 55Z" fill="#ffd36b"/><circle cx="72" cy="72" r="18" fill="#fff4c3"/></g>`;
    case "special-colour":
      return `<g><circle cx="72" cy="72" r="54" fill="#3a2a49"/><path d="M72 20 L122 72 L72 124 L22 72Z" fill="#d8cff5"/><path d="M72 20 L122 72 H72Z" fill="#f36f68"/><path d="M122 72 L72 124 V72Z" fill="#65c89c"/><path d="M72 124 L22 72 H72Z" fill="#f7c75d"/><path d="M22 72 L72 20 V72Z" fill="#86c8e8"/></g>`;
    case "drop-gold":
      return `<g><circle cx="72" cy="72" r="48" fill="#e9b64e"/><circle cx="72" cy="72" r="34" fill="#ffd978"/><path d="M58 88 C68 96 88 92 90 76 C92 57 61 59 58 72 C55 83 75 83 84 72" stroke="#8b572f" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="53" cy="50" r="8" fill="#fff1a7" opacity="0.75"/></g>`;
    case "drop-seeds":
      return `<g><circle cx="72" cy="72" r="48" fill="#5aa45e"/><path d="M52 85 C42 58 70 39 94 51 C103 78 78 103 52 85Z" fill="#c9e66d"/><path d="M54 82 C66 70 76 60 93 52" stroke="#56823b" stroke-width="5" fill="none"/><circle cx="64" cy="70" r="4" fill="#7d5b32"/><circle cx="78" cy="62" r="4" fill="#7d5b32"/></g>`;
    case "drop-energy":
      return `<g><circle cx="72" cy="72" r="48" fill="#4ba2bd"/><path d="M76 22 L43 78 H70 L61 122 L103 61 H77Z" fill="#d9fbff"/><path d="M78 29 L55 71 H79 L72 104 L96 65 H73Z" fill="#77d7ed"/></g>`;
    case "shelf-block":
      return `<g><rect x="5" y="5" width="118" height="118" rx="22" fill="#3a2922"/><rect x="14" y="14" width="100" height="100" rx="18" fill="#66412e"/><path d="M19 36 C48 25 79 49 111 35 M16 72 C51 64 76 86 113 74 M22 101 C53 93 82 111 110 97" stroke="#bd8153" stroke-width="7" opacity="0.52" fill="none"/></g>`;
    case "background-table":
      return `<g><rect width="512" height="512" fill="#2e211e"/><path d="M0 68 H512 M0 151 H512 M0 238 H512 M0 326 H512 M0 424 H512" stroke="#6e4632" stroke-width="8" opacity="0.44"/><path d="M72 0 V512 M201 0 V512 M348 0 V512" stroke="#1f1715" stroke-width="6" opacity="0.34"/><circle cx="402" cy="110" r="58" fill="none" stroke="#c99f5b" stroke-width="3" opacity="0.22"/><path d="M80 355 C140 315 204 393 270 344 C328 302 381 351 444 316" stroke="#75c89e" stroke-width="5" opacity="0.16" fill="none"/></g>`;
    case "board-frame":
      return `<g><rect x="24" y="24" width="672" height="672" rx="46" fill="#241817"/><rect x="44" y="44" width="632" height="632" rx="38" fill="#b06c3f"/><rect x="72" y="72" width="576" height="576" rx="26" fill="${KEY_HEX}"/><path d="M70 44 H650 M70 676 H650 M44 70 V650 M676 70 V650" stroke="#f2c768" stroke-width="15" stroke-linecap="round" opacity="0.85"/><circle cx="72" cy="72" r="24" fill="#72bd97"/><circle cx="648" cy="72" r="24" fill="#c85e75"/><circle cx="72" cy="648" r="24" fill="#86c6dd"/><circle cx="648" cy="648" r="24" fill="#e7bb59"/></g>`;
    case "cell-empty":
      return `<g><rect x="9" y="9" width="110" height="110" rx="20" fill="#4a302d"/><rect x="17" y="17" width="94" height="94" rx="16" fill="#6d4736"/><path d="M27 34 H101 M27 94 H101" stroke="#d1a460" stroke-width="5" opacity="0.34"/></g>`;
    case "cell-selected":
      return `<g><rect x="9" y="9" width="110" height="110" rx="22" fill="${KEY_HEX}"/><rect x="15" y="15" width="98" height="98" rx="18" fill="none" stroke="#ffe087" stroke-width="9"/><rect x="27" y="27" width="74" height="74" rx="14" fill="none" stroke="#fff8d6" stroke-width="4" opacity="0.86"/></g>`;
    case "hud-bar":
      return `<g><rect x="16" y="16" width="868" height="128" rx="34" fill="#241817"/><rect x="34" y="28" width="832" height="104" rx="28" fill="#493126"/><path d="M56 43 H844" stroke="#f0c66a" stroke-width="6" opacity="0.48"/><path d="M76 118 H824" stroke="#78c69b" stroke-width="5" opacity="0.26"/><circle cx="64" cy="80" r="22" fill="#e9b957"/><circle cx="836" cy="80" r="22" fill="#c65c76"/></g>`;
    case "menu-panel":
      return `<g><rect x="24" y="24" width="572" height="712" rx="46" fill="#211716"/><rect x="44" y="44" width="532" height="672" rx="38" fill="#3b2924"/><path d="M74 82 H546 M74 672 H546" stroke="#e6b95d" stroke-width="8" opacity="0.58"/><path d="M78 134 C178 98 255 154 336 116 C415 80 469 132 544 108" stroke="#78c69b" stroke-width="6" opacity="0.24" fill="none"/><circle cx="86" cy="86" r="18" fill="#78c69b"/><circle cx="534" cy="86" r="18" fill="#c65c76"/><circle cx="86" cy="674" r="18" fill="#86c6dd"/><circle cx="534" cy="674" r="18" fill="#e6b95d"/></g>`;
    case "fx-clear-burst":
      return `<g><path d="M128 10 L145 87 L217 47 L177 118 L247 128 L177 139 L217 209 L145 169 L128 246 L111 169 L39 209 L79 139 L9 128 L79 118 L39 47 L111 87Z" fill="#ffd76f" opacity="0.72"/><circle cx="128" cy="128" r="48" fill="#fff5c9" opacity="0.62"/><circle cx="128" cy="128" r="82" fill="none" stroke="#76d3a4" stroke-width="8" opacity="0.46"/></g>`;
    default:
      return `<g><circle cx="72" cy="72" r="48" fill="#e9b957"/></g>`;
  }
}

async function generateMatch3Assets() {
  if (await useImagegenMatch3Sources()) {
    const pieceRegions = await detectGridSpriteRegions(imagegenSources.match3Pieces, 3, 2);
    const normalPieces = [
      ["piece-dragon.png", 0, 0],
      ["piece-frog.png", 1, 0],
      ["piece-newt.png", 2, 0],
      ["piece-snake.png", 0, 1],
      ["piece-spider.png", 1, 1],
      ["piece-yeti.png", 2, 1],
    ];
    for (const [fileName, col, row] of normalPieces) {
      await extractSourceRegionContained({
        sourcePath: imagegenSources.match3Pieces,
        publicPath: path.join(MATCH3_DIR, fileName),
        region: pieceRegions[row * 3 + col],
        width: 144,
        height: 144,
        contentScale: 0.88,
        filterComponents: true,
      });
    }

    const specialDropRegions = await detectGridSpriteRegions(imagegenSources.match3SpecialsDrops, 4, 2);
    const specialsDrops = [
      ["special-row.png", 0, 0, 144, 144],
      ["special-column.png", 1, 0, 144, 144],
      ["special-blast.png", 2, 0, 144, 144],
      ["special-colour.png", 3, 0, 144, 144],
      ["drop-gold.png", 0, 1, 144, 144],
      ["drop-seeds.png", 1, 1, 144, 144],
      ["drop-energy.png", 2, 1, 144, 144],
      ["fx-clear-burst.png", 3, 1, 256, 256],
    ];
    for (const [fileName, col, row, width, height] of specialsDrops) {
      await extractSourceRegionContained({
        sourcePath: imagegenSources.match3SpecialsDrops,
        publicPath: path.join(MATCH3_DIR, fileName),
        region: specialDropRegions[row * 4 + col],
        width,
        height,
        contentScale: fileName === "fx-clear-burst.png" ? 0.94 : 0.88,
        filterComponents: fileName !== "fx-clear-burst.png",
      });
    }

    await extractSourceRegion({
      sourcePath: imagegenSources.match3BackgroundTable,
      publicPath: path.join(MATCH3_DIR, "background-table.png"),
      region: { left: 150, top: 150, width: 954, height: 954 },
      width: 512,
      height: 512,
      fit: "cover",
      trim: false,
    });

    const { components: uiComponents, info: uiInfo } = await detectAlphaComponents(imagegenSources.match3Ui, 1000);
    const findUi = (predicate, fallback, pad = 28) => {
      const component = uiComponents
        .filter(predicate)
        .sort((a, b) => b.area - a.area)[0];
      return component ? paddedRegion(component, uiInfo, pad) : fallback;
    };
    const uiRegions = [
      ["hud-bar.png", findUi((component) => component.width > 800 && component.height < 340 && component.top < 120, { left: 0, top: 0, width: 1220, height: 300 }), 900, 160, 0.94],
      ["board-frame.png", findUi((component) => component.width > 520 && component.height > 520 && component.left < uiInfo.width * 0.5, { left: 50, top: 320, width: 690, height: 690 }), 720, 720, 0.94],
      ["menu-panel.png", findUi((component) => component.height > 520 && component.left > uiInfo.width * 0.45 && component.left < uiInfo.width * 0.78, { left: 740, top: 290, width: 400, height: 730 }), 620, 760, 0.94],
      ["cell-empty.png", findUi((component) => component.left > uiInfo.width * 0.72 && component.top < uiInfo.height * 0.5 && component.width < 280 && component.height < 280, { left: 1180, top: 260, width: 280, height: 260 }, 10), 128, 128, 0.86],
      ["cell-selected.png", findUi((component) => component.left > uiInfo.width * 0.72 && component.top >= uiInfo.height * 0.45 && component.top < uiInfo.height * 0.72 && component.width < 300 && component.height < 300, { left: 1180, top: 480, width: 280, height: 280 }, 10), 128, 128, 0.86],
      ["shelf-block.png", findUi((component) => component.left > uiInfo.width * 0.72 && component.top >= uiInfo.height * 0.68 && component.width < 320 && component.height < 320, { left: 1160, top: 720, width: 320, height: 290 }, 10), 128, 128, 0.86],
    ];
    for (const [fileName, region, width, height, contentScale] of uiRegions) {
      await extractSourceRegionContained({
        sourcePath: imagegenSources.match3Ui,
        publicPath: path.join(MATCH3_DIR, fileName),
        region,
        width,
        height,
        contentScale,
      });
    }
    return "imagegen";
  }

  const assets = [
    ["piece-dragon.png", 144, 144, "piece-dragon"],
    ["piece-frog.png", 144, 144, "piece-frog"],
    ["piece-newt.png", 144, 144, "piece-newt"],
    ["piece-snake.png", 144, 144, "piece-snake"],
    ["piece-spider.png", 144, 144, "piece-spider"],
    ["piece-yeti.png", 144, 144, "piece-yeti"],
    ["special-row.png", 144, 144, "special-row"],
    ["special-column.png", 144, 144, "special-column"],
    ["special-blast.png", 144, 144, "special-blast"],
    ["special-colour.png", 144, 144, "special-colour"],
    ["shelf-block.png", 128, 128, "shelf-block"],
    ["background-table.png", 512, 512, "background-table"],
    ["board-frame.png", 720, 720, "board-frame"],
    ["cell-empty.png", 128, 128, "cell-empty"],
    ["cell-selected.png", 128, 128, "cell-selected"],
    ["hud-bar.png", 900, 160, "hud-bar"],
    ["menu-panel.png", 620, 760, "menu-panel"],
    ["fx-clear-burst.png", 256, 256, "fx-clear-burst"],
    ["drop-gold.png", 144, 144, "drop-gold"],
    ["drop-seeds.png", 144, 144, "drop-seeds"],
    ["drop-energy.png", 144, 144, "drop-energy"],
  ];

  for (const [fileName, width, height, kind] of assets) {
    await renderKeyedAsset({
      width,
      height,
      body: simpleAssetBody(kind),
      publicPath: path.join(MATCH3_DIR, fileName),
      tmpName: `match3-${fileName.replace(/\.png$/, "")}-key.png`,
    });
  }
  return "procedural";
}

await ensureDirs();
const gardenSourceMode = await generateGardenAssets();
const match3SourceMode = await generateMatch3Assets();
await writeImagegenManifest({ garden: gardenSourceMode, match3: match3SourceMode });

console.log(JSON.stringify({
  gardenSheet: ensurePosix(path.relative(ROOT, path.join(GARDEN_DIR, "assets_transparent.png"))),
  gardenPlants: plantFamilies.map((family) => family.id),
  match3Assets: 21,
  keyedPreviewDir: ensurePosix(path.relative(ROOT, TMP_DIR)),
  sourceMode: { garden: gardenSourceMode, match3: match3SourceMode },
}, null, 2));
