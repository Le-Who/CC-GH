import './yard-inventory-only-loader.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {getMikaServerOptions} from '../game-logic/yard-v2/mika-media.mjs';
import {createMochiMedia} from '../game-logic/yard-v2/mochi-media.mjs';
import {createPebbleMedia} from '../game-logic/yard-v2/pebble-media.mjs';
import {createPipMedia} from '../game-logic/yard-v2/pip-media.mjs';
import {createYardMedia} from '../game-logic/yard-v2/yard-media.mjs';
import {SOURCE_PROP_OBSTACLES,createTrustedObstacleContext,planningSceneWithObstacles} from '../game-logic/yard-v2/prop-obstacles.mjs';
import {createAdmissionPolicy} from '../game-logic/yard-v2/orchestrator.mjs';
import {presentationCompatibility} from '../game-logic/yard-v2/presentation-compatibility.mjs';
import {YARD_GOODIES,YARD_VISITORS} from '../game-logic/yard-v2/catalog.mjs';
import {validateLayout,footprint,overlaps} from '../game-logic/yard-v2/geometry.mjs';
import {createMotionGroundGuard} from '../game-logic/yard-v2/motion-ground-guard.mjs';
import {createAuthoredMotionGround} from '../game-logic/yard-v2/media/authored-motion-ground.mjs';
import {MOCHI_ACTOR_ASSETS} from '../game-logic/yard-v2/media/mochi-actor-assets.mjs';
import {digest} from '../game-logic/yard-v2/util.mjs';
import baseline from './fixtures/yard-mixed-obstacles/baseline-registries.json' with {type:'json'};
const copy=structuredClone,mika=getMikaServerOptions(),mochi=createMochiMedia(),pebble=createPebbleMedia(),pip=createPipMedia();
const accept=s=>({...s,preflight:s.preflightCandidate,actorProfiles:{[s.candidateProfile.id]:{...copy(s.candidateProfile),playbackReady:true}},mediaRegistry:{...copy(s.mediaRegistry),bindings:s.mediaRegistry.bindings.map(b=>({...copy(b),playbackReady:true}))}});
const options=createYardMedia({mochi:accept(mochi),pebble:accept(pebble),pip:accept(pip)}),context=createTrustedObstacleContext(options.mediaRegistry);
const placed=(slotId,goodieId,x,y)=>({slotId,goodieId,x,y,rotationZ:0,condition:'new',uses:0,opaque:{keep:slotId}});
function yard(){return{remodel:'meadow',expansion:{level:1},placedGoodies:[placed('mouse','yarn_mouse',50,45),placed('snack','snack_table',50,30),placed('leaf','leaf_pot',30,70)]};}
function candidate(who='mika',y=yard()) {return{at:0,leavesAt:3600000,placement:y.placedGoodies[0],yard:y,visitor:YARD_VISITORS[who==='mika'?'mika_cat':'mochi_bunny'],goodie:YARD_GOODIES.yarn_mouse,activity:{id:who==='mika'?'chase':'sniff'},bowl:{id:'bowl-1',foodId:'berry_plate'},active:[],reserved:[]};}
const sourceFor=who=>who==='mika'?mika:mochi;
const bindingFor=who=>sourceFor(who).mediaRegistry.bindings.find(b=>b.goodieId==='yarn_mouse');
const direct=(who,q,c=context)=>who==='mika'?mika.preflight(q,bindingFor(who),c):mochi.preflightCandidate(q,bindingFor(who),c);

test('all four existing calibrated registries remain byte-identical to the pre-obstacle checkpoint',()=>{for(const [id,s]of Object.entries({mika,mochi,pebble,pip}))assert.deepEqual(s.mediaRegistry,baseline[id]);assert.deepEqual(createYardMedia().mediaRegistry,mika.mediaRegistry);});
test('only exact ready source bindings mint fixed geometry, never save-supplied dimensions',()=>{
 assert.deepEqual(context.props.snack_table.footprint,pip.scene.footprints.snack_table);assert.deepEqual(context.props.leaf_pot.footprint,pebble.scene.footprints.leaf_pot);assert.equal(Object.isFrozen(context.props.snack_table.footprint),true);
 const closed=createTrustedObstacleContext({bindings:[...pip.mediaRegistry.bindings,...pebble.mediaRegistry.bindings]});assert.deepEqual(closed.props,{});
 for(const mutate of[b=>b.revision='stale',b=>b.playbackReady=false,b=>b.validatedPhases=[],b=>b.goodieId='cloud_bed',b=>b.visitorId='willow_fox']){const b=copy(options.mediaRegistry.bindings.find(b=>b.goodieId==='snack_table'));mutate(b);assert.deepEqual(createTrustedObstacleContext({bindings:[b]}).props,{});}
 const y=yard();y.placedGoodies[1].footprint={width:.0001,height:.0001};const r=planningSceneWithObstacles(mika.scene,y,context);assert.equal(r.ok,true);assert.deepEqual(r.scene.footprints.snack_table,pip.scene.footprints.snack_table);assert.deepEqual(mika.scene.footprints,{yarn_mouse:{width:8.8,height:3.2},sun_cushion:{width:22.4,height:19.2}});
 assert.equal(planningSceneWithObstacles(mika.scene,y,JSON.parse(JSON.stringify(context))).code,'UNTRUSTED_PROP_OBSTACLE_CONTEXT');
});
for(const who of['mika','mochi'])test(`${who} safely admits a mixed source yard, with immutable placements and source calibration`,()=>{
 const q=candidate(who),before=JSON.stringify(q),r=direct(who,q);assert.equal(validateLayout(q.yard,options.scene).ok,true);assert.equal(r.ok,true,r.code);assert.equal(JSON.stringify(q),before);
 assert.equal(r.plan.obstacleReceipt.foreign.length,2);assert.equal(r.plan.obstacleReceipt.contextRevision,context.revision);assert.equal(r.plan.obstacleReceipt.placementHash,digest(q.yard.placedGoodies.map(p=>({slotId:p.slotId,goodieId:p.goodieId,x:p.x,y:p.y,condition:p.condition,rotationZ:p.rotationZ??0}))));
 assert.deepEqual(sourceFor(who).mediaRegistry,baseline[who]);const admitted=createAdmissionPolicy(options)(q);assert.equal(admitted.ok,true,admitted.code);assert.equal(admitted.binding.bindingCalibrationHash,bindingFor(who).calibrationHash);assert.equal(admitted.binding.plan.obstacleReceipt.foreign.length,2);
 console.log('MIXED_SOURCE_PASS',JSON.stringify({who,placementHash:r.plan.obstacleReceipt.placementHash,incoming:r.plan.incoming.durationMs,outgoing:r.plan.outgoing.durationMs,calibration:admitted.binding.bindingCalibrationHash}));
});
for(const who of['mika','mochi'])test(`${who} uses new props in interaction, navigation, sole and turn exclusion checks`,()=>{
 const q=candidate(who),r=direct(who,q);assert.equal(r.ok,true);const planning=planningSceneWithObstacles(sourceFor(who).scene,q.yard,context),obstacles=q.yard.placedGoodies.map(p=>footprint(p,planning.scene)).concat(planning.scene.exclusions||[]);
 const guard=who==='mika'?createMotionGroundGuard(q.yard,{scene:planning.scene}):createAuthoredMotionGround(MOCHI_ACTOR_ASSETS.ground,{remodel:q.yard.remodel,obstacles});
 for(const route of[r.plan.incoming,r.plan.outgoing,...(r.plan.restApproach?[r.plan.restApproach]:[])]){
 const finalYard={...q.yard,placedGoodies:q.yard.placedGoodies.map(p=>p.slotId===q.placement.slotId?{...p,...r.plan.finalTransform}:p)},routeGuard=who==='mika'&&route!==r.plan.incoming?createMotionGroundGuard(finalYard,{scene:planning.scene}):guard;
 for(const leg of route.legs){if(leg.kind==='turn')assert.equal(routeGuard.canTurn(leg.position,leg.fromFacing,leg.direction,leg.angleSteps),true);else assert.equal(routeGuard.walkSegment(leg.from,leg.to,leg.facing,leg.phaseStart??0),true,JSON.stringify(leg));}}

 // The table remains separate from the mouse yet intersects the full actor's action region.
 const blocked=candidate(who);blocked.yard.placedGoodies[1].x=32;blocked.yard.placedGoodies[1].y=45;const before=JSON.stringify(blocked),no=direct(who,blocked);assert.equal(no.ok,false);assert.ok(['INTERACTION_ENVELOPE_COLLISION','COMPOSITE_REGION_BLOCKED'].includes(no.code),no.code);assert.equal(JSON.stringify(blocked),before);
 const portal=candidate(who);portal.yard.placedGoodies[1].x=90;portal.yard.placedGoodies[1].y=68;assert.equal(direct(who,portal).ok,false);
});
test('closed, stale, unknown, worn or rotated foreign props still fail without consuming or moving anything',()=>{
 for(const who of['mika','mochi']){
  const q=candidate(who);q.obstacleContext=context;q.yard.placedGoodies[1].sourceFootprint=SOURCE_PROP_OBSTACLES.snack_table;
  const no=who==='mika'?mika.preflight(q,bindingFor(who)):mochi.preflightCandidate(q,bindingFor(who));assert.equal(no.ok,false); // explicitly call old source without a trusted context below
  const closed=createTrustedObstacleContext(createYardMedia().mediaRegistry);assert.equal(direct(who,candidate(who),closed).ok,false);
  for(const mutate of[p=>p.condition='worn',p=>p.condition='broken',p=>p.rotationZ=.2,p=>p.goodieId='cloud_bed',p=>p.goodieId='__proto__',p=>p.goodieId='constructor',p=>p.goodieId='toString']){const c=candidate(who);mutate(c.yard.placedGoodies[1]);const before=JSON.stringify(c);assert.equal(direct(who,c).ok,false);assert.equal(JSON.stringify(c),before);}
  assert.equal(direct(who,candidate(who),copy(context)).code,'UNTRUSTED_PROP_OBSTACLE_CONTEXT');
 }
});
test('readiness caches separate trusted contexts and never accept copied context receipts or leak account slots',()=>{
 const y=yard(),a=mika.placementReadiness(y,{obstacleContext:context}),b=mochi.sourcePlacementReadiness(y,context);assert.equal(a[0].status,'ready');assert.equal(b[0].status,'ready');
 const other=copy(y);other.placedGoodies.forEach(p=>p.slotId+='-other');assert.equal(mika.placementReadiness(other,{obstacleContext:context})[0].slotId,'mouse-other');assert.equal(mochi.sourcePlacementReadiness(other,context)[0].slotId,'mouse-other');
 assert.notEqual(mika.placementReadiness(y,{obstacleContext:copy(context)})[0].status,'ready');assert.notEqual(mochi.sourcePlacementReadiness(y,copy(context))[0].status,'ready');
});

for(const [who,target,foreign]of[['pip',placed('snack','snack_table',50,50),placed('leaf','leaf_pot',30,70)],['pebble',placed('leaf','leaf_pot',60,48),placed('snack','snack_table',50,30)]])test(`${who} also receives the other source obstacle without actor retiming`,()=>{
 const source=who==='pip'?pip:pebble,y={remodel:'meadow',expansion:{level:1},placedGoodies:[target,foreign]},q={at:0,leavesAt:3600000,placement:target,yard:y,visitor:YARD_VISITORS[source.candidateProfile.visitorId],goodie:YARD_GOODIES[target.goodieId],activity:{id:who==='pip'?'nibble':'sniff'},bowl:{id:'bowl-1',foodId:'kibble'},active:[],reserved:[]},before=JSON.stringify(q);
 const r=createAdmissionPolicy(options)(q);assert.equal(r.ok,true,r.code);assert.equal(JSON.stringify(q),before);assert.equal(r.binding.plan.obstacleReceipt.foreign.length,1);assert.equal(r.binding.bindingCalibrationHash,source.mediaRegistry.bindings[0].calibrationHash);assert.equal(r.binding.plan.groundFootprintRevision,source.candidateProfile.ground.revision);
});

test('old serialized actor plans stay compatible when trusted foreign geometry is added to the registry',()=>{
 for(const who of['mika','mochi']){
  const q=candidate(who);q.yard.placedGoodies=[q.placement];const source=sourceFor(who),trusted=who==='mika'?source:accept(source),admitted=createAdmissionPolicy(trusted)(q);assert.equal(admitted.ok,true,admitted.code);assert.equal(admitted.binding.plan.obstacleReceipt,undefined);
  const record=JSON.parse(JSON.stringify({source:'native',status:'active',original:{visitorId:q.visitor.id},placement:q.placement,activityId:q.activity.id,mediaAdmission:admitted.binding})),before=JSON.stringify(record);
  const compatible=presentationCompatibility(record,options.mediaRegistry,digest(options.mediaRegistry),options.actorProfiles);assert.equal(compatible.renderCompatible,true,JSON.stringify(compatible));assert.equal(JSON.stringify(record),before);
  const legacy=copy(record);delete legacy.mediaAdmission.bindingCalibrationHash;const prior=presentationCompatibility(legacy,trusted.mediaRegistry,digest(trusted.mediaRegistry),trusted.actorProfiles);assert.equal(prior.renderCompatible,true);assert.equal(presentationCompatibility(legacy,options.mediaRegistry,digest(options.mediaRegistry),options.actorProfiles).renderCompatible,false);
 }
});
test('native mixed-yard admission consumes once, persists its obstacle proof, and blocks unsupported prop states before spend',async()=>{
 const {createDefaultPlayer}=await import('../game-logic/player.js'),{ensurePersistentPlayerYard,publicPersistentYard}=await import('../game-logic/yard-v2/service.mjs');const NOW=Date.UTC(2026,9,3,12),H=3600000;
 const player=()=>{const p=createDefaultPlayer('mixed-obstacles-7','QA',NOW);p.yard.placedGoodies=yard().placedGoodies;p.yard.bowls[0]={id:'bowl-1',foodId:'berry_plate',servings:5,placedAt:NOW,expiresAt:NOW+5*H};return p;};
 const p=player(),foreign=copy(p.yard.placedGoodies.slice(1));ensurePersistentPlayerYard(p,{now:NOW,...options});assert.equal(ensurePersistentPlayerYard(p,{now:NOW+H,simulate:true,...options}).status,200);
 const visit=Object.values(p._yardV2.runtime.visits).find(v=>v.original.visitorId==='mochi_bunny');assert.ok(visit);assert.equal(visit.mediaAdmission.plan.obstacleReceipt.foreign.length,2);assert.equal(p.yard.bowls[0].servings,4);assert.equal(p.yard.placedGoodies[0].uses,1);assert.deepEqual(p.yard.placedGoodies.slice(1),foreign);
 const loaded=JSON.parse(JSON.stringify(p)),before=JSON.stringify(loaded),view=publicPersistentYard(loaded,{now:visit.arrivedAt+10000,...options});assert.equal(view.visits.find(v=>v.visitId===visit.visitId).renderCompatible,true);assert.equal(JSON.stringify(loaded),before);assert.equal(ensurePersistentPlayerYard(loaded,{now:NOW+H,simulate:true,...options}).status,200);assert.equal(JSON.stringify(loaded),before);
 const blocked=player();blocked.yard.placedGoodies[1].condition='worn';const saved=copy(blocked.yard);ensurePersistentPlayerYard(blocked,{now:NOW,...options});assert.equal(ensurePersistentPlayerYard(blocked,{now:NOW+H,simulate:true,...options}).status,200);assert.equal(Object.keys(blocked._yardV2.runtime.visits).length,0);assert.equal(blocked.yard.bowls[0].servings,5);assert.deepEqual(blocked.yard.placedGoodies,saved.placedGoodies);assert.deepEqual(blocked.yard.petbook,saved.petbook);
});

test('a changed foreign source hides only affected mixed presentation without touching its old actor identity or saved outcome',()=>{
 const q=candidate('mochi'),admitted=createAdmissionPolicy(options)(q);assert.equal(admitted.ok,true);const record={source:'native',original:{visitorId:q.visitor.id},placement:q.placement,activityId:q.activity.id,mediaAdmission:admitted.binding};const before=JSON.stringify(record);
 assert.equal(presentationCompatibility(record,options.mediaRegistry,digest(options.mediaRegistry),options.actorProfiles).renderCompatible,true);
 for(const mutate of[r=>r.bindings.find(b=>b.goodieId==='snack_table').revision='new-source',r=>r.bindings.find(b=>b.goodieId==='leaf_pot').playbackReady=false]){const registry=copy(options.mediaRegistry);mutate(registry);const c=presentationCompatibility(record,registry,digest(registry),options.actorProfiles);assert.equal(c.renderCompatible,false);assert.ok(c.presentationIssues.includes('PROP_OBSTACLE_SOURCE_MISMATCH'));assert.equal(JSON.stringify(record),before);}
 const unrelated=copy(options.mediaRegistry);unrelated.revision='unrelated-registry';unrelated.futureMetadata={keep:true};assert.equal(presentationCompatibility(record,unrelated,digest(unrelated),options.actorProfiles).renderCompatible,true);
 for(const bad of[null,{}, {...record.mediaAdmission.plan.obstacleReceipt,foreign:[]}, {...record.mediaAdmission.plan.obstacleReceipt,foreign:[{...record.mediaAdmission.plan.obstacleReceipt.foreign[0],footprint:{width:.1,height:.1}}]}]){const r=copy(record);r.mediaAdmission.plan.obstacleReceipt=bad;assert.equal(presentationCompatibility(r,options.mediaRegistry,digest(options.mediaRegistry),options.actorProfiles).renderCompatible,false);}
});
