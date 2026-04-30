import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { optimize } from "svgo";

const DEFAULT_OUTPUT_ROOT = "public/assets-runtime";
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

function withoutExtension(filePath) {
  return path.basename(filePath, path.extname(filePath)).replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function sortedObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([left], [right]) => left.localeCompare(right)));
}

async function ensureSafeClean(rootDir, outputRoot) {
  const root = path.resolve(rootDir);
  const output = path.resolve(rootDir, outputRoot);
  const allowed = path.resolve(rootDir, "public", "assets-runtime");
  if (output !== allowed && !output.startsWith(`${allowed}${path.sep}`)) {
    throw new Error(`Refusing to clean unexpected asset output path: ${output}`);
  }
  if (!output.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Asset output path escapes project root: ${output}`);
  }
  await fs.rm(output, { recursive: true, force: true });
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

async function optimizeRaster(sourceAbsolute, format) {
  if (format === "webp") {
    return sharp(sourceAbsolute).webp({ lossless: true }).toBuffer();
  }
  if (format === "png") {
    return sharp(sourceAbsolute).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
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

async function buildEntry({ rootDir, outputRoot, entry }) {
  if (!entry?.key) throw new Error("Asset entry is missing key");
  if (!entry?.source) throw new Error(`Asset entry ${entry.key} is missing source`);

  const sourceAbsolute = path.resolve(rootDir, entry.source);
  const sourceExt = path.extname(entry.source).toLowerCase();
  const formats = entry.formats?.length ? entry.formats : defaultFormatsFor(entry.source);
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
      const buffer = await optimizeRaster(sourceAbsolute, format);
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

export async function buildAssetRuntimeManifest({
  rootDir = process.cwd(),
  outputRoot = DEFAULT_OUTPUT_ROOT,
  entries = [],
  clean = false,
} = {}) {
  if (clean) await ensureSafeClean(rootDir, outputRoot);

  const manifest = {
    version: 1,
    generatedAt: new Date(0).toISOString(),
    assets: {},
    bundles: {},
  };
  const written = [];

  for (const entry of entries) {
    const built = await buildEntry({ rootDir, outputRoot, entry });
    manifest.assets[built.key] = built.item;
    written.push(...built.written);
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
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

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
