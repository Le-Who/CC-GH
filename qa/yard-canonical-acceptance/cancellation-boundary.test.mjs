import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import setup from '../../src/games/companion-yard-v2/pip-prototype/data/fixture.json' with {type:'json'};
import geometry from '../../game-logic/yard-v2/canonical-location-geometry.json' with {type:'json'};
import {planCanonicalInspection,supportedPose} from '../../src/games/companion-yard-v2/pip-prototype/dynamic-prop-planner.mjs';
import {createCanonicalInspectionController} from '../../src/games/companion-yard-v2/pip-prototype/dynamic-prop-controller.mjs';
const actor=setup.actor,row=(x,y,id)=>({locationId:'pip-garden',locationVersion:1,geometryRevision:'pip-garden-t2-r1',itemGeometryRevision:'yard-succulent-T2',slotId:'canonical:'+id,goodieId:'leaf_pot',x,y,condition:'new',uses:0,placedAt:1}),rows=[row(108,122,'target'),row(94,135,'blocker')];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const make=()=>createCanonicalInspectionController({geometry,actor,rows,planningNow:()=>0});
function preserved(before,after){assert.deepEqual(after.root,before.root);assert.equal(after.heading,before.heading);for(const side of before.support){assert.deepEqual(after.feet[side].position,before.feet[side].position);assert.equal(after.feet[side].heading,before.feet[side].heading);}}
test('actual run initial-turn cancellation holds entry; approaching alone does not prove departure',()=>{
 const plan=planCanonicalInspection({geometry,actor,rows,targetSlotId:rows[0].slotId,previous:supportedPose(actor)});assert.equal(plan.ok,true);assert.equal(plan.stages[0].kind,'orient-with-steps');assert.equal(plan.stages[0].route.totalMs,1670);assert.equal(plan.stages[0].route.length,0);
 const c=make(),at=518.7000000000114;c.request(rows[0].slotId,0);c.tick(at);assert.equal(c.state.phase,'approaching');const before=structuredClone(c.sample.world);assert.deepEqual(before.root,{x:79,y:129.5,z:0});assert.equal(before.distance,0);
 c.updateLayout([rows[1]],at);c.tick(at+620);const after=c.sample.world;preserved(before,after);assert.equal(c.state.phase,'cancelled');
 assert(Math.abs(after.heading-(-1.435683194231785))<1e-12);
 assert.deepEqual(after.feet.L.position,{x:82.86830534354463,y:127.33767122014132,z:0});assert.deepEqual(after.feet.R.position,{x:75.86579212243589,y:126.32101738519023,z:0});c.dispose();
});
test('move and delete after measured translation preserve actual root and supports at the mutation boundary',()=>{
 for(const operation of['move','delete']){const c=make(),entry=structuredClone(c.sample.world.root);c.request(rows[0].slotId,0);let at=0;for(;at<12000;at+=16){c.tick(at);if(c.state.phase==='approaching'&&distance(c.sample.world.root,entry)>1)break;}assert(at<12000);const before=structuredClone(c.sample.world);assert(distance(before.root,entry)>1);
  c.updateLayout(operation==='delete'?[rows[1]]:[{...rows[0],x:110},rows[1]],at);c.tick(at+100);preserved(before,c.sample.world);c.tick(at+620);preserved(before,c.sample.world);
  if(operation==='delete'){assert.equal(c.state.phase,'cancelled');assert.equal(c.state.active,false);assert(distance(c.sample.world.root,entry)>1);}else assert.equal(c.state.planLayoutKey,c.state.layoutKey);c.dispose();
 }
});
test('browser keeps departure predicates and separates every screenshot from its recording context',async()=>{
 const source=await fs.readFile(new URL('./acceptance.spec.mjs',import.meta.url),'utf8');
 assert.match(source,/beforeMove=await departed\(p,moveEntry/);assert.match(source,/beforeDelete=await departed\(p,deleteEntry/);
 assert.match(source,/Cancellation must not teleport to entry/);assert.match(source,/deleteRecovery\.before\.dynamicSample\.world\.root/);
 const recorded=source.slice(source.indexOf('const recordingStart='),source.indexOf('const raw=await video.path()'));
 assert.doesNotMatch(recorded,/jitter\(|capture\(|screenshot\(|setViewportSize\(/);assert.match(source,/if\(!active\.recording\)await capture/);
});
