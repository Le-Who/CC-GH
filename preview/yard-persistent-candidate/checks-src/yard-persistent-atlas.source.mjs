import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import { AtlasCache } from '../src/games/companion-yard-v2/atlas.mjs';
import { selectPetPose } from '../src/games/companion-yard-v2/pose-selection.mjs';
import { sampleRoute } from '../game-logic/yard-v2/media/stride-routes.mjs';
import media from '../public/assets/yard-mika/runtime-media.json' with { type:'json' };

test('every actual logical pose resolves to a valid page tile, including reused reverse poses',()=>{
  let total=0;for(const c of [...Object.values(media.clips),...Object.values(media.walk.facings),...Object.values(media.turns)]){
    for(let i=0;i<c.frameCount;i++){const index=c.frameAliases?.[i]??i,p=c.pages.find(p=>index>=p.first&&index<p.first+p.count);assert.ok(p,`${c.id||'clip'}:${i}`);
      const n=index-p.first+(p.offset||0);assert.ok(n>=0);assert.ok((n%p.cols)*p.tileWidth+p.tileWidth<=p.width);assert.ok(Math.floor(n/p.cols)*p.tileHeight+p.tileHeight<=p.height);total++;
    }
  }assert.ok(total>=1553);assert.equal(Object.keys(media.turns).length,12);
});
test('published atlas bytes match their declared source hashes after the bounded entry correction',{skip:'Source-only CI subset: real atlas files are verified in the separate art closure'},()=>{
  const pages=new Map();for(const c of [...Object.values(media.clips),...Object.values(media.walk.facings),...Object.values(media.turns)])for(const p of c.pages)pages.set(p.src,p);
  for(const[src,p]of pages){assert.ok(p.sha256,src);assert.equal(createHash('sha256').update(readFileSync(new URL(`../public/assets/yard-mika/${src}`,import.meta.url))).digest('hex'),p.sha256,src);}
  const c=media.clips['mika-cushion-r1'];assert.equal(c.pages[0].count,9);assert.equal(c.pages[1].first,9);assert.equal(c.pages[1].offset,9);assert.equal(c.frameAliases[214],190);
});
test('cache remains three pages, deduplicates decoding, reloads evictions and disposes all retained pixels',async()=>{
  const originalFetch=globalThis.fetch,originalDecode=globalThis.createImageBitmap;let reads=0,decodes=0;const images=[];
  globalThis.fetch=async()=>{reads++;return{ok:true,blob:async()=>new Blob(['test'])}};
  globalThis.createImageBitmap=async()=>{const image={id:++decodes,width:2048,height:1536,closed:false,close(){this.closed=true;}};images.push(image);return image;};
  try{const cache=new AtlasCache(new URL('http://localhost/'),3);const a=await cache.load('a'),b=await cache.load('b');await cache.load('c');cache.entries.get('a').used=performance.now()+10;await cache.load('d');assert.equal(cache.entries.size,3);assert.equal(b.closed,true);assert.equal(a.closed,false);
    const pair=await Promise.all([cache.load('e'),cache.load('e')]);assert.equal(pair[0],pair[1]);assert.equal(reads,5);assert.notEqual(await cache.load('b'),b);assert.equal(reads,6);cache.dispose();assert.equal(cache.entries.size,0);assert.ok(images.every(i=>i.closed));
  }finally{globalThis.fetch=originalFetch;globalThis.createImageBitmap=originalDecode;}
});
test('unmount closes an image whose decode completes late without restoring a cache entry',async()=>{
  const originalFetch=globalThis.fetch,originalDecode=globalThis.createImageBitmap;let resolveDecode,started;
  const decoding=new Promise(r=>started=r),image={closed:false,close(){this.closed=true}};
  globalThis.fetch=async()=>({ok:true,blob:async()=>new Blob(['test'])});
  globalThis.createImageBitmap=()=>{started();return new Promise(r=>resolveDecode=r);};
  try{const cache=new AtlasCache(new URL('http://localhost/'));const load=cache.load('late');await decoding;cache.dispose();resolveDecode(image);assert.equal(await load,null);assert.equal(image.closed,true);assert.equal(cache.entries.size,0);assert.equal(cache.error,null);}
  finally{globalThis.fetch=originalFetch;globalThis.createImageBitmap=originalDecode;}
});
test('all dense cardinal boundaries use the identical phase for the root and rendered sprite',()=>{
  const step=.64*8;
  for(const facing of [0,2,4,6]){
    const angle=facing*Math.PI/4,route={ok:true,durationMs:1200,distance:step,points:[{x:0,y:0},{x:Math.cos(angle)*step,y:Math.sin(angle)*step}],legs:[{kind:'walk',from:{x:0,y:0},to:{x:Math.cos(angle)*step,y:Math.sin(angle)*step},facing,distance:step,durationMs:1200,startMs:0,endMs:1200,phaseStart:0,phaseEnd:0,rampInMs:0,rampOutMs:0,rampInDistance:0,rampOutDistance:0,cruiseMs:1200,cruiseDistance:step}]};
    for(const phase of media.walk.facings[facing].phaseSamples)for(const offset of [-.001,0,.001]){
      const sample=sampleRoute(route,phase*1200+offset),pose=selectPetPose(media,sample);
      assert.equal(pose.clip.phaseSamples[pose.index],sample.gaitPhase);assert.ok(Math.abs(Math.hypot(sample.position.x,sample.position.y)-sample.gaitPhase*step)<1e-6);
      assert.deepEqual(selectPetPose(media,JSON.parse(JSON.stringify(sample))).index,pose.index);
    }
  }
});
test('intermediate turn yaw never snaps to a quantized walking direction',()=>{
  for(const key of Object.keys(media.turns)){const [fromFacing,direction,angleSteps]=key.split(':').map(Number);const pose=selectPetPose(media,{phase:'approach',headingRadians:.317,motion:{kind:'turn',fromFacing,direction,angleSteps,atMs:450}});assert.equal(pose.kind,'turn');assert.equal(pose.index,9);}
  assert.throws(()=>selectPetPose(media,{headingRadians:.317,gaitPhase:0}),/authored heading/);
});
