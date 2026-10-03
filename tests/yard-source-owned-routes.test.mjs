import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSourceOwnedRouteAdapter} from '../game-logic/yard-v2/media/source-owned-routes.mjs';
import {createAuthoredRouteAdapter} from '../game-logic/yard-v2/media/authored-stride-routes.mjs';
const read=n=>JSON.parse(readFileSync(new URL('../game-logic/yard-v2/media/pebble/'+n+'.json',import.meta.url)));
const stride=read('authored-stride'),ground=read('ground-motion');
function harness(c=ground){const calls=[];return{calls,contract:c,canStand:()=>true,canRunway:()=>true,walkSegment:(a,b,f)=>{calls.push({kind:'walk',a,b,f});return true;},canTurn:(p,f,s,n)=>{calls.push({kind:'turn',p,f,s,n});return true;},planAllowed:()=>true,reservation:(l,t)=>({startMs:t,endMs:t+l.durationMs,rect:{x:0,y:0,width:1,height:1}})};}
const nav={passable:()=>true,segment:()=>true};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('source-owned graph preserves original +X authored schedule',()=>{
 const options={strideContract:stride,motionContract:ground},params={navigation:nav,anchor:{x:45,y:50},entry:{x:88,y:65},incoming:false,guard:harness()};
 const a=createSourceOwnedRouteAdapter(options).plan(params),b=createAuthoredRouteAdapter(options).plan({...params,guard:harness()});assert.ok(a.ok&&b.ok);
 assert.equal(a.durationMs,b.durationMs);assert.deepEqual(a.legs,b.legs);
});
for(const facing of [0,2,4,6])test(`source graph uses true cardinal ${facing} for outgoing root and runway`,()=>{
 const adapter=createSourceOwnedRouteAdapter({strideContract:stride,motionContract:ground}),guard=harness();
 const a=adapter.plan({navigation:nav,guard,anchor:{x:45,y:50},entry:{x:88,y:65},incoming:false,initialFacing:facing,initialSourceMs:250});assert.ok(a.ok);assert.equal(a.legs[0].facing,facing);
 const row=stride.frames[5],t=adapter.sample(a,0);close(t.position.x,45);close(t.position.y,50);assert.equal(t.motion.frameIndex,5);assert.equal(t.motion.facing,facing);
 const e=adapter.sample(a,a.legs[0].durationMs-1),d=[[1,0],[0,1],[-1,0],[0,-1]][facing/2],last=stride.frames[19].distanceWorld-row.distanceWorld;close(e.position.x,45+last*8*d[0]);close(e.position.y,50+last*8*d[1]);
 assert.ok(guard.calls.some(c=>c.kind==='walk'&&c.f===facing));
});
test('different 40 ms source rows index own turn time without a 50 ms assumption',()=>{
 // Deliberately synthetic cadence transform, not a Pip calibration claim.
 const s=structuredClone(stride),c=structuredClone(ground);s.durationMs*=.8;s.frames.forEach(r=>r.atMs*=.8);s.rootSamples=s.rootSamples.filter(r=>r.atMs%5===0).map(r=>({...r,atMs:r.atMs*.8}));c.cycleMs*=.8;
 for(const clip of Object.values(c.clips)){clip.durationMs*=.8;for(const r of clip.frames)r.atMs*=.8;for(const r of clip.bodyBounds)r.atMs*=.8;}
 const adapter=createSourceOwnedRouteAdapter({strideContract:s,motionContract:c}),a=adapter.plan({navigation:nav,guard:harness(c),anchor:{x:45,y:50},entry:{x:45,y:88},incoming:false,initialFacing:4});assert.ok(a.ok);
 const turn=a.legs.find(l=>l.kind==='turn');assert.ok(turn);assert.equal(adapter.sample(a,turn.startMs+120).motion.frameIndex,3);assert.equal(a.sourceSampleMs,40);
});
test('invalid facing and mismatched source cadence stay rejected',()=>{
 const a=createSourceOwnedRouteAdapter({strideContract:stride,motionContract:ground});assert.equal(a.plan({navigation:nav,guard:harness(),anchor:{x:45,y:50},entry:{x:88,y:65},initialFacing:1}).ok,false);
 const c=structuredClone(ground);c.clips.right90.frames[2].atMs=101;assert.throws(()=>createSourceOwnedRouteAdapter({strideContract:stride,motionContract:c}));
});
