import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import stride from './fixtures/yard-mochi-r1/authored-stride.json' with {type:'json'};
import ground from './fixtures/yard-mochi-r2/ground-motion.json' with {type:'json'};
import {YARD_VISITORS} from '../game-logic/yard-catalog.js';
import {ACTOR_PROFILES} from '../game-logic/yard-v2/actor-profiles.mjs';
import {createAuthoredMotionGround} from '../game-logic/yard-v2/media/authored-motion-ground.mjs';
import {createAuthoredRouteAdapter} from '../game-logic/yard-v2/media/authored-stride-routes.mjs';
import {groundCoverageAllowed} from '../game-logic/yard-v2/ground-coverage.mjs';
const copy=structuredClone,close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const nav={passable:p=>p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100,segment:()=>true};
const adapter=()=>createAuthoredRouteAdapter({strideContract:stride,motionContract:ground});
const guard=(options={})=>createAuthoredMotionGround(ground,{remodel:'meadow',...options});
const options=(g=guard())=>({navigation:nav,guard:g,anchor:{x:50,y:50},entry:{x:50+3*.48*8,y:50},incoming:false,portalHalfSize:0,atMs:10000});

test('candidate identity resolves to the existing catalog bunny and stays unregistered',()=>{
 assert.equal(ground.visitorId,'mochi_bunny');assert.equal(YARD_VISITORS[ground.visitorId].name,'Mochi');
 assert.equal(ground.runtimeActivated,false);assert.equal(ground.playbackReady,false);assert.deepEqual(Object.keys(ACTOR_PROFILES),['mika']);
 assert.equal(adapter().profile.playbackReady,false);
 for(const [path,expected]of [
  ['game-logic/yard-v2/actor-profiles.mjs','3fcc220cdde1ec6189989ade0e21b025182f300abac13ed04af6ad17521570b2'],
  ['src/games/companion-yard-v2/actor-media.mjs','aec79a30e129b70ab9f313bea91a22171c22d5a2f854fbb55e145f390c33f7e8'],
  ['public/assets/yard-mika/runtime-media.json','44cefc25deef8284b91f6dd35bebe972b0f78bb91ed903337d871233da0b9cbb']]){
  assert.equal(createHash('sha256').update(readFileSync(new URL('../'+path,import.meta.url))).digest('hex'),expected);
 }
});
test('whole-hop planner uses its own stride and exact source-time root for three cycles',()=>{
 const a=adapter(),p=a.plan(options());assert.equal(p.ok,true,p.reason);assert.equal(p.durationMs,3000);assert.equal(p.legs.length,1);assert.equal(p.legs[0].cycles,3);
 for(let cycle=0;cycle<3;cycle++)for(const row of stride.frames.slice(0,-1)){
  const sample=a.sample(p,cycle*1000+row.atMs);assert.equal(sample.frameIndex,row.frameIndex);
  close(sample.position.x,50+(cycle*.48+row.distanceWorld)*8);close(sample.position.y,50);
  const held=a.sample(p,cycle*1000+row.atMs+49.9);assert.deepEqual(held.position,sample.position);
 }
 assert.ok(a.sample(p,50).position.x<50);assert.ok(a.sample(p,2950).position.x>p.legs[0].to.x);
 close(a.sample(p,3000).position.x,61.52);assert.equal(a.sample(p,3000).frameIndex,0);
});
test('every partial runway uses remaining authored root, including backwards settling overshoot',()=>{
 const a=adapter();
 for(const row of stride.frames.slice(1,-1)){
  const end=50+(.48-row.distanceWorld)*8;
  const p=a.plan({...options(),initialSourceMs:row.atMs,entry:{x:end,y:50}});assert.equal(p.ok,true,`${row.atMs}:${p.reason}`);
  assert.equal(p.legs.length,1);assert.equal(p.legs[0].kind,'authoredRunway');assert.equal(p.durationMs,1000-row.atMs);
  assert.deepEqual(a.sample(p,0).position,{x:50,y:50});assert.equal(a.sample(p,0).frameIndex,row.frameIndex);
  close(a.sample(p,p.durationMs).position.x,end);assert.equal(a.sample(p,p.durationMs).frameIndex,0);
  const last=a.sample(p,Math.max(0,p.durationMs-1));assert.ok(Number.isFinite(last.position.x));
 }
 const row=stride.frames.find(r=>r.atMs===950);assert.ok(.48-row.distanceWorld<0);
 const p=a.plan({...options(),initialSourceMs:950,entry:{x:50+(.48-row.distanceWorld)*8,y:50}});assert.ok(a.sample(p,50).position.x<50);
});
test('turns and rest use all four own source facings and conservative full-body occupancy',()=>{
 const g=guard();
 for(const f of [0,2,4,6]){
  for(const [sign,steps]of [[1,2],[-1,2],[1,4]])assert.equal(g.canTurn({x:50,y:50},f,sign,steps),true);
  assert.equal(g.canRest({x:50,y:50},f),true);
 }
 assert.equal(g.canTurn({x:50,y:50},0,-1,4),false);assert.equal(g.canTurn({x:50,y:50},1,1,2),false);
 const obstacle={x:56.5,y:49.9,width:.2,height:.2};
 assert.equal(groundCoverageAllowed(g.coverage('hop',0).polygons,{x:50,y:50},'meadow',{unitsPerWorld:8,obstacles:[obstacle]}),true);
 assert.equal(guard({obstacles:[obstacle]}).walkSegment({x:50,y:50},{x:53.84,y:50},0),false,'body obstruction must fail even with all soles clear');
});
test('static ground/obstacle checks reject unsafe runways without rewriting placement',()=>{
 const g=guard(),before=JSON.stringify(ground);
 assert.equal(g.canRunway({x:95,y:50},0,500),false);assert.equal(g.canRest({x:0,y:0},0),false);
 assert.equal(g.walkSegment({x:50,y:50},{x:53.84,y:50},0,.5),false,'linear phase runway is not this contract');
 assert.equal(g.walkSegment({x:50,y:50},{x:53.84,y:50.1},0),false);
 const a=adapter(),o=options();assert.equal(a.plan({...o,initialSourceMs:501}).reason,'EXACT_AUTHORED_START_FRAME_REQUIRED');
 assert.equal(a.plan({...o,initialFacing:2}).reason,'UNSUPPORTED_AUTHORED_ENTRY_FACING');
 assert.equal(a.plan({...o,incoming:true,initialSourceMs:500}).reason,'EXACT_AUTHORED_START_FRAME_REQUIRED');
 assert.equal(JSON.stringify(ground),before);
});
test('occupancy reservations are time-bounded, half-open and checked before candidate plan return',()=>{
 const reserved={startMs:11000,endMs:12000,rect:{x:49,y:49,width:4,height:4}},g=guard({reservations:[reserved]}),a=adapter();
 assert.equal(a.plan(options(g)).reason,'AUTHORED_OCCUPANCY_CONFLICT');
 assert.equal(a.plan({...options(g),atMs:12000}).ok,true);
 assert.equal(g.motionAllowed('rest',{x:50,y:50},0,{startMs:10000,endMs:11000}),true);
 assert.equal(g.motionAllowed('rest',{x:50,y:50},0,{startMs:10999,endMs:11001}),false);
 assert.equal(g.motionAllowed('rest',{x:50,y:50},0,{startMs:12000,endMs:13000}),true);
 const p=a.plan(options());assert.ok(p.reservations.every(r=>r.startMs>=10000&&r.endMs<=13000));
 assert.throws(()=>{p.legs[0].cycles=99;},TypeError);
});
test('source contracts, ground rows and caller inputs are defensive and fail closed',()=>{
 const a=adapter();for(const time of [NaN,Infinity,'50'])assert.throws(()=>a.sample(a.plan(options()),time),/authored route/);
 for(const edit of [c=>c.clips.hop.frames[4].root[0]=1,c=>c.strideWorld=.64,c=>c.cycleMs=1200]){
  const c=copy(ground);edit(c);assert.throws(()=>createAuthoredRouteAdapter({strideContract:stride,motionContract:c}),/Matching source-owned/);
 }
 for(const edit of [c=>c.soles.foreNear[0][0]=NaN,c=>c.clips.left90.bodyBounds=[],c=>c.clips.hop.bodyBounds=c.clips.hop.bodyBounds.filter(b=>b.atMs!==50),c=>c.clips.rest.frames[1].atMs=0]){
  const c=copy(ground);edit(c);assert.throws(()=>createAuthoredMotionGround(c,{remodel:'meadow'}),/authored ground/);
 }
 assert.throws(()=>guard({reservations:[{startMs:10,endMs:5,rect:{x:0,y:0,width:1,height:1}}]}),/authored ground/);
 const g=guard();const cov=g.coverage('hop',0);cov.polygons[0][0][0]=999;assert.notEqual(g.coverage('hop',0).polygons[0][0][0],999);
 assert.equal(g.canRunway({x:50,y:50},0,Infinity),false);assert.equal(g.canRunway({x:NaN,y:50},0,500),false);
});
test('corner routes keep exact canonical turn joins and source-sampled turn yaw',()=>{
 const a=adapter(),p=a.plan({...options(),entry:{x:57.68,y:57.68}});assert.equal(p.ok,true,p.reason);assert.ok(p.turnCount>=1);
 for(const leg of p.legs){
  if(leg.kind==='turn'){
   for(let t=0;t<leg.durationMs;t+=25){
    const sample=a.sample(p,leg.startMs+t);assert.deepEqual(sample.position,leg.position);
    assert.ok(Number.isFinite(sample.headingRadians));assert.equal(sample.motion.frameIndex,Math.floor(t/50));
    assert.equal(a.sample(p,leg.startMs+t+24.9).headingRadians,sample.headingRadians);
   }
   const after=a.sample(p,leg.endMs);if(after.motion.kind==='walk')assert.equal(after.frameIndex,0);
  }
 }
});
test('zero-length paths and forged reservation legs still require safe coherent geometry',()=>{
 const a=adapter(),g=guard();
 const p=a.plan({...options(),entry:{x:50,y:50}});assert.equal(p.ok,true);assert.equal(p.durationMs,0);
 assert.equal(a.plan({...options(),anchor:{x:0,y:0},entry:{x:0,y:0}}).reason,'AUTHORED_CANONICAL_STANCE_BLOCKED');
 const q=copy(a.plan(options()));q.legs[0].durationMs=1;q.legs[0].endMs=1;assert.equal(g.planAllowed(q,10000),false);
 q.legs[0].durationMs=3000;q.legs[0].endMs=3000;q.legs[0].to.x+=.1;assert.equal(g.planAllowed(q,10000),false);
 assert.equal(g.planAllowed({ok:true},0),false);
});
