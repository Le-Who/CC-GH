import {ownedImageBlob} from './helpers/yard-owned-image-fixture.mjs';
/** Control-flow test with explicit DOM/image substitutes. Not a browser or pixel
 * test; real rendering is covered only by the separate authorized CI harness. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createCourtyardScene} from '../src/games/companion-yard-v2/scene.mjs';
import {createProjection} from '../src/games/companion-yard-v2/projection.mjs';
import {ACTOR_PROFILES} from '../game-logic/yard-v2/actor-profiles.mjs';
import fixture from '../recovery-tools/yard-canonical-pebble-qa/fixture.json' with {type:'json'};
import mika from '../public/assets/yard-mika/runtime-media.json' with {type:'json'};
import pebble from '../public/assets/yard-pebble/runtime-media.json' with {type:'json'};

test('shared scene keeps coherent backing pixels and pointer coordinates during a delayed resize, then disposes pages',async t=>{
 const keys=['location','document','devicePixelRatio','ResizeObserver','Image','fetch','createImageBitmap','requestAnimationFrame','cancelAnimationFrame'];
 const old=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));const raf=new Map(),requests=[],closed=[];let frame=0,observer,block=false,release,blocked=false;
 const gate=new Promise(r=>release=r),dimensions=new Map();
 const include=(clips,base)=>{for(const c of clips)for(const p of c.pages)dimensions.set(base+p.src,{width:p.width,height:p.height});};
 include([...Object.values(mika.clips),...Object.values(mika.walk.facings),...Object.values(mika.turns)],'/assets/yard-mika/');
 include([...Object.values(pebble.clips),...Object.values(pebble.walk.facings),...Object.values(pebble.turns)],'/assets/yard-pebble/');
 Object.assign(globalThis,{location:{origin:'https://qa.invalid'},document:{hidden:false},devicePixelRatio:1,
  ResizeObserver:class{constructor(cb){observer=cb;}observe(){}disconnect(){}},Image:class{width=256;height=224;set src(value){this.url=value;queueMicrotask(()=>this.onload());}},
  fetch:async value=>{const u=new URL(value,'https://qa.invalid');assert.equal(u.origin,'https://qa.invalid');requests.push(u.pathname);
   if(block&&u.pathname.endsWith('/pebble-leaf-pot-r1-11.webp')){blocked=true;await gate;}
   if(u.pathname.endsWith('.json'))return{ok:true,json:async()=>JSON.parse(await readFile(new URL('../public'+u.pathname,import.meta.url),'utf8'))};
   return{ok:true,blob:async()=>dimensions.has(u.pathname)?({path:u.pathname,size:10}):ownedImageBlob(u.pathname)};},
  createImageBitmap:async b=>({...b.fixtureDimensions||dimensions.get(b.path),close:()=>closed.push(b.path)}),
  requestAnimationFrame:cb=>{const id=++frame;raf.set(id,cb);return id;},cancelAnimationFrame:id=>raf.delete(id)});
 let rect={left:0,top:0,width:320,height:432},clears=0;const context={setTransform(){},clearRect(){clears++;},save(){},restore(){},translate(){},scale(){},createRadialGradient(){return{addColorStop(){}};},fillRect(){},drawImage(){}};
 const canvas={width:0,height:0,getContext:()=>context,getBoundingClientRect:()=>rect};
 const errors=[],scene=createCourtyardScene(canvas,{now:()=>0,actorProfiles:{...ACTOR_PROFILES,pebble:fixture.acceptanceProfile},onError:e=>errors.push(String(e))});
 t.after(()=>{release();scene.dispose();for(const key of keys){if(old[key])Object.defineProperty(globalThis,key,old[key]);else delete globalThis[key];}});
 const update=at=>scene.update({...fixture.snapshot,yardRuntime:{...fixture.snapshot.yardRuntime,serverNow:at}});
 const pump=async until=>{for(let i=0;i<200;i++){const callbacks=[...raf.values()];raf.clear();for(const cb of callbacks)cb(i*16);await new Promise(r=>setImmediate(r));if(until())return;}assert.fail(`in-memory scene did not reach expected state: ${JSON.stringify(errors)}`);};
 update(fixture.times.entry);await scene.ready;await pump(()=>scene.diagnostics().view?.now===fixture.times.entry);
 const width=canvas.width,height=canvas.height;block=true;update(fixture.times.rest);await pump(()=>blocked&&scene.diagnostics().pendingDecodes===1);const heldClears=clears;
 rect={left:0,top:0,width:568,height:252};observer();assert.equal(scene.diagnostics().pendingResize,true);assert.equal(canvas.width,width);assert.equal(canvas.height,height);
 const point=createProjection(width,height).project({x:60,y:48}),event={clientX:point.x*rect.width/width,clientY:point.y*rect.height/height};
 const logical=scene.point(event);assert.ok(Math.abs(logical.x-60)<1e-9);assert.ok(Math.abs(logical.y-48)<1e-9);assert.equal(scene.hit(event).slotId,'leaf');
 await pump(()=>scene.diagnostics().pendingDecodes===1);assert.equal(clears,heldClears);release();await pump(()=>scene.diagnostics().view?.now===fixture.times.rest&&!scene.diagnostics().pendingResize);
 assert.equal(canvas.width,568);assert.equal(canvas.height,252);assert.ok(clears>heldClears);assert.deepEqual(errors,[]);const d=scene.diagnostics();assert.equal(d.atlasPolicy.id,'yard-canonical-atlas/r1');assert.equal(d.atlasPolicy.maxPages,3);assert.ok(d.retainedPages<=3);assert.ok(d.decodedBytesEstimate+d.pendingBytesEstimate<=64*1024*1024);assert.ok(d.pendingDecodes<=1);
 await scene.dispose();assert.equal(scene.diagnostics().retainedPages,0);assert.ok(closed.length>0);assert.ok(requests.some(p=>p.startsWith('/assets/yard-pebble/')));
});
