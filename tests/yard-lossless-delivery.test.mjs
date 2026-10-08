import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {deduplicatePipManifest,deduplicateUiManifest} from '../scripts/yard-lossless-delivery.mjs';
import {AtlasCache,atlasPageFor} from '../src/games/companion-yard-v2/atlas.mjs';
import {CATALOG_PREVIEW_PATHS} from '../src/games/companion-yard-v2/catalog-preview-paths.mjs';
import {PREVIEW_THUMBNAIL_OVERRIDES} from '../src/games/companion-yard-v2/preview-thumbnail-overrides.mjs';
import {isRetiredAssetPath} from '../scripts/asset-retirement-policy.mjs';
import aliases from '../scripts/yard-lossless-delivery-aliases.json' with {type:'json'};
const read=p=>fs.readFile(new URL('../'+p,import.meta.url),'utf8');
const original=JSON.parse(await read('recovery-tools/yard-pip-snack-qa/public/assets/yard-pip/runtime-media.json'));
const shipped=JSON.parse(await read('public/assets/yard-pip/runtime-media.json'));
const clips=m=>[...Object.values(m.clips),...Object.values(m.walk.facings),...Object.values(m.turns)];
test('lossless delivery preserves every logical/source field and updates only URL-bound identity',()=>{
 assert.deepEqual(shipped,deduplicatePipManifest(original));
 const restored=structuredClone(shipped);delete restored.deliveryAudit;restored.manifestRevision=original.manifestRevision;
 clips(restored).forEach((c,i)=>c.pages.forEach((p,j)=>{p.src=clips(original)[i].pages[j].src;}));
 assert.deepEqual(restored,original);assert.notEqual(shipped.manifestRevision,original.manifestRevision);
 assert.equal(shipped.deliveryAudit.logicalAtlasPages,101);assert.equal(shipped.deliveryAudit.uniqueAtlasFiles,87);
 assert.equal(shipped.deliveryAudit.duplicateBytesRemoved,3515136);
 const bad=structuredClone(original);bad.turns['0:1:4'].pages[0].sha256='0'.repeat(64);assert.throws(()=>deduplicatePipManifest(bad),/revision differs/);
});
test('all aliases preserve complete pixels and cannot silently reappear in public delivery',()=>{
 assert.equal(aliases.files.length,26);assert.equal(aliases.savedPublicBytes,4201606);
 assert.equal(aliases.files.reduce((n,r)=>n+r.bytes,0),4201606);
 const retired=new Set(aliases.files.map(r=>r.retire));assert.equal(retired.size,26);
 for(const a of aliases.files){assert.ok(!retired.has(a.keep));assert.ok(isRetiredAssetPath(a.retire));assert.equal(isRetiredAssetPath(a.keep),false);}
});
test('UI aliases preserve every source provenance field and the actual final catalogue URL',async()=>{
 const ui=JSON.parse(await read('public/assets/yard-ui/preview-manifest.json'));
 assert.deepEqual(deduplicateUiManifest(ui),ui);
 const rows=ui.files.filter(r=>r.deliveryAliasFrom);assert.equal(rows.length,12);
 const originalUi=structuredClone(ui);for(const row of originalUi.files)if(row.deliveryAliasFrom){row.outputURL=row.deliveryAliasFrom;delete row.deliveryAliasFrom;}
 assert.equal(createHash('sha256').update(JSON.stringify(originalUi)).digest('hex'),'b1cefbafb9fa1161ff2d8dc103c3ce81cd62ffa8731c49183d25692ab4bf08bd','All original UI provenance fields must be preserved exactly');
 for(const row of rows){
  const a=aliases.files.find(a=>a.retire==='public'+row.deliveryAliasFrom);assert.ok(a);
  assert.equal(row.outputURL,a.keep.slice(6));assert.equal(row.outputSha256,a.sha256);assert.equal(row.bytes,a.bytes);
  assert.equal(CATALOG_PREVIEW_PATHS[row.sourceURL],row.outputURL);
  assert.equal(PREVIEW_THUMBNAIL_OVERRIDES[row.deliveryAliasFrom]||row.deliveryAliasFrom,PREVIEW_THUMBNAIL_OVERRIDES[row.outputURL]||row.outputURL);
  for(const k of ['sourceURL','sourcePath','sourceSha256','sourceSize','crop','padding','scale'])assert.ok(Object.hasOwn(row,k));
 }
});
test('three logical snack pages share one decoded owner without corrupting frame offsets or lifetime',async()=>{
 const clip=structuredClone(shipped.clips['pip-snack-combined-r1']);clip.assetBaseURL='https://example.invalid/assets/yard-pip/';clip.assetRevision=shipped.manifestRevision;
 const oldFetch=globalThis.fetch,oldDecode=globalThis.createImageBitmap;let fetched=0,decoded=0,closed=0;
 const image={width:1536,height:1152,close(){closed++;}},step=()=>new Promise(r=>setImmediate(r));
 globalThis.fetch=async()=>{fetched++;return{ok:true,blob:async()=>new Blob(['test image'])};};globalThis.createImageBitmap=async()=>{decoded++;return image;};
 const cache=new AtlasCache(new URL(clip.assetBaseURL),3);
 try{
  cache.prepare([{clip,index:128},{clip,index:144},{clip,index:160}]);await step();await step();
  assert.equal(fetched,1);assert.equal(decoded,1);assert.equal(cache.entries.size,1);assert.equal(cache.decodedBytes,7077888);
  for(const first of [128,144,160])for(let n=0;n<16;n++){
   assert.equal(atlasPageFor(clip,first+n).page.first,first);const f=cache.frame(clip,first+n);
   assert.equal(f.image,image);assert.equal(f.sx,n%4*384);assert.equal(f.sy,Math.floor(n/4)*288);
  }
  cache.prepare([{clip,index:160}]);await step();assert.equal(closed,0);assert.equal(fetched,1);
  cache.dispose();assert.equal(closed,1);assert.equal(cache.decodedBytes,0);
 }finally{cache.dispose();globalThis.fetch=oldFetch;globalThis.createImageBitmap=oldDecode;}
 assert.equal(closed,1);
});
