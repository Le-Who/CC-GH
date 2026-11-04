import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// Each object has its own generated source; trimming only removes transparent margins.
const sourceDir = 'assets-source/imagegen/garden-terrarium';
const runtimeDir = 'public/games/garden-v2/terrarium';
const generated = 'C:/Users/user/.codex/generated_images/01a1a4b8-d3fd-7222-8344-513fabc8732d';
const assets = [
  { name: 'menu-panel', file: 'exec-f91029f3-2b11-492e-b6e8-190ed7626506.png', width: 1024, trim: true,
    prompt: 'One empty dark bottle-green smoked-glass modal skin, fine brass rim and slim walnut edge, tiny botanical corner inlays confined to outer64px, broad calm uninterrupted reading area, front facing square, rounded48px corners, nine-slice straight sides and center, transparent outside. Premium painted3D botanical terrarium material. No text, icons, compartments or paper.' },
  { name: 'menu-button', file: 'exec-74e2dfcf-9653-4f5d-8557-f037afee23e9.png', width: 1024, trim: true,
    prompt: 'One isolated blank horizontal jade-green lacquered glass/enamel action button, thin antique brass rim and dark walnut bevel, broad calm dark-green reading lane, rounded corners and mint/amber edge reflections confined outer48px, front facing3:1, transparent outside. Premium painted3D botanical game material. No text, icons, states, plants or background.' },
  { name: 'hud-rail', file: 'exec-65598b77-d7c9-494c-964b-ae422cbdf2e8.png', width: 1200, trim: true,
    prompt: 'One empty slim dark walnut instrument rail, restrained brass hairline and small rounded corners, premium painted 3D material, uninterrupted dark reading lane. No slots, icons, words, numbers or states. Transparent alpha. Plain nine-slice center; live metrics remain code.' },
  { name: 'shelf', file: 'exec-58d23711-577a-4266-a3f0-64be0c4b9217.png', width: 1200, trim: true,
    prompt: 'One empty warm walnut shelf; broad flat standing surface, rounded thick front lip, antique brass leaf inlay, two carved leaf brackets. Straight-on slightly above. Premium hand-painted 3D casual game art, amber edge light. No plants, text, numbers, UI or background. Transparent alpha.' },
  { name: 'sign', file: 'exec-de4d0b20-b5ea-4be4-be3f-57cc8bbdc5e2.png', width: 1100, trim: true,
    prompt: 'One blank arched walnut title plaque; large dark empty central reading lane, antique brass botanical trim and modest leaf crest, warm amber and teal reflected light. Premium hand-painted 3D game art. No letters, numbers or background. Transparent alpha.' },
  { name: 'glass-frame', file: 'exec-d05ef6cf-1bb0-4478-b324-f28c2a63007e.png', width: 1024, trim: false,
    prompt: 'One coherent empty blown-glass conservatory frame, portrait1024x1536. Shallow rounded roof ending byy150, straight matched side rails belowy180, slim brass foot in bottom110px; corner ornaments confined outer100px. Same material and thickness with mint refraction and amber highlights.90%alpha interior. Nine-slice stretches straight middle only. No plants, shelves, text, UI, backdrop.' },
  { name: 'conservatory', file: 'exec-b73e7d7d-b9df-4807-83c1-8acc14c8ac90.png', width: 1100, trim: false,
    prompt: 'Portrait soft-focus magical conservatory background. Deep forest and teal greens, warm evening light above left, distant botanical silhouettes at outer edges, delicate golden dust and shafts of light. Broad dark empty central 80%. Premium painted 3D atmosphere. No shelves, pots, jar, foreground objects, UI or text.' },
];
await mkdir(sourceDir, { recursive: true });
await mkdir(runtimeDir, { recursive: true });
const records = [];
for (const asset of assets) {
  const source = path.join(sourceDir, `${asset.name}-source.png`);
  if (!existsSync(source)) await copyFile(path.join(generated, asset.file), source);
  let processor = sharp(source);
  if (asset.trim) processor = processor.trim({ background: '#00000000', threshold: 1 });
  const runtime = path.join(runtimeDir, `${asset.name}.webp`);
  await processor.resize({ width: asset.width, withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100 }).toFile(runtime);
  const { width, height, hasAlpha } = await sharp(runtime).metadata();
  const { data, info } = await sharp(runtime).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] <= 8) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  const record = { ...asset, source, runtime, width, height, hasAlpha, alphaBounds: [left, top, right + 1, bottom + 1] };
  records.push(record);
  console.log(`${asset.name}: ${width}x${height}, alpha=${hasAlpha}, bounds=${record.alphaBounds}`);
}
await writeFile(path.join(sourceDir, 'provenance.json'), JSON.stringify({
  pipeline: 'built-in image_gen; independent source per asset; sharp transparent-margin trim and WebP export',
  date: '2026-11-04',
  baseBuild: 'd09e7296af6e9499a0cd19322c6fda73dfcabef7 (verified live 2026-11-04)',
  layout: 'Shelf/sign preserve intrinsic ratio. One continuous glass source uses border-image nine-slice180100110100; corners and brass ornaments stay intact, only straight optical rails stretch. Frame encloses the viewport independently of shelf count; scroll content is clipped inside the measured opening. Background uses cover. Repeated shelf is a fixed-aspect flow asset. Source-reviewed ceramic supports stand on the top wood plane near source y75, above the rounded front lip; wide viewports enlarge living art. Earlier separately generated glass pieces are not shipped.',
  assets: records,
}, null, 2) + '\n');
