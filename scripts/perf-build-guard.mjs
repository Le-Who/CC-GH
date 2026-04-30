#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const REPORT_PATH = path.resolve("artifacts", "perf", "perf-build-report.json");
const DEFAULT_DIST_DIR = path.resolve("dist");

export const DEFAULT_BUILD_BUDGETS = {
  initialScriptRawBytes: 575_000,
  initialScriptGzipBytes: 190_000,
  initialCssRawBytes: 95_000,
  initialCssGzipBytes: 20_000,
  asyncPixiRawBytes: 660_000,
  maxGameChunkRawBytes: 75_000,
  runtimeManifestRawBytes: 40_000,
  runtimeManifestGzipBytes: 5_000,
  runtimeAssetsTotalRawBytes: 12_000_000,
  runtimeAssetMaxRawBytes: 2_500_000,
};

const PIXI_CHUNK_RE = /(LazyPixiSceneHost|pixi|WebGLRenderer|WebGPURenderer|CanvasRenderer|BitmapFont|BufferResource|RenderTargetSystem|browserAll|webworkerAll|Filter|animation)/i;
const GAME_CHUNK_RE = /(BloxGame|Match3Game|MergeGame|BubboGame|TriviaGame|GardenShelfGame|CompanionYardGame)/;
const RUNTIME_ASSET_MANIFEST_PATH = "assets-runtime/manifest.json";
const HASHED_RUNTIME_ASSET_RE = /^assets-runtime\/.+\.[a-f0-9]{8}\.(?:png|webp|avif|svg|json|webm|mp3|wav)$/i;

function normalizeAssetRef(ref = "") {
  const clean = ref.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0];
  return clean.replace(/^\//, "");
}

function htmlAssetRefs(html, tag, attr) {
  const refs = [];
  const tagRe = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  const attrRe = new RegExp(`${attr}=["']([^"']+)["']`, "i");
  for (const match of html.matchAll(tagRe)) {
    const value = match[0].match(attrRe)?.[1];
    if (value) refs.push(normalizeAssetRef(value));
  }
  return refs;
}

function linkRefs(html, rel) {
  const refs = [];
  const tagRe = /<link\b[^>]*>/gi;
  for (const match of html.matchAll(tagRe)) {
    const tag = match[0];
    if (!new RegExp(`rel=["']${rel}["']`, "i").test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (href) refs.push(normalizeAssetRef(href));
  }
  return refs;
}

async function readFiles(root, relativeDir = "") {
  const dir = path.join(root, relativeDir);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await readFiles(root, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath.replaceAll("\\", "/"));
    }
  }
  return files;
}

async function fileMetric(distDir, relativePath) {
  const bytes = await fs.readFile(path.join(distDir, relativePath));
  return {
    path: relativePath,
    rawBytes: bytes.length,
    gzipBytes: gzipSync(bytes).length,
  };
}

function summarize(files) {
  const rawBytes = files.reduce((sum, file) => sum + file.rawBytes, 0);
  const gzipBytes = files.reduce((sum, file) => sum + file.gzipBytes, 0);
  const maxRawBytes = Math.max(0, ...files.map((file) => file.rawBytes));
  const maxGzipBytes = Math.max(0, ...files.map((file) => file.gzipBytes));
  return {
    count: files.length,
    rawBytes,
    gzipBytes,
    maxRawBytes,
    maxGzipBytes,
    files,
  };
}

function budgetFailure(id, actual, budget, unit = "bytes") {
  if (actual <= budget) return null;
  return {
    id,
    actual,
    budget,
    message: `${id} ${actual}${unit} > ${budget}${unit}`,
  };
}

export async function analyzeDist({ distDir = DEFAULT_DIST_DIR, budgets = DEFAULT_BUILD_BUDGETS } = {}) {
  const effectiveBudgets = { ...DEFAULT_BUILD_BUDGETS, ...budgets };
  const html = await fs.readFile(path.join(distDir, "index.html"), "utf8");
  const allFiles = await readFiles(distDir);
  const assetFiles = allFiles.filter((file) => file.startsWith("assets/"));
  const runtimeAssetPaths = allFiles.filter((file) => file.startsWith("assets-runtime/"));
  const byPath = new Map();
  for (const file of assetFiles) byPath.set(file, await fileMetric(distDir, file));
  const runtimeAssetFiles = await Promise.all(runtimeAssetPaths.map((file) => fileMetric(distDir, file)));

  const initialScriptRefs = [
    ...htmlAssetRefs(html, "script", "src"),
    ...linkRefs(html, "modulepreload"),
  ].filter((ref) => byPath.has(ref));
  const initialCssRefs = linkRefs(html, "stylesheet").filter((ref) => byPath.has(ref));
  const initialScripts = initialScriptRefs.map((ref) => byPath.get(ref));
  const initialCss = initialCssRefs.map((ref) => byPath.get(ref));
  const asyncPixiChunks = assetFiles
    .filter((file) => file.endsWith(".js") && PIXI_CHUNK_RE.test(file) && !initialScriptRefs.includes(file))
    .map((file) => byPath.get(file));
  const gameChunks = assetFiles
    .filter((file) => file.endsWith(".js") && GAME_CHUNK_RE.test(file))
    .map((file) => byPath.get(file));
  const runtimeManifest = runtimeAssetFiles.find((file) => file.path === RUNTIME_ASSET_MANIFEST_PATH);
  const runtimePayloads = runtimeAssetFiles.filter((file) => file.path !== RUNTIME_ASSET_MANIFEST_PATH);

  const metrics = {
    initialScripts: summarize(initialScripts),
    initialCss: summarize(initialCss),
    asyncPixiChunks: summarize(asyncPixiChunks),
    gameChunks: summarize(gameChunks),
    runtimeAssetManifest: summarize(runtimeManifest ? [runtimeManifest] : []),
    runtimeAssets: summarize(runtimePayloads),
  };

  const failures = [
    budgetFailure("startup.initial-js.raw", metrics.initialScripts.rawBytes, effectiveBudgets.initialScriptRawBytes),
    budgetFailure("startup.initial-js.gzip", metrics.initialScripts.gzipBytes, effectiveBudgets.initialScriptGzipBytes),
    budgetFailure("startup.initial-css.raw", metrics.initialCss.rawBytes, effectiveBudgets.initialCssRawBytes),
    budgetFailure("startup.initial-css.gzip", metrics.initialCss.gzipBytes, effectiveBudgets.initialCssGzipBytes),
    budgetFailure("pixi.async-total.raw", metrics.asyncPixiChunks.rawBytes, effectiveBudgets.asyncPixiRawBytes),
    budgetFailure(
      "games.max-chunk.raw",
      Math.max(0, ...metrics.gameChunks.files.map((file) => file.rawBytes)),
      effectiveBudgets.maxGameChunkRawBytes,
    ),
    runtimeManifest
      ? null
      : {
        id: "runtime-assets.manifest.present",
        actual: false,
        budget: true,
        message: "Runtime asset manifest is missing from dist/assets-runtime/manifest.json",
      },
    runtimeManifest
      ? budgetFailure("runtime-assets.manifest.raw", metrics.runtimeAssetManifest.rawBytes, effectiveBudgets.runtimeManifestRawBytes)
      : null,
    runtimeManifest
      ? budgetFailure("runtime-assets.manifest.gzip", metrics.runtimeAssetManifest.gzipBytes, effectiveBudgets.runtimeManifestGzipBytes)
      : null,
    budgetFailure("runtime-assets.total.raw", metrics.runtimeAssets.rawBytes, effectiveBudgets.runtimeAssetsTotalRawBytes),
    budgetFailure("runtime-assets.max-file.raw", metrics.runtimeAssets.maxRawBytes, effectiveBudgets.runtimeAssetMaxRawBytes),
  ].filter(Boolean);

  const unhashedRuntimeAssets = runtimePayloads
    .map((file) => file.path)
    .filter((file) => !HASHED_RUNTIME_ASSET_RE.test(file));
  if (unhashedRuntimeAssets.length) {
    failures.push({
      id: "runtime-assets.hashed-names",
      actual: unhashedRuntimeAssets,
      budget: [],
      message: `Runtime assets must use content-hashed file names: ${unhashedRuntimeAssets.join(", ")}`,
    });
  }

  if (runtimeManifest) {
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(distDir, RUNTIME_ASSET_MANIFEST_PATH), "utf8"));
      const assetCount = Object.keys(manifest.assets || {}).length;
      if (assetCount === 0) {
        failures.push({
          id: "runtime-assets.manifest.nonempty",
          actual: assetCount,
          budget: "> 0",
          message: "Runtime asset manifest must include generated asset entries",
        });
      }
      metrics.runtimeAssetManifest.assetCount = assetCount;
      metrics.runtimeAssetManifest.bundleCount = Object.keys(manifest.bundles || {}).length;
    } catch (error) {
      failures.push({
        id: "runtime-assets.manifest.valid-json",
        actual: String(error?.message || error),
        budget: "valid JSON",
        message: `Runtime asset manifest must be valid JSON: ${error?.message || error}`,
      });
    }
  }

  const preloadedPixi = initialScriptRefs.filter((ref) => PIXI_CHUNK_RE.test(ref));
  if (preloadedPixi.length) {
    failures.push({
      id: "startup.no-pixi-preload",
      actual: preloadedPixi,
      budget: [],
      message: `Pixi runtime must stay out of startup HTML: ${preloadedPixi.join(", ")}`,
    });
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    distDir: path.resolve(distDir),
    budgets: effectiveBudgets,
    metrics,
    failures,
    passed: failures.length === 0,
  };
}

export async function runBuildPerfGuard({
  distDir = DEFAULT_DIST_DIR,
  budgets = DEFAULT_BUILD_BUDGETS,
  writeReport = true,
  quiet = false,
  reportPath = REPORT_PATH,
} = {}) {
  const report = await analyzeDist({ distDir, budgets });
  if (writeReport) {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  if (!quiet) {
    for (const [name, metric] of Object.entries(report.metrics)) {
      console.log(`${name}: count=${metric.count} raw=${metric.rawBytes}B gzip=${metric.gzipBytes}B`);
    }
    if (report.failures.length) {
      for (const failure of report.failures) console.log(`FAIL ${failure.message}`);
    } else {
      console.log("PASS build perf budgets");
    }
    if (writeReport) console.log(`Report: ${reportPath}`);
  }
  return report;
}

function parseArgs(argv) {
  const args = argv.filter((arg) => arg !== "--");
  const distIndex = args.indexOf("--dist");
  const reportIndex = args.indexOf("--report");
  return {
    quiet: args.includes("--quiet"),
    writeReport: !args.includes("--no-write"),
    distDir: distIndex >= 0 ? path.resolve(args[distIndex + 1] || DEFAULT_DIST_DIR) : DEFAULT_DIST_DIR,
    reportPath: reportIndex >= 0 ? path.resolve(args[reportIndex + 1] || REPORT_PATH) : REPORT_PATH,
  };
}

const currentFile = pathToFileURL(fileURLToPath(import.meta.url)).href;
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === currentFile) {
  const report = await runBuildPerfGuard(parseArgs(process.argv.slice(2)));
  if (!report.passed) process.exitCode = 1;
}
