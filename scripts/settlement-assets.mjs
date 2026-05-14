import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

import {
  BUILDING_ASSETS,
  VFX_ASSETS,
  trimmedAsset,
} from "../src/games/settlement/assetRegistry.js";
import { PROPS } from "../src/games/settlement/gameData.js";

const rootDir = process.cwd();
const settlementDir = path.join(rootDir, "public", "games", "settlement");
const processedDir = path.join(settlementDir, "processed");
const processedManifestPath = path.join(processedDir, "processed-manifest.json");
const alphaThreshold = 10;
const lossyWebpOptions = {
  quality: 92,
  alphaQuality: 100,
  effort: 3,
  smartSubsample: false,
};
const losslessWebpOptions = {
  lossless: true,
  effort: 3,
};
const maxCleanEncodePasses = 4;

function isMagentaLike(r, g, b, a) {
  return a > 12 && r > 180 && b > 180 && g < 150 && Math.abs(r - b) < 90 && (r + b - g * 1.2) > 260;
}

function isGreenLike(r, g, b, a) {
  return a > 12 && g > 150 && r < 170 && b < 170 && (g - Math.max(r, b)) > 35;
}

function isChromaPixel(r, g, b, a) {
  return isMagentaLike(r, g, b, a) || isGreenLike(r, g, b, a);
}

function publicUrlToFile(url) {
  if (!url?.startsWith("/games/settlement/")) {
    throw new Error(`Unsupported Settlement asset URL: ${url}`);
  }
  return path.join(settlementDir, url.slice("/games/settlement/".length).replaceAll("/", path.sep));
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readRawImage(file) {
  const input = await fs.readFile(file);
  return readRawBuffer(input);
}

async function readRawBuffer(input) {
  const image = sharp(input).ensureAlpha();
  const metadata = await image.metadata();
  const data = await image.raw().toBuffer();
  return {
    data,
    width: metadata.width,
    height: metadata.height,
  };
}

function scrubChroma(data) {
  let removed = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (isChromaPixel(data[index], data[index + 1], data[index + 2], data[index + 3])) {
      data[index + 3] = 0;
      removed += 1;
    }
  }
  return removed;
}

function countChromaLeaks(data) {
  let leakCount = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (isChromaPixel(data[index], data[index + 1], data[index + 2], data[index + 3])) {
      leakCount += 1;
    }
  }
  return leakCount;
}

function alphaBounds(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha <= alphaThreshold) continue;
    const pixel = index / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  if (maxX < minX || maxY < minY) return null;
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    rightPadding: width - 1 - maxX,
    bottomPadding: height - 1 - maxY,
  };
}

async function encodeRawWebp({ data, width, height }) {
  let nextRaw = { data: Buffer.from(data), width, height };

  for (let pass = 0; pass < maxCleanEncodePasses; pass += 1) {
    const candidate = await encodeRawWebpWithOptions(nextRaw, lossyWebpOptions);
    const decoded = await readRawBuffer(candidate);
    const leakCount = countChromaLeaks(decoded.data);
    if (!leakCount) return candidate;
    scrubChroma(decoded.data);
    nextRaw = decoded;
  }

  return encodeRawWebpWithOptions(nextRaw, losslessWebpOptions);
}

async function encodeRawWebpWithOptions({ data, width, height }, options) {
  return sharp(data, { raw: { width, height, channels: 4 } })
    .webp(options)
    .toBuffer();
}

async function writeIfChanged(file, buffer) {
  if (await fileExists(file)) {
    const current = await fs.readFile(file);
    if (Buffer.compare(current, buffer) === 0) return false;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempFile, buffer);
  await fs.rm(file, { force: true });
  await fs.rename(tempFile, file);
  return true;
}

async function cleanTopLevelWebps() {
  const files = (await fs.readdir(settlementDir))
    .filter((file) => file.endsWith(".webp"))
    .sort();
  const cleaned = [];
  const unchanged = [];

  for (const file of files) {
    const absolutePath = path.join(settlementDir, file);
    const raw = await readRawImage(absolutePath);
    const removed = scrubChroma(raw.data);
    const encoded = await encodeRawWebp(raw);
    const changed = await writeIfChanged(absolutePath, encoded);
    if (!removed && !changed) {
      unchanged.push(file);
      continue;
    }
    cleaned.push({ file, chromaRemoved: removed, changed });
  }

  return { total: files.length, cleaned, unchanged: unchanged.length };
}

function trimSourceUrls() {
  return [...new Set([
    ...BUILDING_ASSETS,
    ...PROPS.map((prop) => prop.image),
    VFX_ASSETS.selectionRing,
    VFX_ASSETS.buildingUpgradeGlow,
    VFX_ASSETS.levelupRays,
  ])].sort();
}

async function generateTrimmedTextures() {
  const sources = trimSourceUrls();
  const generated = [];

  for (const url of sources) {
    const sourcePath = publicUrlToFile(url);
    const outputUrl = trimmedAsset(url);
    const outputPath = publicUrlToFile(outputUrl);
    const raw = await readRawImage(sourcePath);
    const chromaRemoved = scrubChroma(raw.data);
    const bounds = alphaBounds(raw.data, raw.width, raw.height);
    if (!bounds) {
      throw new Error(`Cannot trim empty Settlement asset: ${url}`);
    }
    const extracted = await sharp(raw.data, {
      raw: { width: raw.width, height: raw.height, channels: 4 },
    })
      .extract({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height })
      .raw()
      .toBuffer();
    const encoded = await encodeRawWebp({ data: extracted, width: bounds.width, height: bounds.height });
    const changed = await writeIfChanged(outputPath, encoded);
    generated.push({
      source: url,
      output: outputUrl,
      sourceWidth: raw.width,
      sourceHeight: raw.height,
      width: bounds.width,
      height: bounds.height,
      trim: {
        left: bounds.left,
        top: bounds.top,
        right: bounds.rightPadding,
        bottom: bounds.bottomPadding,
      },
      chromaRemoved,
      changed,
    });
  }

  const manifest = {
    contract: "settlement-processed-webp-v1",
    source: "/games/settlement/*.webp",
    output: "/games/settlement/processed/*.trim.webp",
    runtime: "Settlement runtime loads WebP directly and does not run canvas chroma-key or trim work on the client.",
    topLevelWebpOnly: true,
    trimSourceCount: sources.length,
    trimmedTextures: generated,
  };
  const manifestBuffer = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const manifestChanged = await writeIfChanged(processedManifestPath, manifestBuffer);

  return { generated, manifestChanged };
}

async function scanWebps(files, { requireTightBounds = false } = {}) {
  const failures = [];
  const summaries = [];

  for (const file of files.sort()) {
    const raw = await readRawImage(file);
    const leakCount = countChromaLeaks(raw.data);

    const bounds = alphaBounds(raw.data, raw.width, raw.height);
    const tight = !bounds || (
      bounds.left === 0
      && bounds.top === 0
      && bounds.rightPadding === 0
      && bounds.bottomPadding === 0
    );
    const relative = path.relative(rootDir, file).replaceAll(path.sep, "/");
    if (leakCount || (requireTightBounds && !tight)) {
      failures.push({
        file: relative,
        leakCount,
        tight,
        bounds,
        width: raw.width,
        height: raw.height,
      });
    }
    summaries.push({ file: relative, leakCount, tight, width: raw.width, height: raw.height });
  }

  return { failures, summaries };
}

async function listFilesRecursive(dir, predicate) {
  if (!(await fileExists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursive(child, predicate));
    } else if (!predicate || predicate(child)) {
      files.push(child);
    }
  }
  return files;
}

async function audit() {
  const topLevelFiles = (await fs.readdir(settlementDir))
    .filter((file) => file.endsWith(".webp"))
    .map((file) => path.join(settlementDir, file));
  const processedFiles = await listFilesRecursive(processedDir, (file) => file.endsWith(".trim.webp"));
  const nonWebpRuntimeFiles = await listFilesRecursive(settlementDir, (file) => (
    /\.(png|jpe?g)$/i.test(file)
    && !file.includes(`${path.sep}processed${path.sep}`)
  ));
  const expectedProcessed = trimSourceUrls().map((url) => publicUrlToFile(trimmedAsset(url)));
  const missingProcessed = [];
  for (const file of expectedProcessed) {
    if (!(await fileExists(file))) {
      missingProcessed.push(path.relative(rootDir, file).replaceAll(path.sep, "/"));
    }
  }

  const topLevel = await scanWebps(topLevelFiles);
  const processed = await scanWebps(processedFiles, { requireTightBounds: true });
  const report = {
    topLevelWebpFiles: topLevelFiles.length,
    processedTrimFiles: processedFiles.length,
    expectedProcessedTrimFiles: expectedProcessed.length,
    nonWebpRuntimeFiles: nonWebpRuntimeFiles.map((file) => path.relative(rootDir, file).replaceAll(path.sep, "/")),
    missingProcessed,
    topLevelFailures: topLevel.failures,
    processedFailures: processed.failures,
  };

  const failed = Boolean(
    report.nonWebpRuntimeFiles.length
    || report.missingProcessed.length
    || report.topLevelFailures.length
    || report.processedFailures.length
  );
  return { failed, report };
}

async function main() {
  const command = process.argv[2] ?? "audit";
  if (command === "process") {
    const cleaned = await cleanTopLevelWebps();
    const trimmed = await generateTrimmedTextures();
    const { failed, report } = await audit();
    console.log(JSON.stringify({ cleaned, trimmed, audit: report }, null, 2));
    if (failed) process.exitCode = 1;
    return;
  }

  if (command === "audit") {
    const { failed, report } = await audit();
    console.log(JSON.stringify(report, null, 2));
    if (failed) process.exitCode = 1;
    return;
  }

  throw new Error(`Unknown command: ${command}. Use "process" or "audit".`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
