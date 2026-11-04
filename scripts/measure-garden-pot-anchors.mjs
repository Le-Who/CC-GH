import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { DAISY, MONSTERA, FERN } from '../src/games/garden-shelf/living/plant-motion.mjs';
import { EXTRA_PROFILES } from '../src/games/garden-shelf/living/plant-profiles.mjs';
import { stageProfile } from '../src/games/garden-shelf/living/plant-stage-profiles.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const outputFile = path.join(root, 'src/games/garden-shelf/living/plant-geometry.json');
const evidenceDir = path.join(root, 'output/garden-pot-anchors');
// --accept-reviewed records the completed owner/independent annotated-source
// review. Ordinary regeneration preserves approval only for identical bytes.
let previous = null;
try { previous = JSON.parse(await fs.readFile(outputFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const bases = { daisy: DAISY, monstera: MONSTERA, fern: FERN, ...EXTRA_PROFILES };
const phaseIndices = { seedling: 0, young: 1, developing: 2, budding: 2, mature: 3 };
const round = value => Math.round(value * 1e6) / 1e6;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const xml = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

function pixelsBox(box, width, height) {
  return [Math.floor(box[0] * width), Math.floor(box[1] * height), Math.ceil(box[2] * width), Math.ceil(box[3] * height)]
    .map((value, index) => clamp(value, 0, index % 2 ? height : width));
}

function componentCandidates(data, width, height, window, material = 'warmCeramic') {
  const [left, top, right, bottom] = window;
  const mask = new Uint8Array(width * height);
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const offset = (y * width + x) * 4;
    const [red, green, blue, alpha] = data.subarray(offset, offset + 4);
    const ceramic = material === 'opaqueBlueBonsai' || red >= green * .95 && red > blue * 1.07 && Math.max(red, green, blue) > 40;
    if (alpha > 200 && ceramic) mask[y * width + x] = 1;
  }
  const queue = new Int32Array(width * height);
  const components = [];
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const start = y * width + x;
    if (!mask[start]) continue;
    let begin = 0, end = 1;
    queue[0] = start; mask[start] = 0;
    let minX = x, maxX = x, minY = y, maxY = y, sumX = 0, sumY = 0;
    const rows = new Map();
    while (begin < end) {
      const index = queue[begin++], px = index % width, py = Math.floor(index / width);
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      sumX += px; sumY += py;
      const row = rows.get(py) || [];
      row.push(px); rows.set(py, row);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = px + dx, ny = py + dy;
        if (nx < left || nx >= right || ny < top || ny >= bottom) continue;
        const neighbor = ny * width + nx;
        if (mask[neighbor]) { mask[neighbor] = 0; queue[end++] = neighbor; }
      }
    }
    if (end >= 32) components.push({ area: end, left: minX, top: minY, right: maxX + 1, bottom: maxY + 1, centerX: sumX / end, centerY: sumY / end, rows });
  }
  return components;
}

function longestRun(xs) {
  xs.sort((a, b) => a - b);
  let start = xs[0], previous = xs[0], best = [start, start + 1];
  for (const x of xs.slice(1)) {
    if (x > previous + 2) start = x;
    previous = x;
    if (x + 1 - start > best[1] - best[0]) best = [start, x + 1];
  }
  return best;
}

async function measure(relativePath, identity) {
  const filename = path.join(root, 'public', relativePath);
  const bytes = await fs.readFile(filename);
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const config = identity.type ? stageProfile(identity.type, identity.phase, bases[identity.type]) : null;
  // Motion masks only seed a slightly expanded search. Final anchors come from
  // the opaque ceramic component, never from a motion-mask edge or whole art.
  const seed = config?.pot || [0, config?.pinY ?? 0, 1, 1];
  const search = pixelsBox([seed[0] - .025, seed[1] - .015, seed[2] + .025, seed[3] + .02], width, height);
  // Bonsai's authored blue ceramic cannot satisfy a warm-clay predicate. Its
  // existing lower pot ROI contains the bowl and paired feet, with no canopy.
  const material = identity.type === 'bonsai' ? 'opaqueBlueBonsai' : 'warmCeramic';
  const components = componentCandidates(data, width, height, search, material);
  const expectedX = (seed[0] + seed[2]) / 2 * width;
  components.sort((a, b) => b.area / (1 + Math.abs(b.centerX - expectedX) / width * 4) - a.area / (1 + Math.abs(a.centerX - expectedX) / width * 4));
  let body = components[0];
  if (!body) throw Error(`No opaque ceramic body: ${relativePath}`);
  if (identity.type === 'string_of_pearls') {
    // Opaque green strands cut the ceramic into disconnected visible pieces.
    // Union material components within the authored basket (not the rope or
    // trailing strand region), retaining real source ceramic on both sides.
    const rows = new Map();
    for (const piece of components) for (const [y, xs] of piece.rows) {
      if (y < seed[1] * height || y >= seed[3] * height) continue;
      const inside = xs.filter(x => x >= seed[0] * width && x <= seed[2] * width);
      if (inside.length) rows.set(y, [...(rows.get(y) || []), ...inside]);
    }
    const allX = [...rows.values()].flat(), allY = [...rows.keys()];
    body = { ...body, rows, area: allX.length, left: Math.min(...allX), right: Math.max(...allX) + 1, top: Math.min(...allY), bottom: Math.max(...allY) + 1 };
  }
  const runs = [...body.rows].map(([y, xs]) => ({ y, run: longestRun(xs), envelope: [Math.min(...xs), Math.max(...xs) + 1] }));
  const basket = identity.type === 'string_of_pearls';
  const useEnvelope = material === 'opaqueBlueBonsai' || basket;
  const widthRows = basket ? runs.filter(row => row.y >= (seed[1] + (seed[3] - seed[1]) * .18) * height && row.y <= (seed[1] + (seed[3] - seed[1]) * .75) * height) : runs;
  // Ordinary warm pots retain contiguous support widths so reddish foliage at
  // the upper edge cannot inflate the pot. Only baskets require an occlusion
  // envelope; their middle ceramic body rows exclude rim-side loose pearls.
  const widths = widthRows.map(row => {
    const span = useEnvelope ? row.envelope : row.run;
    return span[1] - span[0];
  }).sort((a, b) => a - b);
  const potWidth = widths[Math.floor((widths.length - 1) * .98)];
  const supporting = runs.filter(row => row.run[1] - row.run[0] >= Math.max(8, potWidth * .1));
  const base = Math.max(...supporting.map(row => row.y)) + 1;
  const footRows = supporting.filter(row => row.y >= base - Math.max(3, Math.round((body.bottom - body.top) * .025)));
  const axisRows = useEnvelope
    ? widthRows.filter(row => row.envelope[1] - row.envelope[0] >= potWidth * .8) : footRows;
  const axisKind = useEnvelope ? 'stable wide ceramic body envelope' : 'dense bottom support rows';
  const center = axisRows.reduce((sum, row) => sum + (row.envelope[0] + row.envelope[1]) / 2, 0) / axisRows.length;
  let paintLeft = width, paintTop = height, paintRight = 0, paintBottom = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 8) {
    paintLeft = Math.min(paintLeft, x); paintTop = Math.min(paintTop, y); paintRight = Math.max(paintRight, x + 1); paintBottom = Math.max(paintBottom, y + 1);
  }
  const notes = [];
  if (body.left <= search[0] || body.right >= search[2] || body.bottom >= search[3]) notes.push('Ceramic component meets search boundary; inspect annotated source.');
  if (body.area < width * height * .01) notes.push('Small segmented support; inspect source before acceptance.');
  if (Math.abs(center / width - .5) > .04) notes.push('Authored pot axis differs substantially from whole-image center.');
  if (identity.type === 'string_of_pearls') notes.push('Basket base is the support; suspension rope and trailing foliage are excluded.');
  return {
    path: `/${relativePath.replaceAll('\\', '/')}`,
    ...identity,
    sourceSize: { width, height }, sourceSha256: sha256(bytes),
    pot: { centerX: round(center / width), baseY: round(base / height), width: round(potWidth / width) },
    paintedBounds: { x: round(paintLeft / width), y: round(paintTop / height), width: round((paintRight - paintLeft) / width), height: round((paintBottom - paintTop) / height) },
    measurement: {
      searchWindow: search.map((value, index) => round(value / (index % 2 ? height : width))),
      ceramicBounds: { x: round(body.left / width), y: round(body.top / height), width: round((body.right - body.left) / width), height: round((body.bottom - body.top) / height) },
      ceramicPixels: body.area, componentCount: components.length, material, axisKind, notes,
    },
  };
}

async function contactCard(record, name) {
  const cardWidth = 300, imageHeight = 330, cardHeight = 414;
  const { width, height } = record.sourceSize;
  const scale = Math.min(280 / width, imageHeight / height);
  const drawWidth = width * scale, drawHeight = height * scale, left = (cardWidth - drawWidth) / 2, top = 32 + (imageHeight - drawHeight) / 2;
  const body = record.measurement.ceramicBounds;
  const x = left + body.x * drawWidth, y = top + body.y * drawHeight;
  const centerX = left + record.pot.centerX * drawWidth, baseY = top + record.pot.baseY * drawHeight;
  const overlay = Buffer.from(`<svg width="${cardWidth}" height="${cardHeight}"><style>text{font-family:Arial,sans-serif;font-size:12px;fill:#fff}</style><text x="8" y="17">${xml(name)}</text><rect x="${x}" y="${y}" width="${body.width * drawWidth}" height="${body.height * drawHeight}" fill="none" stroke="#1feaff"/><path d="M${centerX} ${top}V${top + drawHeight} M${left} ${baseY}H${left + drawWidth}" stroke="#ff5de1" stroke-width="1"/><text x="8" y="380">axis=${record.pot.centerX} base=${record.pot.baseY} width=${record.pot.width}</text><text x="8" y="398" fill="#ffbf63">${record.measurement.notes.length ? 'REVIEW: ' + record.measurement.notes.length + ' notes' : 'Opaque ceramic component'}</text></svg>`);
  const source = await sharp(path.join(root, 'public', record.path)).resize({ width: Math.round(drawWidth), height: Math.round(drawHeight) }).flatten({ background: '#1d302c' }).png().toBuffer();
  return sharp({ create: { width: cardWidth, height: cardHeight, channels: 3, background: '#1d302c' } }).composite([{ input: source, left: Math.round(left), top: Math.round(top) }, { input: overlay }]).png().toBuffer();
}

const directory = path.join(root, 'public/games/garden-living');
const files = (await fs.readdir(directory)).filter(file => file.endsWith('.webp'));
const assets = {};
for (const file of files) {
  const match = file.match(/^(.*)-(seedling|young|developing|budding|mature)-r\d+\.webp$/);
  if (!match) throw Error(`Unrecognized runtime phase file: ${file}`);
  const type = match[1].replaceAll('-', '_'), phase = phaseIndices[match[2]];
  assets[file] = await measure(`games/garden-living/${file}`, { type, phase });
}
assets['pot.webp'] = await measure('games/garden-v2/pot.webp', { type: null, phase: null });
if (files.length !== 56 || Object.keys(assets).length !== 57) throw Error('Expected exactly56 living images plus the empty pot');
for (const [name, record] of Object.entries(assets)) {
  const geometrySha256 = sha256(Buffer.from(JSON.stringify({ pot: record.pot, paintedBounds: record.paintedBounds })));
  const oldReview = previous?.assets?.[name]?.review;
  record.review = oldReview?.sourceSha256 === record.sourceSha256 && oldReview.geometrySha256 === geometrySha256
    ? oldReview : { status: 'pending', sourceSha256: record.sourceSha256, geometrySha256 };
  if (process.argv.includes('--accept-reviewed')) record.review = {
    status: 'reviewed', sourceSha256: record.sourceSha256, geometrySha256,
    date: '2026-11-04',
    method: 'Owner inspected all57 source overlays; independent reviewer inspected all57 and rechecked corrected Bonsai/basket/foliage width recipes.',
    scope: 'Semantic source pot geometry only; runtime fitting, growth crossfade, fallback parity and clipping require separate checks.',
  };
}
const metadata = {
  schemaVersion: 1,
  coordinateSpace: 'normalizedSourceUV',
  origin: 'top-left',
  algorithm: 'measure-garden-pot-anchors-v1',
  provenance: {
    source: 'Exact unmodified runtime WebP bytes; every source hash is recorded.',
    search: 'Existing motion pot masks plus 0.025 horizontal /0.015 top /0.02 bottom margin only seed search windows. Missing Daisy masks use the lower pinY search.',
    segmentation: 'Alpha>200, red>=green*0.95, red>blue*1.07, maximum RGB>40;8-connected warm ceramic components. Bonsai uses opaque alpha within its authored lower pot ROI to retain blue ceramic and paired feet. Dominant body nearest the seeded pot axis wins.',
    anchors: 'Ordinary warm pot width is98th percentile contiguous ceramic run, excluding disconnected reddish foliage. Bonsai uses the full blue bowl envelope; String of Pearls unions ceramic pieces inside the basket and measures middle-body row envelopes across green occlusions. Base is last row with a dense support run of at least10% of body width. Axis is mean bottom-support center; Bonsai/baskets use stable wide body rows.',
    paintedBounds: 'Independent whole-source alpha>8 bounds, including rope/foliage. They never determine the support point.',
    review: 'Per-file source geometry approval is pinned to both sourceSha256 and geometrySha256; changed source bytes or changed support geometry automatically become pending. Annotated source review does not certify runtime fitting, growth crossfade, fallback parity or overlap. Motion pin masks remain unchanged.',
  },
  assets,
};
const json = JSON.stringify(metadata, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (await fs.readFile(outputFile, 'utf8') !== json) throw Error('Recorded Garden pot geometry differs from current source measurements');
  for (const [name, record] of Object.entries(assets)) {
    const p = record.pot, bounds = record.paintedBounds;
    if (![p.centerX, p.baseY, p.width].every(Number.isFinite) || p.width <= 0 || p.width > 1 || p.centerX < bounds.x || p.centerX > bounds.x + bounds.width || p.baseY < bounds.y || p.baseY > bounds.y + bounds.height + .002) throw Error(`Invalid source support: ${name}`);
    if (record.review.status !== 'reviewed') throw Error(`Source geometry needs independent annotated review: ${name}`);
  }
  console.log('Verified57 source hashes, reviewed geometry fingerprints, exact runtime coverage and finite source-space support measurements.');
} else {
  await fs.writeFile(outputFile, json);
  await fs.mkdir(evidenceDir, { recursive: true });
  const types = Object.keys(bases).sort();
  const ordered = types.flatMap(type => [0, 1, 2, 3].map(phase => Object.entries(assets).find(([, value]) => value.type === type && value.phase === phase)));
  for (let offset = 0; offset < ordered.length; offset += 8) {
    const group = ordered.slice(offset, offset + 8), layers = [];
    for (const [index, [name, record]] of group.entries()) layers.push({ input: await contactCard(record, name), left: (index % 4) * 300, top: Math.floor(index / 4) * 414 });
    const filename = path.join(evidenceDir, `anchors-${String(offset / 8 + 1).padStart(2, '0')}.png`);
    await sharp({ create: { width: 1200, height: Math.ceil(group.length / 4) * 414, channels: 3, background: '#1d302c' } }).composite(layers).png().toFile(filename);
  }
  await fs.writeFile(path.join(evidenceDir, 'empty-pot.png'), await contactCard(assets['pot.webp'], 'pot.webp'));
  await fs.writeFile(path.join(evidenceDir, 'candidate-metadata.json'), json);
  console.log(`Wrote57 anchors (${Object.values(assets).filter(record => record.review.status === 'reviewed').length} reviewed) and8 annotated contact images to ${evidenceDir}`);
  for (const [name, record] of Object.entries(assets)) if (record.measurement.notes.length) console.log(`${name}: ${record.measurement.notes.join(' ')}`);
}
