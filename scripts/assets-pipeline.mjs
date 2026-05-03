import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { optimize } from "svgo";

const DEFAULT_OUTPUT_ROOT = "public/assets-runtime";
const DEFAULT_CACHE_PATH = "assets-source/.asset-build-cache.json";
const CACHE_VERSION = 1;
const HASH_LENGTH = 8;

function normalizeSlashes(value) {
  return String(value || "").replace(/\\/g, "/");
}

function trimPublicPrefix(value) {
  const normalized = normalizeSlashes(value).replace(/^\/+/, "");
  return normalized.startsWith("public/") ? normalized.slice("public".length) : `/${normalized}`;
}

function assetHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex").slice(0, HASH_LENGTH);
}

function fullHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function withoutExtension(filePath) {
  return path.basename(filePath, path.extname(filePath)).replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function sortedObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([left], [right]) => left.localeCompare(right)));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

async function ensureSafeOutputRoot(rootDir, outputRoot) {
  const root = path.resolve(rootDir);
  const output = path.resolve(rootDir, outputRoot);
  const allowed = path.resolve(rootDir, "public", "assets-runtime");
  if (output !== allowed && !output.startsWith(`${allowed}${path.sep}`)) {
    throw new Error(`Refusing to clean unexpected asset output path: ${output}`);
  }
  if (!output.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Asset output path escapes project root: ${output}`);
  }
  return output;
}

function cachePath(rootDir, cacheFile) {
  return path.resolve(rootDir, cacheFile);
}

async function readBuildCache(rootDir, cacheFile) {
  try {
    const cache = JSON.parse(await fs.readFile(cachePath(rootDir, cacheFile), "utf-8"));
    if (cache?.version === CACHE_VERSION && cache.entries && typeof cache.entries === "object") {
      return cache;
    }
  } catch {
    // Missing or invalid caches are treated as a cold build.
  }
  return { version: CACHE_VERSION, entries: {} };
}

async function writeBuildCache(rootDir, cacheFile, entries) {
  const output = cachePath(rootDir, cacheFile);
  await fs.mkdir(path.dirname(output), { recursive: true });
  const payload = {
    version: CACHE_VERSION,
    entries: sortedObject(entries),
  };
  await fs.writeFile(output, `${JSON.stringify(payload, null, 2)}\n`);
}

function outputUrlToAbsolute(rootDir, url) {
  const normalized = normalizeSlashes(url).replace(/^\/+/, "");
  return path.resolve(rootDir, "public", normalized);
}

async function cacheFilesExist(rootDir, written) {
  for (const url of written || []) {
    try {
      await fs.access(outputUrlToAbsolute(rootDir, url));
    } catch {
      return false;
    }
  }
  return true;
}

async function walkOutputFiles(dir) {
  let items;
  try {
    items = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const item of items) {
    const child = path.join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...await walkOutputFiles(child));
    } else if (item.isFile()) {
      files.push(child);
    }
  }
  return files;
}

async function pruneStaleOutputFiles({ rootDir, outputRoot, keepUrls = [], extraKeepFiles = [] }) {
  const output = await ensureSafeOutputRoot(rootDir, outputRoot);
  const keep = new Set([
    ...keepUrls.map((url) => outputUrlToAbsolute(rootDir, url)),
    ...extraKeepFiles.map((file) => path.resolve(file)),
  ]);
  for (const file of await walkOutputFiles(output)) {
    if (!keep.has(path.resolve(file))) {
      await fs.rm(file, { force: true });
    }
  }
}

async function writeHashedAsset({ rootDir, outputRoot, outputDir, sourcePath, extension, buffer }) {
  const hash = assetHash(buffer);
  const fileName = `${withoutExtension(sourcePath)}.${hash}.${extension}`;
  const outputRelative = path.join(outputRoot, outputDir || "", fileName);
  const outputAbsolute = path.resolve(rootDir, outputRelative);
  await fs.mkdir(path.dirname(outputAbsolute), { recursive: true });
  await fs.writeFile(outputAbsolute, buffer);
  return trimPublicPrefix(outputRelative);
}

async function rasterMetadata(sourceAbsolute) {
  const metadata = await sharp(sourceAbsolute).metadata();
  return {
    width: metadata.width || null,
    height: metadata.height || null,
  };
}

async function optimizeRaster(sourceAbsolute, format, options = {}) {
  if (format === "webp") {
    return sharp(sourceAbsolute).webp(options.webp || { lossless: true }).toBuffer();
  }
  if (format === "png") {
    return sharp(sourceAbsolute).png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      ...(options.png || {}),
    }).toBuffer();
  }
  throw new Error(`Unsupported raster output format: ${format}`);
}

async function optimizeSvg(sourceAbsolute) {
  const input = await fs.readFile(sourceAbsolute, "utf-8");
  const result = optimize(input, {
    path: sourceAbsolute,
    plugins: [
      "preset-default",
    ],
  });
  if ("error" in result) throw new Error(result.error);
  return Buffer.from(result.data);
}

function defaultFormatsFor(source) {
  const ext = path.extname(source).toLowerCase();
  if (ext === ".svg") return ["svg"];
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") return ["webp", "png"];
  return [ext.replace(/^\./, "")];
}

function formatsForEntry(entry) {
  return entry.formats?.length ? entry.formats : defaultFormatsFor(entry.source);
}

async function sourceHash(sourceAbsolute) {
  return fullHash(await fs.readFile(sourceAbsolute));
}

function entryCacheSignature(entry, formats, hash, outputRoot) {
  return fullHash(Buffer.from(stableJson({
    version: CACHE_VERSION,
    source: normalizeSlashes(entry.source),
    sourceHash: hash,
    outputRoot: normalizeSlashes(outputRoot),
    outputDir: normalizeSlashes(entry.outputDir || path.dirname(entry.source)),
    formats,
    raster: entry.raster || null,
    type: entry.type || null,
  })));
}

async function buildEntry({ rootDir, outputRoot, entry }) {
  if (!entry?.key) throw new Error("Asset entry is missing key");
  if (!entry?.source) throw new Error(`Asset entry ${entry.key} is missing source`);

  const sourceAbsolute = path.resolve(rootDir, entry.source);
  const sourceExt = path.extname(entry.source).toLowerCase();
  const formats = formatsForEntry(entry);
  const outputDir = entry.outputDir || path.dirname(entry.source);
  const item = {
    type: entry.type || (sourceExt === ".svg" ? "svg" : "image"),
  };
  const written = [];

  if (sourceExt === ".svg") {
    const svg = await optimizeSvg(sourceAbsolute);
    const url = await writeHashedAsset({
      rootDir,
      outputRoot,
      outputDir,
      sourcePath: entry.source,
      extension: "svg",
      buffer: svg,
    });
    item.src = url;
    written.push(url);
  } else if ([".png", ".jpg", ".jpeg"].includes(sourceExt)) {
    Object.assign(item, await rasterMetadata(sourceAbsolute));
    for (const format of formats) {
      const buffer = await optimizeRaster(sourceAbsolute, format, entry.raster || {});
      const url = await writeHashedAsset({
        rootDir,
        outputRoot,
        outputDir,
        sourcePath: entry.source,
        extension: format,
        buffer,
      });
      if (!item.src) item.src = url;
      else if (!item.fallback) item.fallback = url;
      written.push(url);
    }
  } else {
    const buffer = await fs.readFile(sourceAbsolute);
    const extension = sourceExt.replace(/^\./, "");
    const url = await writeHashedAsset({
      rootDir,
      outputRoot,
      outputDir,
      sourcePath: entry.source,
      extension,
      buffer,
    });
    item.src = url;
    written.push(url);
  }

  return { key: entry.key, item, bundle: entry.bundle || null, written };
}

async function buildEntryWithCache({ rootDir, outputRoot, entry, previousCache }) {
  const sourceAbsolute = path.resolve(rootDir, entry.source);
  const formats = formatsForEntry(entry);
  const signature = entryCacheSignature(entry, formats, await sourceHash(sourceAbsolute), outputRoot);
  const cached = previousCache.entries[entry.key];

  if (
    cached?.signature === signature
    && cached.item
    && Array.isArray(cached.written)
    && await cacheFilesExist(rootDir, cached.written)
  ) {
    return {
      key: entry.key,
      item: { ...cached.item },
      bundle: entry.bundle || null,
      written: [...cached.written],
      cacheEntry: cached,
    };
  }

  const built = await buildEntry({ rootDir, outputRoot, entry });
  return {
    ...built,
    cacheEntry: {
      signature,
      item: built.item,
      written: built.written,
    },
  };
}

export async function buildAssetRuntimeManifest({
  rootDir = process.cwd(),
  outputRoot = DEFAULT_OUTPUT_ROOT,
  entries = [],
  clean = false,
  cache = true,
  cacheFile = DEFAULT_CACHE_PATH,
} = {}) {
  await ensureSafeOutputRoot(rootDir, outputRoot);
  const previousCache = cache ? await readBuildCache(rootDir, cacheFile) : { entries: {} };
  const nextCacheEntries = {};

  const manifest = {
    version: 1,
    generatedAt: new Date(0).toISOString(),
    assets: {},
    bundles: {},
  };
  const written = [];

  for (const entry of entries) {
    const built = cache
      ? await buildEntryWithCache({ rootDir, outputRoot, entry, previousCache })
      : await buildEntry({ rootDir, outputRoot, entry });
    manifest.assets[built.key] = built.item;
    written.push(...built.written);
    if (cache && built.cacheEntry) {
      nextCacheEntries[built.key] = built.cacheEntry;
    }
    if (built.bundle) {
      manifest.bundles[built.bundle] ||= [];
      manifest.bundles[built.bundle].push(built.key);
    }
  }

  for (const key of Object.keys(manifest.bundles)) {
    manifest.bundles[key] = [...new Set(manifest.bundles[key])].sort();
  }
  manifest.assets = sortedObject(manifest.assets);
  manifest.bundles = sortedObject(manifest.bundles);

  const manifestPath = path.resolve(rootDir, outputRoot, "manifest.json");
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

  if (cache) await writeBuildCache(rootDir, cacheFile, nextCacheEntries);
  if (clean) {
    await pruneStaleOutputFiles({
      rootDir,
      outputRoot,
      keepUrls: written,
      extraKeepFiles: [
        manifestPath,
      ],
    });
  }

  return { manifest, written, manifestPath };
}

async function runCli() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { loadAssetPipelineEntries } = await import("./assets-pipeline.config.mjs");
  const entries = await loadAssetPipelineEntries(rootDir);
  const result = await buildAssetRuntimeManifest({
    rootDir,
    outputRoot: DEFAULT_OUTPUT_ROOT,
    entries,
    clean: true,
  });
  console.log(`Generated ${Object.keys(result.manifest.assets).length} runtime assets in ${DEFAULT_OUTPUT_ROOT}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
