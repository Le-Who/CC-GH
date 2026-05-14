import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const defaultInputRoot = path.join(ROOT, "assets-source", "imagegen", "screen-redesign");
const defaultOutputRoot = path.join(ROOT, "artifacts", "cutout-qc");
const inputArg = process.argv[2] ? path.resolve(ROOT, process.argv[2]) : defaultInputRoot;
const outputPrefixArg = process.argv[3] ? path.resolve(ROOT, process.argv[3]) : path.join(defaultOutputRoot, "local-report");
const INPUT_ROOT = inputArg;
const OUTPUT_ROOT = path.dirname(outputPrefixArg);
const REPORT_JSON = `${outputPrefixArg}.json`;
const REPORT_MD = `${outputPrefixArg}.md`;

const SKIP_NAMES = new Set([
  "raw-sheet.png",
  "raw-sheet-clean.png",
  "sheet-transparent.png",
  "animation.gif",
]);

const ACCEPTS_MULTI_COMPONENT = /(?:fx|spark|burst|glow|confetti|trail|wipe|warning|reaction|dust|puff|splash|pop|overlay|panel|frame|dock|hud|tray|background)/i;

function asPosix(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

async function walk(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(child));
    } else if (entry.name.toLowerCase().endsWith(".png") && !SKIP_NAMES.has(entry.name)) {
      files.push(child);
    }
  }
  return files.sort();
}

function alphaAt(data, width, x, y) {
  return data[(y * width + x) * 4 + 3];
}

function connectedComponents(data, width, height) {
  const seen = new Uint8Array(width * height);
  const components = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (seen[start]) continue;
      seen[start] = 1;
      if (alphaAt(data, width, x, y) <= 12) continue;

      const stack = [start];
      const component = {
        pixels: 0,
        minX: x,
        minY: y,
        maxX: x,
        maxY: y,
        sumX: 0,
        sumY: 0,
      };

      while (stack.length) {
        const index = stack.pop();
        const px = index % width;
        const py = Math.floor(index / width);
        component.pixels += 1;
        component.minX = Math.min(component.minX, px);
        component.minY = Math.min(component.minY, py);
        component.maxX = Math.max(component.maxX, px);
        component.maxY = Math.max(component.maxY, py);
        component.sumX += px;
        component.sumY += py;

        for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]]) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (seen[next]) continue;
          seen[next] = 1;
          if (alphaAt(data, width, nx, ny) > 12) stack.push(next);
        }
      }

      component.width = component.maxX - component.minX + 1;
      component.height = component.maxY - component.minY + 1;
      component.centerX = component.sumX / component.pixels;
      component.centerY = component.sumY / component.pixels;
      components.push(component);
    }
  }
  return components.sort((a, b) => b.pixels - a.pixels);
}

function edgeOpaquePixels(data, width, height) {
  let count = 0;
  for (let x = 0; x < width; x += 1) {
    if (alphaAt(data, width, x, 0) > 12) count += 1;
    if (alphaAt(data, width, x, height - 1) > 12) count += 1;
  }
  for (let y = 1; y < height - 1; y += 1) {
    if (alphaAt(data, width, 0, y) > 12) count += 1;
    if (alphaAt(data, width, width - 1, y) > 12) count += 1;
  }
  return count;
}

function chromakeyLeakPixels(data, width, height) {
  let exact = 0;
  let residual = 0;
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const alpha = data[offset + 3];
    if (alpha <= 12) continue;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    if (r === 255 && g === 0 && b === 255) exact += 1;
    if (r >= 210 && b >= 195 && g <= 90 && Math.abs(r - b) <= 80 && r - g >= 120 && b - g >= 110) {
      residual += 1;
    }
  }
  return { exact, residual };
}

function classify(filePath, info, components, edgePixels, chromakey) {
  const rel = asPosix(filePath);
  const largest = components[0] || null;
  const totalPixels = components.reduce((sum, item) => sum + item.pixels, 0);
  const meaningful = components.filter((item) => item.pixels >= Math.max(16, totalPixels * 0.001));
  const smallFar = largest
    ? components.filter((item) => {
      if (item === largest) return false;
      if (item.pixels > largest.pixels * 0.18) return false;
      const dx = Math.abs(item.centerX - largest.centerX) / info.width;
      const dy = Math.abs(item.centerY - largest.centerY) / info.height;
      return dx > 0.22 || dy > 0.22 || item.minX <= 3 || item.minY <= 3 || item.maxX >= info.width - 4 || item.maxY >= info.height - 4;
    })
    : [];
  const nearEdges = components.filter((item) => (
    item.minX <= 2 || item.minY <= 2 || item.maxX >= info.width - 3 || item.maxY >= info.height - 3
  ));
  const acceptsMulti = ACCEPTS_MULTI_COMPONENT.test(rel);
  const foreignRails = largest
    ? components.filter((item) => {
      if (item === largest) return false;
      const wideThinRail = item.width >= info.width * 0.45 && item.height <= Math.max(24, info.height * 0.16) && item.width / Math.max(1, item.height) >= 4;
      const verticallyDetached = item.maxY < largest.minY - 4 || item.minY > largest.maxY + 4;
      return wideThinRail && verticallyDetached;
    })
    : [];
  const issues = [];

  if (!components.length) {
    issues.push({ type: "empty-transparent", confidence: "high" });
  }
  if (edgePixels > 0) {
    issues.push({ type: "opaque-edge-touch", confidence: edgePixels > 8 ? "high" : "medium" });
  }
  if (chromakey.exact > 0 || chromakey.residual > Math.max(6, totalPixels * 0.00005)) {
    issues.push({
      type: "chromakey-leak",
      confidence: chromakey.exact > 0 || chromakey.residual > Math.max(32, totalPixels * 0.0002) ? "high" : "medium",
    });
  }
  if (!acceptsMulti && meaningful.length > 3) {
    issues.push({ type: "many-components", confidence: meaningful.length > 8 ? "high" : "medium" });
  }
  if (foreignRails.length > 0) {
    issues.push({ type: "foreign-horizontal-rail", confidence: "high" });
  }
  if (smallFar.length > 0) {
    issues.push({ type: "small-far-fragments", confidence: acceptsMulti ? "low" : smallFar.length > 2 ? "high" : "medium" });
  }
  if (nearEdges.length && !acceptsMulti && largest && nearEdges.some((item) => item !== largest || item.pixels < largest.pixels * 0.25)) {
    issues.push({ type: "edge-fragment", confidence: "medium" });
  }

  return {
    file: rel,
    width: info.width,
    height: info.height,
    componentCount: components.length,
    meaningfulComponentCount: meaningful.length,
    totalOpaquePixels: totalPixels,
    largestComponentPixels: largest?.pixels || 0,
    edgeOpaquePixels: edgePixels,
    exactChromakeyPixels: chromakey.exact,
    residualChromakeyPixels: chromakey.residual,
    acceptsMultiComponentByName: acceptsMulti,
    issues,
    recommendation: issues.some((issue) => issue.confidence === "high")
      ? "block integration; reprocess with connected-alpha bounds/component filtering or regenerate"
      : issues.length
        ? "needs visual review before integration"
        : "accept by automated cutout checks",
  };
}

async function main() {
  const allFiles = await walk(INPUT_ROOT);
  const files = INPUT_ROOT === defaultInputRoot
    ? allFiles.filter((file) => file.includes(`${path.sep}qc${path.sep}`))
    : allFiles;
  const results = [];
  for (const file of files) {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const components = connectedComponents(data, info.width, info.height);
    results.push(classify(
      file,
      info,
      components,
      edgeOpaquePixels(data, info.width, info.height),
      chromakeyLeakPixels(data, info.width, info.height),
    ));
  }

  const flagged = results.filter((item) => item.issues.length);
  const blockers = flagged.filter((item) => item.recommendation.startsWith("block"));
  const payload = {
    generatedAt: new Date().toISOString(),
    inputRoot: asPosix(INPUT_ROOT),
    checkedCount: results.length,
    flaggedCount: flagged.length,
    blockerCount: blockers.length,
    results,
  };

  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(payload, null, 2)}\n`);
  const lines = [
    "# Local Cutout QC Report",
    "",
    `Checked: ${results.length}`,
    `Flagged: ${flagged.length}`,
    `Blockers: ${blockers.length}`,
    "",
    "## Blockers",
    "",
    ...blockers.slice(0, 60).map((item) => `- ${item.file}: ${item.issues.map((issue) => `${issue.type}/${issue.confidence}`).join(", ")}; components=${item.componentCount}, edge=${item.edgeOpaquePixels}, chroma=${item.exactChromakeyPixels}/${item.residualChromakeyPixels}; ${item.recommendation}`),
    "",
    "## Needs Visual Review",
    "",
    ...flagged.filter((item) => !item.recommendation.startsWith("block")).slice(0, 80).map((item) => `- ${item.file}: ${item.issues.map((issue) => `${issue.type}/${issue.confidence}`).join(", ")}; components=${item.componentCount}, edge=${item.edgeOpaquePixels}, chroma=${item.exactChromakeyPixels}/${item.residualChromakeyPixels}`),
    "",
  ];
  await fs.writeFile(REPORT_MD, `${lines.join("\n")}\n`);
  console.log(`Checked ${results.length}; flagged ${flagged.length}; blockers ${blockers.length}`);
  console.log(asPosix(REPORT_MD));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
