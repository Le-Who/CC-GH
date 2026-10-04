#!/usr/bin/env node
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import yardDelivery from "./yard-public-media.json" with { type: "json" };
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { isRetiredAssetPath } from './asset-retirement-policy.mjs';
import { GAME_DATA_MODULES } from './game-loading-graph.mjs';

const REPORT_PATH = path.resolve("artifacts", "perf", "perf-build-report.json");
const DEFAULT_DIST_DIR = path.resolve("dist");

// Reviewed 706-file expansion: deployment bytes only, never a startup/decode allowance.
export const FROZEN_YARD_DELIVERY_RAW_BYTES = 192_653_433;

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
  // Preserve the previous slack and the previous non-family ceilings.
  // Exactly 192,653,433 bytes of frozen family media may expand shipped totals.
  publicGamesTotalRawBytes: 181_000_000,
  publicAssetsTotalRawBytes: 75_000_000 + FROZEN_YARD_DELIVERY_RAW_BYTES,
  publicMediaTotalRawBytes: 263_000_000 + FROZEN_YARD_DELIVERY_RAW_BYTES,
  nonFamilyPublicAssetsTotalRawBytes: 75_000_000,
  nonFamilyPublicMediaTotalRawBytes: 263_000_000,
};

const PIXI_CHUNK_RE = /(LazyPixiSceneHost|pixi|WebGLRenderer|WebGPURenderer|CanvasRenderer|BitmapFont|BufferResource|RenderTargetSystem|browserAll|webworkerAll|Filter|animation)/i;
const GAME_CHUNK_RE = /(BloxGame|Match3Game|MergeGame|MergeLabGame|BubboGame|TriviaGame|GardenShelfGame|CompanionYardGame|YardReleaseGame|CourtyardGame|SettlementGame)/;
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

export async function analyzeDist({ distDir = DEFAULT_DIST_DIR, budgets = DEFAULT_BUILD_BUDGETS, requireLoadingGraph = false } = {}) {
  const effectiveBudgets = { ...DEFAULT_BUILD_BUDGETS, ...budgets };
  const html = await fs.readFile(path.join(distDir, "index.html"), "utf8");
  const allFiles = await readFiles(distDir);
  const assetFiles = allFiles.filter((file) => file.startsWith("assets/"));
  const runtimeAssetPaths = allFiles.filter((file) => file.startsWith("assets-runtime/"));
  const byPath = new Map();
  for (const file of assetFiles) byPath.set(file, await fileMetric(distDir, file));
  let graph = null;
  const graphFailures = [];
  try {
    graph = JSON.parse(await fs.readFile(path.join(distDir, 'game-loading-graph.json'), 'utf8'));
    if (graph.schemaVersion !== 1 || !Array.isArray(graph.chunks) || !graph.entries) throw new Error('Unsupported loading graph');
    const listed = new Set(graph.chunks.map(chunk => chunk.file));
    const actual = assetFiles.filter(file => file.endsWith('.js'));
    if (listed.size !== graph.chunks.length || actual.some(file => !listed.has(file)) || [...listed].some(file => !byPath.has(file))) throw new Error('Loading graph does not cover every generated JS file');
    for (const chunk of graph.chunks) {
      if (![...chunk.imports, ...chunk.dynamicImports].every(file => listed.has(file))) throw new Error(`Unlisted dependency of ${chunk.file}`);
      if (chunk.dataOnly && (!chunk.dataModules.length || !chunk.dataModules.every(source => GAME_DATA_MODULES.has(source)) || chunk.gameModules.some(source => !GAME_DATA_MODULES.has(source)))) throw new Error(`Invalid data-only exemption: ${chunk.file}`);
    }
  } catch (error) {
    if (requireLoadingGraph || graph || error.code !== 'ENOENT') graphFailures.push({id:'games.loading-graph.complete', actual:String(error.message), budget:'complete generated graph', message:`Game loading graph: ${error.message}`});
    graph = null;
  }
  const graphByFile = new Map((graph?.chunks || []).map(chunk => [chunk.file, chunk]));
  function closure(seeds, includeDynamic = false) {
    const seen = new Set();
    // A game's static dependencies can reference shared exports in the app
    // entry. Its catalogue of other games is a separate user choice.
    function visit(file) { if (seen.has(file) || !graphByFile.has(file)) return; seen.add(file); const chunk = graphByFile.get(file); for (const dependency of [...chunk.imports, ...(includeDynamic && !chunk.isEntry ? chunk.dynamicImports : [])]) visit(dependency); }
    seeds.forEach(visit); return [...seen];
  }
  const runtimeAssetFiles = await Promise.all(runtimeAssetPaths.map((file) => fileMetric(distDir, file)));
  const publicGameFiles = await Promise.all(allFiles.filter(file => file.startsWith('games/')).map(file => fileMetric(distDir, file)));
  // Vite merges public/assets and generated chunks into assets/. JS/CSS are
  // covered by their existing budgets; media/fonts/JSON are counted here.
  const publicAssetFiles = assetFiles.filter(file => !/\.(?:js|css|map)$/.test(file)).map(file => byPath.get(file));

  const htmlScriptRefs = [
    ...htmlAssetRefs(html, "script", "src"),
    ...linkRefs(html, "modulepreload"),
  ].filter((ref) => byPath.has(ref));
  const initialScriptRefs = graph ? closure(htmlScriptRefs) : htmlScriptRefs;
  const initialCssRefs = linkRefs(html, "stylesheet").filter((ref) => byPath.has(ref));
  const initialScripts = initialScriptRefs.map((ref) => byPath.get(ref));
  const initialCss = initialCssRefs.map((ref) => byPath.get(ref));
  const asyncPixiChunks = assetFiles
    .filter((file) => file.endsWith(".js") && (PIXI_CHUNK_RE.test(file) || graphByFile.get(file)?.hasPixi) && !initialScriptRefs.includes(file))
    .map((file) => byPath.get(file));
  const gameChunks = assetFiles
    .filter((file) => file.endsWith(".js") && (GAME_CHUNK_RE.test(file) || graphByFile.get(file)?.gameModules.length) && !graphByFile.get(file)?.isEntry && !graphByFile.get(file)?.dataOnly)
    .map((file) => byPath.get(file));
  const runtimeManifest = runtimeAssetFiles.find((file) => file.path === RUNTIME_ASSET_MANIFEST_PATH);
  const runtimePayloads = runtimeAssetFiles.filter((file) => file.path !== RUNTIME_ASSET_MANIFEST_PATH);

  const metrics = {
    initialScripts: summarize(initialScripts),
    initialCss: summarize(initialCss),
    asyncPixiChunks: summarize(asyncPixiChunks),
    gameChunks: summarize(gameChunks),
    gameData: summarize((graph?.chunks || []).filter(chunk => chunk.dataOnly).map(chunk => byPath.get(chunk.file))),
    runtimeAssetManifest: summarize(runtimeManifest ? [runtimeManifest] : []),
    runtimeAssets: summarize(runtimePayloads),
    publicGames: summarize(publicGameFiles),
    publicAssets: summarize(publicAssetFiles),
    publicMedia: summarize([...publicGameFiles, ...publicAssetFiles, ...runtimePayloads]),
  };

  // The allowance belongs only to the exact reviewed family files. Missing,
  // modified or extra files fail; unrelated media retains the former ceilings.
  const familyFiles = assetFiles.filter(file => /^assets\/yard-(?:family|fox|turtles)\//.test(file)).map(file => byPath.get(file));
  const expectedFamily = new Map(yardDelivery.files.map(row => [row.path, row]));
  const approvedFamily = new Set(), familyFailures = [];
  for (const file of familyFiles) {
    const expected = expectedFamily.get(file.path);
    if (!expected || expected.bytes !== file.rawBytes || createHash('sha256').update(await fs.readFile(path.join(distDir, file.path))).digest('hex') !== expected.sha256) {
      familyFailures.push(file.path);
    } else approvedFamily.add(file.path);
  }
  if ((familyFiles.length || requireLoadingGraph) && (familyFailures.length || approvedFamily.size !== expectedFamily.size
      || yardDelivery.totalBytes !== FROZEN_YARD_DELIVERY_RAW_BYTES)) graphFailures.push({
    id: 'public-assets.frozen-yard-exact', actual: { approved: approvedFamily.size, invalid: familyFailures },
    budget: { files: 706, bytes: FROZEN_YARD_DELIVERY_RAW_BYTES },
    message: 'Frozen Yard delivery must contain exactly the reviewed 706 paths, sizes and SHA-256 hashes',
  });
  metrics.frozenYard = summarize(publicAssetFiles.filter(file => approvedFamily.has(file.path)));
  metrics.nonFamilyPublicAssets = summarize(publicAssetFiles.filter(file => !approvedFamily.has(file.path)));
  metrics.nonFamilyPublicMedia = summarize([...publicGameFiles, ...publicAssetFiles.filter(file => !approvedFamily.has(file.path)), ...runtimePayloads]);

  const loadingGraphs = Object.fromEntries(Object.entries(graph?.entries || {}).map(([game, entry]) => {
    const staticFiles = closure([entry]);
    const allFiles = closure([entry], true);
    return [game, {entry, staticScripts:summarize(staticFiles.map(file => byPath.get(file))), deferredScripts:summarize(allFiles.filter(file => !staticFiles.includes(file)).map(file => byPath.get(file))), allReachableScripts:summarize(allFiles.map(file => byPath.get(file)))}];
  }));
  const failures = [
    ...graphFailures,
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
    budgetFailure('public-games.total.raw', metrics.publicGames.rawBytes, effectiveBudgets.publicGamesTotalRawBytes),
    budgetFailure('public-assets.total.raw', metrics.publicAssets.rawBytes, effectiveBudgets.publicAssetsTotalRawBytes),
    budgetFailure('public-media.total.raw', metrics.publicMedia.rawBytes, effectiveBudgets.publicMediaTotalRawBytes),
    budgetFailure('public-assets.non-family.raw', metrics.nonFamilyPublicAssets.rawBytes, effectiveBudgets.nonFamilyPublicAssetsTotalRawBytes),
    budgetFailure('public-media.non-family.raw', metrics.nonFamilyPublicMedia.rawBytes, effectiveBudgets.nonFamilyPublicMediaTotalRawBytes),
  ].filter(Boolean);

  const retiredPaths = allFiles.filter(isRetiredAssetPath);
  if (retiredPaths.length) failures.push({
    id: 'public-assets.retired-paths', actual: retiredPaths, budget: [],
    message: `Retired assets must not return to production: ${retiredPaths.join(', ')}`,
  });

  const retiredReferences = [];
  for (const file of assetFiles.filter(file => /\.(?:js|css)$/.test(file))) {
    const source = await fs.readFile(path.join(distDir, file), 'utf8');
    for (const [url] of source.matchAll(/\/(?:games|assets-runtime)\/[^\s"'`(){};,]+/g)) {
      if (isRetiredAssetPath(url)) retiredReferences.push({ file, url });
    }
  }
  if (retiredReferences.length) failures.push({
    id: 'public-assets.retired-references', actual: retiredReferences, budget: [],
    message: 'Built JS/CSS must not reference retired assets',
  });

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
    loadingGraphs,
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
  requireLoadingGraph = true,
} = {}) {
  const report = await analyzeDist({ distDir, budgets, requireLoadingGraph });
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
