import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {catalogPreview,catalogPreviewSource} from '../src/games/companion-yard-v2/catalog-ui.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sourceRoot=process.env.YARD_UI_ASSET_ROOT||root;
const manifest=JSON.parse(await readFile(resolve(root,'public/assets/yard-ui/preview-manifest.json')));
const sharp=(await import(process.env.YARD_PREVIEW_SHARP_MODULE||'sharp')).default;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('thumbnail outputs keep every visible source pixel, native aspect and a uniform margin',async()=>{
  assert.equal(manifest.format,'yard-ui-thumbnails/v1');
  for(const row of manifest.files){
    const input=await readFile(resolve(sourceRoot,row.sourcePath)),output=await readFile(resolve(root,`public${row.outputURL}`));
    assert.equal(hash(input),row.sourceSha256,row.sourcePath);assert.equal(hash(output),row.outputSha256,row.outputURL);
    assert.deepEqual(row.scale,{x:1,y:1});assert.equal(row.alphaThreshold,1);
    const original=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const thumb=await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.deepEqual([thumb.info.width,thumb.info.height],row.outputSize);
    const c=row.crop,p=row.padding;assert.equal(thumb.info.width,c.width+2*p);assert.equal(thumb.info.height,c.height+2*p);
    for(let y=0;y<original.info.height;y++)for(let x=0;x<original.info.width;x++){
      const at=(y*original.info.width+x)*4;
      if(!original.data[at+3])continue;
      assert.ok(x>=c.left&&x<c.left+c.width&&y>=c.top&&y<c.top+c.height,`visible pixel excluded: ${row.sourcePath}`);
      const target=((y-c.top+p)*thumb.info.width+x-c.left+p)*4;
      assert.deepEqual(thumb.data.subarray(target,target+4),original.data.subarray(at,at+4),`source pixels changed: ${row.sourcePath}`);
    }
  }
});
test('released props use exact runtime still identities, without invented condition artwork',()=>{
  for(const condition of ['new','worn','broken']){
    assert.equal(catalogPreviewSource('goodie','sun_cushion',{condition}),'/assets/yard-mika/sun-cushion-clean.webp');
    assert.equal(catalogPreviewSource('goodie','yarn_mouse',{condition}),'/assets/yard-mika/yarn-mouse-clean.webp');
    assert.equal(catalogPreviewSource('goodie','moon_lamp',{condition}),`/assets/yard-fox/shared-props/moon/stills/moon-${condition}.webp`);
    assert.equal(catalogPreviewSource('goodie','fountain_bowl',{condition}),`/assets/yard-turtles/shared-fountain/fountain-${condition}.webp`);
  }
  for(const id of ['yarn_mouse','sun_cushion','leaf_pot','snack_table','moon_lamp','fountain_bowl'])assert.ok(manifest.files.some(row=>row.outputURL===catalogPreview('goodie',id)),id);
  const mouse=manifest.files.find(row=>row.sourceURL.endsWith('/yarn-mouse-clean.webp'));
  assert.deepEqual(mouse.sourceSize,[420,336]);assert.ok(mouse.crop.width<mouse.sourceSize[0]/3);assert.ok(mouse.crop.width/mouse.outputSize[0]>.9);
});
test('surface bytes match their independent source-art provenance',async()=>{
  const folder=resolve(root,'public/assets/yard-ui/surfaces');
  const surfaces=JSON.parse(await readFile(resolve(folder,'ui-surfaces-manifest.json')));
  assert.equal(surfaces.files.length,4);
  for(const entry of surfaces.files){
    assert.equal(hash(await readFile(resolve(folder,entry.file))),entry.output_sha256);
    for(const patch of entry.patch_receipts.filter(p=>p.uniform_corner))assert.equal(patch.scale_x,patch.scale_y);
  }
});

test('every nine-slice CSS rule uses its surface declared source and painting insets',async()=>{
  const manifest=JSON.parse(await readFile(resolve(root,'public/assets/yard-ui/surfaces/ui-surfaces-manifest.json')));
  const css=await readFile(resolve(root,'src/games/companion-yard-v2/courtyard.css'),'utf8');
  const ids={'strip':'wood-strip','panel':'panel-frame','card':'card-frame','button':'button-primary'};
  const expand=values=>values.length===1?Array(4).fill(values[0]):values.length===2?[values[0],values[1],values[0],values[1]]:values;
  let count=0;
  for(const match of css.matchAll(/border-image:var\(--cy-(strip|panel|card|button)-art\) ([\d ]+) fill \/ ([\dpx ]+)/g)){
    const surface=manifest.files.find(entry=>entry.id===ids[match[1]]);
    const numbers=value=>value.trim().split(/\s+/).map(number=>Number.parseInt(number));
    assert.deepEqual(expand(numbers(match[2])),surface.insets,match[1]);
    assert.deepEqual(expand(numbers(match[3])),surface.css_border_width,match[1]);
    count++;
  }
  assert.equal(count,4,'header, dialog, card and button are checked; the quiet navigation dock has no nine-slice skin');
});
