import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CANONICAL_FOOD_EXCLUSION,canonicalFoodNavigationGeometry,canonicalFoodSceneState} from '../src/games/companion-yard-v2/pip-prototype/canonical-food-scene.mjs';
import {createCanonicalNavigation} from '../src/games/companion-yard-v2/pip-prototype/dynamic-navigation.mjs';
import {planCanonicalInspection,supportedPose,supportedWorldValid} from '../src/games/companion-yard-v2/pip-prototype/dynamic-prop-planner.mjs';
import {createCanonicalInspectionController} from '../src/games/companion-yard-v2/pip-prototype/dynamic-prop-controller.mjs';
import {sampleMotion} from '../src/games/companion-yard-v2/pip-prototype/motion/kinematics.mjs';
import {canonicalFoodCapabilities} from '../game-logic/yard-v2/canonical-food-protocol.mjs';
const actor=JSON.parse(fs.readFileSync(new URL('../src/games/companion-yard-v2/pip-prototype/data/fixture.json',import.meta.url))).actor;
const geometry=JSON.parse(fs.readFileSync(new URL('../game-logic/yard-v2/canonical-location-geometry.json',import.meta.url)));
const row=(x=80,y=60)=>({slotId:'canonical:a',goodieId:'leaf_pot',locationId:'pip-garden',locationVersion:1,geometryRevision:'pip-garden-t2-r1',itemGeometryRevision:'yard-succulent-T2',x,y,condition:'new',uses:0,placedAt:1});
const snapshot=rows=>({yard:{placedGoodies:[],bowls:[{id:'bowl-1',foodId:null,servings:0}]},yardRuntime:{version:1,status:'ready',canonicalPlacements:rows,foodLocationCapabilities:canonicalFoodCapabilities({canonicalFoodLocationEnabled:true})}});
const withFood=canonicalFoodNavigationGeometry(geometry,{reserved:true});
test('empty and occupied shared bowl reserve the exact same fixed source union; preview off leaves base untouched',()=>{
 const before=JSON.stringify(geometry),normal=snapshot([]),occupied=snapshot([row(80,82)]);
 assert.equal(canonicalFoodSceneState(normal).reserved,false);assert.equal(canonicalFoodSceneState(normal,{enabled:true}).state,'empty');assert.equal(canonicalFoodSceneState(normal,{enabled:true}).reserved,true);
 const conflict=canonicalFoodSceneState(occupied,{enabled:true});assert.equal(conflict.reason,'CANONICAL_FOOD_SOCKET_OCCUPIED');assert.deepEqual(conflict.occupiedSlotIds,['canonical:a']);assert.equal(conflict.reserved,true);
 assert.equal(canonicalFoodNavigationGeometry(geometry,canonicalFoodSceneState(normal)),geometry);assert.equal(JSON.stringify(geometry),before);
 assert.equal(CANONICAL_FOOD_EXCLUSION.radiusCanonical,3.843);assert.equal(CANONICAL_FOOD_EXCLUSION.heightCanonical,2.09);assert.equal(CANONICAL_FOOD_EXCLUSION.polygon.length,24);
 for(const [x,y]of CANONICAL_FOOD_EXCLUSION.polygon)assert.ok(Math.abs(Math.hypot(x-80,y-82)-3.843/Math.cos(Math.PI/24))<1e-12);
 const nav=createCanonicalNavigation({geometry:withFood,rows:[],actor,composition:false});assert.equal(nav.clearBox({x:79,y:81,width:2,height:2}),false);assert.equal(nav.passable({x:80,y:82}),false);
});
test('actual manual inspection route detours around food and every sampled body/foot polygon clears it',()=>{
 const rows=[row()],previous=supportedPose(actor),base=planCanonicalInspection({geometry,rows,actor,targetSlotId:rows[0].slotId,previous}),plan=planCanonicalInspection({geometry:withFood,rows,actor,targetSlotId:rows[0].slotId,previous});
 assert.equal(base.ok,true,base.code);assert.equal(plan.ok,true,plan.code);assert.notEqual(plan.anchor.id,base.anchor.id);assert.notDeepEqual(plan.stages.map(s=>s.route.segments),base.stages.map(s=>s.route.segments));
 const nav=createCanonicalNavigation({geometry:withFood,rows,actor});let baseHits=0,samples=0;
 for(const stage of base.stages)for(let at=0;at<=stage.route.totalMs;at+=25)if(!supportedWorldValid(sampleMotion(stage.route,stage.gait,actor,at),actor,nav))baseHits++;
 assert.ok(baseHits>0,'the former direct inspection really intersected this new obstacle');
 for(const stage of plan.stages)for(const at of [...Array.from({length:Math.ceil(stage.route.totalMs/16)},(_,i)=>i*16),stage.route.totalMs]){assert.ok(supportedWorldValid(sampleMotion(stage.route,stage.gait,actor,at),actor,nav));samples++;}
 assert.ok(samples>100);assert.ok(supportedWorldValid(plan.settled,actor,nav));
});
test('adding food while planning rejects old worker result and replans from held actual pose',async()=>{
 const jobs=[],c=createCanonicalInspectionController({geometry,actor,rows:[row()],planningNow:()=>0,planner:args=>new Promise(resolve=>jobs.push({args,resolve}))});
 c.request('canonical:a',0);const held=structuredClone(c.sample.world);c.updateLayout([row()],0,{geometry:withFood});assert.equal(jobs.length,2);assert.deepEqual(c.sample.world,held);
 jobs[0].resolve(planCanonicalInspection(jobs[0].args));await Promise.resolve();assert.equal(c.state.phase,'planning');
 jobs[1].resolve(planCanonicalInspection(jobs[1].args));await Promise.resolve();assert.equal(c.state.phase,'approaching');assert.equal(c.state.planLayoutKey,c.state.layoutKey);assert.match(c.state.layoutKey,/pip-garden:food:bowl-1/);c.tick(100000);assert.equal(c.state.phase,'settled');c.dispose();
});
