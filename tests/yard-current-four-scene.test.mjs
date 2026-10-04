import './yard-inventory-only-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCourtyardScene} from '../src/games/companion-yard-v2/scene.mjs';
import {createMochiMedia} from '../game-logic/yard-v2/mochi-media.mjs';
import {createPebbleMedia} from '../game-logic/yard-v2/pebble-media.mjs';
import {createPipMedia} from '../game-logic/yard-v2/pip-media.mjs';
import {createYardMedia} from '../game-logic/yard-v2/yard-media.mjs';
import {createAdmissionPolicy} from '../game-logic/yard-v2/orchestrator.mjs';
import {YARD_GOODIES,YARD_VISITORS} from '../game-logic/yard-v2/catalog.mjs';
import {entries,profiles,manifests,allClips} from './fixtures/yard-current-four/media.mjs';
import stills from '../public/assets/yard-mika/still-layer-contract.json' with {type:'json'};
const copy=structuredClone,step=()=>new Promise(r=>setImmediate(r)),NOW=Date.UTC(2026,9,3,12),M=1024*1024;
const accept=s=>({...s,preflight:s.preflightCandidate,actorProfiles:{[s.candidateProfile.id]:profiles[s.candidateProfile.id]},mediaRegistry:{...copy(s.mediaRegistry),bindings:s.mediaRegistry.bindings.map(b=>({...copy(b),playbackReady:true}))}});
let fixture;
function snapshot(){
 if(fixture)return copy(fixture);
 const options=createYardMedia({mochi:accept(createMochiMedia()),pebble:accept(createPebbleMedia()),pip:accept(createPipMedia())}),admit=createAdmissionPolicy(options),visits=[],props=[];
 // Each source plan is independently validated. Their juxtaposition is a
 // synthetic canvas/cache stress fixture, not four-visitor geometry acceptance.
 for(const [id,goodieId,x,y,activity]of[['mika','sun_cushion',54,66,'nap'],['mochi','yarn_mouse',50,45,'sniff'],['pebble','leaf_pot',60,48,'sniff'],['pip','snack_table',50,50,'nibble']]){
  const p={slotId:id,goodieId,x,y,rotationZ:0,condition:'new',uses:0},yard={remodel:'meadow',expansion:{level:1},placedGoodies:[p]},q={at:NOW,leavesAt:NOW+110*60000,placement:p,yard,visitor:YARD_VISITORS[profiles[id].visitorId],goodie:YARD_GOODIES[goodieId],activity:{id:activity},bowl:{id:'bowl-1',foodId:'berry_plate'},active:[],reserved:[]};
  const out=admit(q);assert.equal(out.ok,true,out.code);props.push(p);visits.push({visitId:`synthetic-${id}`,visitorId:q.visitor.id,slotId:id,arrivedAt:NOW,leavesAt:q.leavesAt,releaseAt:out.binding.plan.propReleaseAt,renderCompatible:true,resolvedActorProfile:entries[id].reference,mediaAdmission:out.binding,status:'active'});
 }
 const at=Math.max(...visits.map(r=>r.mediaAdmission.plan.segments.find(s=>s.kind==='loop').startAt))+20000;
 fixture={yard:{remodel:'meadow',placedGoodies:props,bowls:[],pendingGifts:[]},yardRuntime:{serverNow:at,mutable:true,visits}};return copy(fixture);
}
const dimensions=new Map();for(const e of Object.values(entries))for(const c of allClips(e))for(const p of c.pages){const url=new URL(p.src,c.assetBaseURL);url.searchParams.set('yard-media',c.assetRevision);dimensions.set(url.href,p);}
function environment(){
 const globals=['fetch','createImageBitmap','Image','ResizeObserver','location','document','devicePixelRatio','requestAnimationFrame','cancelAnimationFrame'],old=new Map(globals.map(k=>[k,{own:Object.hasOwn(globalThis,k),value:globalThis[k]}]));
 let mono=0,raf=null,resize=null,clears=0,draws=[],rect={width:360,height:800,left:0,top:0};const waiting=[],images=[],errors=[];
 const ctx={setTransform(){},clearRect(){clears++;draws=[];},save(){},restore(){},translate(){},scale(){},createRadialGradient(){return{addColorStop(){}};},fillRect(){},drawImage(im){draws.push(im);}};
 globalThis.location={origin:'https://yard.fixture'};globalThis.document={hidden:false};globalThis.devicePixelRatio=2;
 globalThis.ResizeObserver=class{constructor(fn){this.fn=fn;resize=fn;}observe(){this.fn();}disconnect(){}};
 globalThis.requestAnimationFrame=fn=>(raf=fn,1);globalThis.cancelAnimationFrame=()=>raf=null;
 globalThis.Image=class{width=64;height=64;set src(v){this.url=v;queueMicrotask(()=>this.onload());}};
 globalThis.fetch=async url=>{const u=new URL(url,location.origin);if(u.pathname.endsWith('runtime-media.json')){const id=u.pathname.split('/')[2].replace('yard-','');return{ok:true,json:async()=>copy(manifests[id])};}if(u.pathname.endsWith('still-layer-contract.json'))return{ok:true,json:async()=>copy(stills)};const blob=new Blob(['synthetic']);blob.src=u.href;return{ok:true,blob:async()=>blob};};
 globalThis.createImageBitmap=blob=>new Promise(resolve=>waiting.push({src:blob.src,resolve}));
 const canvas={width:0,height:0,getContext:()=>ctx,getBoundingClientRect:()=>rect};
 const owner=createCourtyardScene(canvas,{actorProfiles:profiles,now:()=>mono,onError:e=>errors.push(e)});
 return{owner,canvas,waiting,images,errors,
  get clears(){return clears;},get draws(){return draws;},
  resize(width,height){rect={...rect,width,height};resize();},
  tick(ms){mono=ms;assert.ok(raf,'scene must schedule the next synthetic RAF');const fn=raf;raf=null;fn(ms);},
  async complete(){await step();const q=waiting.shift();assert.ok(q);const p=dimensions.get(q.src);assert.ok(p,q.src);const im={src:q.src,width:p.width,height:p.height,closed:0,close(){this.closed++;}};images.push(im);q.resolve(im);await step();return im;},
  async flush(){await step();while(waiting.length)await this.complete();},
  restore(){owner.dispose();for(const[k,v]of old)if(v.own)globalThis[k]=v.value;else delete globalThis[k];},
 };
}
test('shared scene holds one coherent four-actor frame through slow simultaneous switches, resize, disposal and reload',async()=>{
 const snap=snapshot(),saved=JSON.stringify(snap),h=environment();try{
  h.owner.update(snap);await h.owner.ready;assert.deepEqual(h.errors,[]);h.tick(0);await step();assert.equal(h.clears,0,'a partial cold four-actor frame must never be drawn');assert.equal(h.waiting.length,1);
  while(h.waiting.length){await h.complete();if(h.waiting.length)assert.equal(h.clears,0);}
  h.tick(0);assert.equal(h.owner.diagnostics().view.pets.length,4);assert.equal(h.draws.filter(im=>im.src).length,4);const heldClear=h.clears,heldImages=h.draws.slice(),heldView=h.owner.diagnostics().view;
  // Force a simultaneous phase/route change by jumping to a later snapshot.
  const leave=Math.max(...snap.yardRuntime.visits.map(r=>r.mediaAdmission.plan.departureAt));const dt=leave-snap.yardRuntime.serverNow+1000;
  h.tick(dt);await step();assert.equal(h.clears,heldClear);assert.deepEqual(h.draws,heldImages);assert.equal(h.owner.diagnostics().view,heldView);assert.equal(h.owner.diagnostics().view.pets.length,4);assert.equal(h.waiting.length,1);const backing=h.canvas.width;h.resize(390,844);assert.equal(h.canvas.width,backing,'resize must not clear held pixels');assert.equal(h.owner.diagnostics().pendingResize,true);
  const before=copy(h.owner.diagnostics());assert.ok(before.timing.activeMediaWait);assert.equal(before.atlasPolicy.maxPages,7);assert.equal(before.atlasPolicy.maxDecodedBytes,64*M);assert.equal(before.atlasPolicy.maxConcurrentDecodes,1);
  await h.flush();h.tick(dt+40);const current=h.owner.diagnostics();assert.equal(current.view.pets.length,4);assert.equal(h.draws.filter(im=>im.src).length,4);assert.ok(current.presentationTime>=snap.yardRuntime.serverNow+dt);assert.equal(current.timing.activeMediaWait,null);assert.equal(h.canvas.width,780);assert.equal(h.canvas.height,1688);assert.equal(current.pendingResize,false);assert.equal(current.pendingDecodes<=1,true);assert.ok(current.decodedBytesEstimate+current.pendingBytesEstimate<=64*M);assert.equal(JSON.stringify(snap),saved);
  h.owner.dispose();await h.flush();assert.ok(h.images.every(im=>im.closed===1));assert.equal(h.errors.length,0);
 }finally{h.restore();}
 const reload=environment();try{reload.owner.update(JSON.parse(saved));await reload.owner.ready;reload.tick(0);await reload.flush();reload.tick(0);assert.equal(reload.owner.diagnostics().view.pets.length,4);assert.equal(reload.draws.filter(im=>im.src).length,4);assert.equal(reload.errors.length,0);}finally{reload.restore();}
});
