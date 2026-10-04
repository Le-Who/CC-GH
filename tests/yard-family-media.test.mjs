/** Source/descriptor and cache checks. These are not joint gameplay acceptance. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {createEightAcceptanceOptions} from './fixtures/yard-eight-canonical/acceptance.mjs';
import {createFamilyActorMediaEntry} from '../src/games/companion-yard-v2/family-actor-media.mjs';
import {FAMILY_ASSETS} from '../game-logic/yard-v2/media/family-assets.mjs';
import {FAMILY_ACTOR_PROFILES} from '../game-logic/yard-v2/family-actor-profile.mjs';
import {digest} from '../game-logic/yard-v2/util.mjs';
import {AtlasCache,atlasPageFor} from '../src/games/companion-yard-v2/atlas.mjs';
import {FAMILY_ATLAS_POLICY,CURRENT_FOUR_ATLAS_POLICY} from '../src/games/companion-yard-v2/atlas-policy.mjs';
import {entries as fourEntries,allClips} from './fixtures/yard-current-four/media.mjs';
const copy=structuredClone,options=createEightAcceptanceOptions(),base='https://yard.fixture/',manifests={},entries={};
for(const id of ['willow','starlit','basil','sage']){manifests[id]=JSON.parse(await readFile(new URL(`../recovery-tools/yard-family-frozen/assets/yard-family/${id}/runtime-media.json`,import.meta.url),'utf8'));entries[id]=createFamilyActorMediaEntry(id,manifests[id],{assetBaseURL:`${base}assets/yard-family/${id}/`,profiles:options.actorProfiles});}
test('exact small profiles pin every frozen stride, ground revision, own turn and interaction/rest cycle',()=>{
 for(const[id,d]of Object.entries(FAMILY_ASSETS)){const p=FAMILY_ACTOR_PROFILES[id];assert.equal(p.playbackReady,false);assert.equal(p.visitorId,d.ground.visitorId);assert.equal(p.locomotion.cycleMs,d.stride.durationMs);assert.equal(p.locomotion.strideWorld,d.stride.strideWorld);assert.deepEqual(p.locomotion.phaseSamples,d.stride.frames.slice(0,-1).map(r=>r.atMs/d.stride.durationMs));assert.equal(p.ground.revision,`${id}-authored-ground/r2:${digest(d.ground)}`);assert.equal(p.turns.durations[2],d.ground.clips.left90.durationMs);assert.equal(p.turns.durations[4],2*d.ground.clips.left90.durationMs);for(const[cid,c]of Object.entries(d.clips))assert.deepEqual(p.interactions[cid].loop,{...copy(c.restLoop),fps:25});}
 assert.equal(entries.basil.manifest.walk.facings[0].frameCount,40);assert.equal(entries.sage.manifest.walk.facings[0].frameCount,50);assert.equal(entries.willow.manifest.walk.facings[0].frameCount,28);
});
test('every frozen page/still hash and physical dimensions are pinned, including offset-addressed curl reuse',async()=>{
 const verified=new Set();let reused=0,frames=0;
 for(const entry of Object.values(entries))for(const c of [...allClips(entry),...Object.values(entry.manifest.extraSourceClips||{})]){
  const root=c.assetBaseURL||new URL(entry.manifest.roots[c.assetRoot].path,base).href;assert.match(c.assetRevision||entry.manifest.roots[c.assetRoot].assetRevision,/^[a-f0-9]{64}$/);
  for(let i=0;i<c.frameCount;i++){const{page}=atlasPageFor(c,i),physical=i-page.first+(page.offset||0);assert.ok(physical>=0&&physical<page.cols*page.height/page.tileHeight);if(page.offset)reused++;frames++;}
  for(const p of c.pages){const path=new URL(p.src,root).pathname;if(verified.has(path))continue;verified.add(path);const bytes=await readFile(new URL('../recovery-tools/yard-family-frozen'+path,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),p.sha256,path);assert.ok(p.count<=16);assert.ok(p.width*p.height*4<=8*1048576);}
 }
 for(const entry of Object.values(entries))for(const s of Object.values(entry.stills)){const path=new URL(s.assetURL).pathname;assert.equal(createHash('sha256').update(await readFile(new URL('../recovery-tools/yard-family-frozen'+path,import.meta.url))).digest('hex'),s.sha256);}
 assert.ok(reused>100);assert.ok(frames>6000);assert.equal(entries.willow.stills['moon-lamp-new-r2'].assetURL,entries.starlit.stills['moon-lamp-new-r2'].assetURL);assert.equal(entries.basil.stills['fountain-bowl-new-r2'].assetURL,entries.sage.stills['fountain-bowl-new-r2'].assetURL);
 console.log('FAMILY_FROZEN_PAGES',JSON.stringify({uniquePages:verified.size,logicalFrames:frames,reusedOffsetFrames:reused}));
});
test('family manifest refuses foreign profile, changed source conditions, origin, page coverage or digest root',()=>{
 const reseal=m=>{delete m.manifestRevision;m.manifestRevision=digest(m);return m;};
 for(const mutate of [m=>m.roots.interactions.assetRevision='a'.repeat(64),m=>m.clips['willow-listen-worn-r7'].condition='new',m=>m.clips['willow-listen-new-r7'].pivotPx[0]+=1,m=>m.clips['willow-listen-new-r7'].sourceRootWorld[0][0]+=1,m=>m.walk.facings[0].pages[0].count--]){const m=copy(manifests.willow);mutate(m);assert.throws(()=>createFamilyActorMediaEntry('willow',reseal(m),{assetBaseURL:base,profiles:options.actorProfiles}));}
 assert.throws(()=>createFamilyActorMediaEntry('willow',manifests.willow,{assetBaseURL:base,profiles:{}}),/exact family/);
});
test('eight maximum-page inventory needs more than 64MiB once actual external pixels are included; rejection never broadens the budget',()=>{
 const all={...fourEntries,...entries},required=Object.values(all).map(e=>{const candidates=allClips(e).flatMap(clip=>clip.pages.map(p=>({clip,index:p.first,bytes:p.width*p.height*4})));return candidates.sort((a,b)=>b.bytes-a.bytes)[0];}),atlasBytes=required.reduce((n,r)=>n+r.bytes,0);
 const external=14*1048576,cache=new AtlasCache(new URL(base),16,{...FAMILY_ATLAS_POLICY,externalBytes:()=>external});
 assert.equal(FAMILY_ATLAS_POLICY.maxDecodedBytes,64*1048576);assert.equal(FAMILY_ATLAS_POLICY.maxConcurrentDecodes,1);assert.equal(CURRENT_FOUR_ATLAS_POLICY.maxPages,7);assert.ok(atlasBytes+external>64*1048576);assert.throws(()=>cache.prepare(required),/working set exceeds/);assert.equal(cache.pending.size,0);assert.equal(cache.active,0);cache.dispose();
 console.log('EIGHT_ANALYTICAL_BOUND_NOT_GAMEPLAY',JSON.stringify({atlasBytes,externalExampleBytes:external,totalBytes:atlasBytes+external,globalLimitBytes:64*1048576}));
});
test('external backing reservation evicts lookahead, preserves demand and never counts atlas transfer twice',async()=>{
 const oldFetch=globalThis.fetch,oldBitmap=globalThis.createImageBitmap,events=[],waiting=[],step=()=>new Promise(r=>setImmediate(r)),clip=src=>({assetBaseURL:base,frameCount:1,pages:[{src,first:0,count:1,width:1024,height:1024,cols:1,tileWidth:1024,tileHeight:1024}]}),a=clip('a'),b=clip('b');let outside=4*1048576;
 globalThis.fetch=async()=>({ok:true,blob:async()=>new Blob(['cache fixture'])});globalThis.createImageBitmap=()=>new Promise(resolve=>waiting.push(resolve));const cache=new AtlasCache(new URL(base),16,{maxDecodedBytes:16*1048576,externalBytes:()=>outside,onEvent:e=>events.push({e,total:cache.decodedBytes+cache.reservedBytes+outside,active:cache.active})});
 try{cache.prepare([{clip:a,index:0}],[{clip:b,index:0}]);await step();waiting.shift()({width:1024,height:1024,close(){}});await step();waiting.shift()({width:1024,height:1024,close(){}});await step();assert.equal(cache.entries.size,2);assert.equal(cache.reserveExternal(12*1048576),true);outside=12*1048576;assert.ok(cache.frame(a,0));assert.equal(cache.entries.size,1);assert.ok(events.every(r=>r.total<=16*1048576&&r.active<=1));assert.equal(cache.reservedBytes,0);assert.equal(cache.reserveExternal(13*1048576),false);}
 finally{cache.dispose();globalThis.fetch=oldFetch;globalThis.createImageBitmap=oldBitmap;}
});
