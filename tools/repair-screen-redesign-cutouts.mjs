import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const INPUT_ROOT = path.join(ROOT, "assets-source", "imagegen", "screen-redesign");
const OUTPUT_ROOT = path.join(INPUT_ROOT, "_pixel-cut-repairs");
const ARTIFACT_ROOT = path.join(ROOT, "artifacts", "cutout-qc");

const ALPHA_THRESHOLD = 12;

const TARGETS = [
  {
    id: "garden-support-21-button-secondary",
    input: "garden-shelf/2026-05-12-support-pass/processed/support-5x5-final-qc/support-21.png",
    policy: "largest",
    reason: "drop disconnected top rail from secondary button",
  },
  {
    id: "garden-support-22-button-danger",
    input: "garden-shelf/2026-05-12-support-pass/processed/support-5x5-final-qc/support-22.png",
    policy: "largest",
    reason: "drop disconnected top rail from danger button",
  },
  {
    id: "garden-support-3-unlock-glow",
    input: "garden-shelf/2026-05-12-support-pass/processed/support-5x5-final-qc/support-3.png",
    policy: "fx",
    reason: "keep meaningful burst parts while dropping tiny edge fragments",
  },
  {
    id: "garden-support-23-unlock-burst",
    input: "garden-shelf/2026-05-12-support-pass/processed/support-5x5-final-qc/support-23.png",
    policy: "fx-no-rails",
    reason: "keep meaningful burst parts while dropping tiny edge fragments and foreign rails",
  },
  {
    id: "garden-support-24-level-confetti",
    input: "garden-shelf/2026-05-12-support-pass/processed/support-5x5-final-qc/support-24.png",
    policy: "fx-no-rails",
    reason: "keep meaningful confetti parts while dropping tiny edge fragments and foreign rails",
  },
  {
    id: "gacha-extra-17-exchange-treats",
    input: "gacha-merge/qc/extras-4x5-candidate-final-clean/gacha_merge_extra-17.png",
    policy: "significant",
    reason: "keep icon components, drop insignificant edge fragments",
  },
  {
    id: "gacha-extra-18-exchange-shiny-treat",
    input: "gacha-merge/qc/extras-4x5-candidate-final-clean/gacha_merge_extra-18.png",
    policy: "significant",
    reason: "drop tiny edge strays around icon",
  },
  {
    id: "gacha-extra-19-exchange-future",
    input: "gacha-merge/qc/extras-4x5-candidate-final-clean/gacha_merge_extra-19.png",
    policy: "largest",
    reason: "drop isolated right-edge foreign shard",
  },
];

const BLOCKED = [
  {
    id: "game-hub-shared-shell-3",
    input: "game-hub/processed/game-hub-shared-shell-3.png",
    reason: "source cell touches left edge; pixel filtering cannot reconstruct the missing rounded end",
  },
  {
    id: "game-hub-shared-shell-6",
    input: "game-hub/processed/game-hub-shared-shell-6.png",
    reason: "source cell touches left edge; pixel filtering cannot reconstruct the missing rounded end",
  },
  {
    id: "blox-candidates",
    input: "blox/qc",
    reason: "visual/local chroma audit shows magenta contamination; chroma scrub damages the pink tile, so this needs regeneration or manual re-authoring",
  },
];

function asPosix(value) {
  return value.replace(/\\/g, "/");
}

function componentSummary(component) {
  return {
    area: component.pixels.length,
    bbox: [component.minX, component.minY, component.maxX, component.maxY],
    width: component.maxX - component.minX + 1,
    height: component.maxY - component.minY + 1,
    nearEdge: component.nearEdge,
  };
}

function findAlphaComponents(data, width, height, threshold = ALPHA_THRESHOLD) {
  const seen = new Uint8Array(width * height);
  const components = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (seen[start]) continue;
      seen[start] = 1;
      if (data[start * 4 + 3] <= threshold) continue;

      const stack = [start];
      const component = {
        pixels: [],
        minX: x,
        minY: y,
        maxX: x,
        maxY: y,
      };

      while (stack.length) {
        const index = stack.pop();
        const px = index % width;
        const py = Math.floor(index / width);
        component.pixels.push(index);
        component.minX = Math.min(component.minX, px);
        component.minY = Math.min(component.minY, py);
        component.maxX = Math.max(component.maxX, px);
        component.maxY = Math.max(component.maxY, py);

        for (const next of [index + 1, index - 1, index + width, index - width]) {
          if (next < 0 || next >= width * height || seen[next]) continue;
          const nx = next % width;
          const ny = Math.floor(next / width);
          if (Math.abs(nx - px) + Math.abs(ny - py) !== 1) continue;
          seen[next] = 1;
          if (data[next * 4 + 3] > threshold) stack.push(next);
        }
      }

      if (component.pixels.length <= 3) continue;
      component.nearEdge = (
        component.minX <= 2 ||
        component.minY <= 2 ||
        component.maxX >= width - 3 ||
        component.maxY >= height - 3
      );
      components.push(component);
    }
  }

  return components.sort((a, b) => b.pixels.length - a.pixels.length);
}

function selectComponents(components, policy) {
  if (!components.length) return [];
  const largest = components[0].pixels.length;

  if (policy === "largest") {
    return [components[0]];
  }

  if (policy === "significant") {
    const minimumArea = Math.max(96, Math.floor(largest * 0.035));
    return components.filter((component) => component.pixels.length >= minimumArea);
  }

  if (policy === "fx" || policy === "fx-no-rails") {
    const minimumArea = Math.max(18, Math.floor(largest * 0.004));
    const fxComponents = components.filter((component) => {
      if (component.pixels.length >= Math.max(72, Math.floor(largest * 0.018))) return true;
      return component.pixels.length >= minimumArea && !component.nearEdge;
    });
    if (policy === "fx") return fxComponents;

    return fxComponents.filter((component) => {
      const width = component.maxX - component.minX + 1;
      const height = component.maxY - component.minY + 1;
      const wideThinRail = width >= 120 && height <= 36 && width / Math.max(1, height) >= 4;
      const tinyFarShard = component.pixels.length < largest * 0.012 && component.minX <= 24;
      return !wideThinRail && !tinyFarShard;
    });
  }

  throw new Error(`Unknown component policy: ${policy}`);
}

async function writePixelCut({ id, input, policy, reason }) {
  const inputPath = path.join(INPUT_ROOT, ...input.split("/"));
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);
  const components = findAlphaComponents(pixels, info.width, info.height);
  const kept = selectComponents(components, policy);

  if (!kept.length) {
    return {
      id,
      input,
      policy,
      reason,
      status: "blocked",
      blockedReason: "no alpha component survived filtering",
      before: {
        width: info.width,
        height: info.height,
        components: components.map(componentSummary),
      },
    };
  }

  let minX = Math.min(...kept.map((component) => component.minX));
  let minY = Math.min(...kept.map((component) => component.minY));
  let maxX = Math.max(...kept.map((component) => component.maxX));
  let maxY = Math.max(...kept.map((component) => component.maxY));
  const padding = 8;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(info.width - 1, maxX + padding);
  maxY = Math.min(info.height - 1, maxY + padding);

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const outputPixels = Buffer.alloc(width * height * 4);
  for (const component of kept) {
    for (const sourceIndex of component.pixels) {
      const sx = sourceIndex % info.width;
      const sy = Math.floor(sourceIndex / info.width);
      if (sx < minX || sx > maxX || sy < minY || sy > maxY) continue;
      const sourceOffset = sourceIndex * 4;
      const targetOffset = ((sy - minY) * width + (sx - minX)) * 4;
      outputPixels[targetOffset] = pixels[sourceOffset];
      outputPixels[targetOffset + 1] = pixels[sourceOffset + 1];
      outputPixels[targetOffset + 2] = pixels[sourceOffset + 2];
      outputPixels[targetOffset + 3] = pixels[sourceOffset + 3];
    }
  }

  const outputRel = `${id}.png`;
  const outputPath = path.join(OUTPUT_ROOT, outputRel);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(outputPixels, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);

  return {
    id,
    input,
    output: asPosix(path.relative(ROOT, outputPath)),
    policy,
    reason,
    status: components.length === kept.length ? "unchanged-pass" : "repaired",
    before: {
      width: info.width,
      height: info.height,
      componentCount: components.length,
      components: components.map(componentSummary),
    },
    after: {
      width,
      height,
      keptComponentCount: kept.length,
      droppedComponentCount: components.length - kept.length,
      keptComponents: kept.map(componentSummary),
    },
  };
}

function checkerSvg(width, height, cell = 16) {
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <pattern id="check" width="${cell * 2}" height="${cell * 2}" patternUnits="userSpaceOnUse">
      <rect width="${cell * 2}" height="${cell * 2}" fill="#f2f4f6"/>
      <rect width="${cell}" height="${cell}" fill="#dfe3e8"/>
      <rect x="${cell}" y="${cell}" width="${cell}" height="${cell}" fill="#dfe3e8"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#check)"/>
</svg>
`);
}

function labelSvg(width, text, color = "#1f2933") {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="42">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="8" y="17" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="${color}">${escaped}</text>
  <text x="8" y="34" font-family="Arial, sans-serif" font-size="11" fill="#52616b">original above, pixel-cut below</text>
</svg>
`);
}

async function renderPreview(inputPath, outputPath) {
  const tileWidth = 260;
  const tileHeight = 336;
  const imageBox = 124;
  const gap = 12;
  const bg = await sharp(checkerSvg(tileWidth, tileHeight))
    .composite([{ input: labelSvg(tileWidth, path.basename(outputPath, ".png")), left: 0, top: 0 }])
    .png()
    .toBuffer();

  const [original, repaired] = await Promise.all([
    sharp(inputPath).ensureAlpha().resize({ width: imageBox, height: imageBox, fit: "inside", withoutEnlargement: true }).png().toBuffer(),
    sharp(outputPath).ensureAlpha().resize({ width: imageBox, height: imageBox, fit: "inside", withoutEnlargement: true }).png().toBuffer(),
  ]);
  const originalMeta = await sharp(original).metadata();
  const repairedMeta = await sharp(repaired).metadata();

  return sharp(bg)
    .composite([
      {
        input: original,
        left: Math.round((tileWidth - originalMeta.width) / 2),
        top: 50 + Math.round((imageBox - originalMeta.height) / 2),
      },
      {
        input: repaired,
        left: Math.round((tileWidth - repairedMeta.width) / 2),
        top: 50 + imageBox + gap + Math.round((imageBox - repairedMeta.height) / 2),
      },
    ])
    .png()
    .toBuffer();
}

async function writeContactSheet(results) {
  const repaired = results.filter((result) => result.output);
  if (!repaired.length) return null;

  const tileWidth = 260;
  const tileHeight = 336;
  const columns = 4;
  const rows = Math.ceil(repaired.length / columns);
  const width = columns * tileWidth;
  const height = rows * tileHeight;
  const base = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: "#ffffff",
    },
  }).png().toBuffer();

  const composites = [];
  for (let index = 0; index < repaired.length; index += 1) {
    const result = repaired[index];
    const inputPath = path.join(INPUT_ROOT, ...result.input.split("/"));
    const outputPath = path.join(ROOT, ...result.output.split("/"));
    composites.push({
      input: await renderPreview(inputPath, outputPath),
      left: (index % columns) * tileWidth,
      top: Math.floor(index / columns) * tileHeight,
    });
  }

  const outputPath = path.join(ARTIFACT_ROOT, "pixel-cut-repair-contact-sheet.png");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(base).composite(composites).png({ compressionLevel: 9 }).toFile(outputPath);
  return asPosix(path.relative(ROOT, outputPath));
}

async function main() {
  const results = [];
  for (const target of TARGETS) {
    results.push(await writePixelCut(target));
  }

  for (const blocked of BLOCKED) {
    results.push({
      ...blocked,
      status: "blocked",
    });
  }

  const contactSheet = await writeContactSheet(results);
  const report = {
    generatedAt: new Date().toISOString(),
    alphaThreshold: ALPHA_THRESHOLD,
    outputRoot: asPosix(path.relative(ROOT, OUTPUT_ROOT)),
    contactSheet,
    summary: {
      targetCount: TARGETS.length,
      repairedCount: results.filter((result) => result.status === "repaired").length,
      unchangedPassCount: results.filter((result) => result.status === "unchanged-pass").length,
      blockedCount: results.filter((result) => result.status === "blocked").length,
    },
    results,
  };

  await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
  await fs.writeFile(
    path.join(ARTIFACT_ROOT, "pixel-cut-repair-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  const markdown = [
    "# Pixel Cutout Repair Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Output root: \`${report.outputRoot}\``,
    contactSheet ? `Contact sheet: \`${contactSheet}\`` : "Contact sheet: none",
    "",
    "## Summary",
    "",
    `- Targets processed: ${report.summary.targetCount}`,
    `- Repaired: ${report.summary.repairedCount}`,
    `- Unchanged after policy pass: ${report.summary.unchangedPassCount}`,
    `- Blocked: ${report.summary.blockedCount}`,
    "",
    "## Results",
    "",
    ...results.map((result) => {
      const output = result.output ? ` -> \`${result.output}\`` : "";
      const dropped = result.after ? `, dropped ${result.after.droppedComponentCount}` : "";
      return `- ${result.status}: \`${result.id}\`${output}; policy=${result.policy || "n/a"}${dropped}; ${result.reason}`;
    }),
    "",
  ].join("\n");

  await fs.writeFile(path.join(ARTIFACT_ROOT, "pixel-cut-repair-report.md"), markdown);
  console.log(`Pixel-cut repair report written: ${asPosix(path.relative(ROOT, path.join(ARTIFACT_ROOT, "pixel-cut-repair-report.md")))}`);
  if (contactSheet) console.log(`Contact sheet: ${contactSheet}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
