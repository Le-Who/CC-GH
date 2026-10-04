import test from 'node:test';import assert from 'node:assert/strict';
import {INTRINSIC_PROP_SOURCES,INTRINSIC_PROP_PROVIDERS,intrinsicPropIdentity,withIntrinsicPropProof,intrinsicPropReadiness} from '../game-logic/yard-v2/intrinsic-props.mjs';
import {SOURCE_PROP_OBSTACLES,createTrustedObstacleContext,planningSceneWithObstacles,propObstacleReceiptCompatible} from '../game-logic/yard-v2/prop-obstacles.mjs';
import {getMikaServerOptions} from '../game-logic/yard-v2/mika-media.mjs';
import {createMochiMedia} from '../game-logic/yard-v2/mochi-media.mjs';
import {createMotionGroundGuard} from '../game-logic/yard-v2/motion-ground-guard.mjs';
import {createAuthoredMotionGround} from '../game-logic/yard-v2/media/authored-motion-ground.mjs';
import {MOCHI_ACTOR_ASSETS} from '../game-logic/yard-v2/media/mochi-actor-assets.mjs';
import {footprint} from '../game-logic/yard-v2/geometry.mjs';
import {YARD_GOODIES,YARD_VISITORS} from '../game-logic/yard-v2/catalog.mjs';
import input from '../game-logic/yard-v2/media/shared-props/source-identities.json' with {type:'json'};
const copy=structuredClone,mika=getMikaServerOptions(),mochi=createMochiMedia();
const binding=(actor,ready=false)=>{const p=INTRINSIC_PROP_PROVIDERS.fountain_bowl.find(p=>p.actorId===actor);return withIntrinsicPropProof({id:p.bindingId,revision:p.bindingRevision,calibrationHash:p.bindingCalibrationHash,visitorId:p.visitorId,goodieId:'fountain_bowl',actorProfile:{id:p.actorId,revision:p.actorRevision},activityIds:copy(p.activityIds),conditions:copy(p.conditions),requiredPhases:copy(p.requiredPhases),validatedPhases:copy(p.sourceValidatedPhases),playbackReady:ready});};
const registry=(...ids)=>({bindings:ids.map(id=>binding(id,true))}),context=(...ids)=>createTrustedObstacleContext(registry(...ids));
const placed=(slotId,goodieId,x,y)=>({slotId,goodieId,x,y,condition:'new',rotationZ:0,uses:0});
const yard=()=>({remodel:'meadow',expansion:{level:1},placedGoodies:[placed('mouse','yarn_mouse',50,45),placed('fountain','fountain_bowl',50,75)]});
const candidate=who=>{const y=yard();return{at:0,leavesAt:3600000,placement:y.placedGoodies[0],yard:y,visitor:YARD_VISITORS[who==='mika'?'mika_cat':'mochi_bunny'],goodie:YARD_GOODIES.yarn_mouse,activity:{id:who==='mika'?'chase':'sniff'},bowl:{id:'bowl-1',foodId:'berry_plate'},active:[],reserved:[]};};
const owner=who=>who==='mika'?mika:mochi,bindingFor=who=>owner(who).mediaRegistry.bindings.find(b=>b.goodieId==='yarn_mouse');
const preflight=(who,q,c)=>who==='mika'?mika.preflight(q,bindingFor(who),c):mochi.preflightCandidate(q,bindingFor(who),c);

test('Basil-only, Sage-only and both attest one immutable Fountain identity; no provider remains closed',()=>{
 const a=context('basil'),b=context('sage'),both=context('basil','sage');assert.equal(a.providerProofs.fountain_bowl.length,1);assert.equal(b.providerProofs.fountain_bowl.length,1);assert.equal(both.providerProofs.fountain_bowl.length,2);
 assert.deepEqual(a.props,b.props);assert.deepEqual(a.props,both.props);assert.equal(a.revision,b.revision);assert.equal(a.revision,both.revision);assert.deepEqual(context().props,{});
 assert.equal(a.props.fountain_bowl.identity,INTRINSIC_PROP_SOURCES.fountain_bowl.identity);assert.ok(Object.isFrozen(a.props.fountain_bowl.footprint));assert.equal(binding('basil').playbackReady,false);assert.deepEqual(createTrustedObstacleContext({bindings:[binding('basil')]}).props,{});
});
test('intrinsic identity ignores provider additions/revisions/readiness but binds actual geometry and content',()=>{
 const original=input.sources.find(s=>s.goodieId==='fountain_bowl'),changed=copy(original);changed.providers.reverse();changed.providers[0].bindingRevision='later-provider';changed.providers[0].sourceRigSha256='a'.repeat(64);changed.providers.push({...changed.providers[0],actorId:'future-provider'});assert.equal(intrinsicPropIdentity(changed).identity,intrinsicPropIdentity(original).identity);
 for(const mutate of[s=>s.bounds.max[0]+=.1,s=>s.sourceGeometrySha256='f'.repeat(64),s=>s.stillSha256='e'.repeat(64),s=>s.paddingWorld+=.01]){const x=copy(original);mutate(x);assert.notEqual(intrinsicPropIdentity(x).identity,intrinsicPropIdentity(original).identity);}
});
test('provider proofs fail closed for changed geometry, actor/binding/calibration, missing phases or ambiguous duplicate',()=>{
 for(const mutate of[b=>b.playbackReady=false,b=>b.revision='changed',b=>b.calibrationHash='0'.repeat(64),b=>b.visitorId='mika_cat',b=>b.actorProfile.id='mika',b=>b.actorProfile.revision='old',b=>b.activityIds=['soak-left'],b=>b.goodieId='__proto__',b=>b.conditions=[],b=>b.requiredPhases=['approach'],b=>b.validatedPhases=[],b=>delete b.propSource,b=>b.propSource={propId:'fountain_bowl'},b=>b.propSource.sourceGeometrySha256='0'.repeat(64),b=>b.propSource.providerDigest='1'.repeat(64),b=>b.propSource.propIdentity='2'.repeat(64)]){const b=copy(binding('basil',true));mutate(b);assert.deepEqual(createTrustedObstacleContext({bindings:[b]}).props,{});}
 assert.deepEqual(createTrustedObstacleContext({bindings:[binding('basil',true),binding('basil',true)]}).props,{});
 assert.throws(()=>withIntrinsicPropProof({...binding('basil'),calibrationHash:'0'.repeat(64)}),/Exact intrinsic/);
});
test('reconstructed Moon r2 requires exact frozen providers; old r1 hashes and invented readiness cannot authenticate it',()=>{
 const moon=input.sources.find(s=>s.goodieId==='moon_lamp');assert.equal(input.format,'yard-verified-intrinsic-prop-sources/v2');
 assert.equal(INTRINSIC_PROP_SOURCES.moon_lamp.sourceGeometrySha256,'235109c092505775a91812eafe4d5ba680272c76a2ca10544ce3e5d40f4355eb');
 assert.equal(INTRINSIC_PROP_SOURCES.fountain_bowl.sourceGeometrySha256,'78281d411c1e9695e4373431723bead147cd1804eb31736c39329d8699489eef');
 assert.equal(moon.providers.length,3);
 for(const p of INTRINSIC_PROP_PROVIDERS.moon_lamp){
  assert.ok(p.requiredPhases.every(v=>p.sourceValidatedPhases.includes(v)));assert.match(p.bindingCalibrationHash,/^[a-f0-9]{64}$/);
  const b=withIntrinsicPropProof({id:p.bindingId,revision:p.bindingRevision,visitorId:p.visitorId,goodieId:'moon_lamp',actorProfile:{id:p.actorId,revision:p.actorRevision},calibrationHash:p.bindingCalibrationHash,playbackReady:true,conditions:copy(p.conditions),activityIds:copy(p.activityIds),requiredPhases:copy(p.requiredPhases),validatedPhases:copy(p.sourceValidatedPhases)});
  assert.equal(intrinsicPropReadiness({bindings:[b]}).props.moon_lamp.identity,INTRINSIC_PROP_SOURCES.moon_lamp.identity);
  for(const mutate of [b=>b.revision='moon-interaction/r1',b=>b.actorProfile.revision='fox-actor/r1',b=>b.propSource.sourceGeometrySha256='5af15a36d5950014ca36483d2052e88443edf6dcf80cfa3ad0b4b238dbbbe97f',b=>b.calibrationHash='a'.repeat(64),b=>b.conditions=['new','worn','broken','future'],b=>b.validatedPhases=['invented-complete'],b=>delete b.propSource.providerDigest]){const wrong=copy(b);mutate(wrong);assert.deepEqual(intrinsicPropReadiness({bindings:[wrong]}).props,{});}
 }
});
test('copied contexts and save-supplied geometry never mint trusted obstacles',()=>{
 const c=context('sage'),y=yard();y.placedGoodies[1].footprint={width:.01,height:.01};assert.equal(planningSceneWithObstacles(mika.scene,y,copy(c)).code,'UNTRUSTED_PROP_OBSTACLE_CONTEXT');const result=planningSceneWithObstacles(mika.scene,y,c);assert.equal(result.ok,true);assert.deepEqual(result.scene.footprints.fountain_bowl,INTRINSIC_PROP_SOURCES.fountain_bowl.footprint);assert.equal(mika.scene.footprints.fountain_bowl,undefined);
});
for(const who of ['mika','mochi'])test(`${who} routes around the ready intrinsic Fountain and blocks real interaction/portal collisions`,()=>{
 const q=candidate(who),before=JSON.stringify(q),c=context('basil'),r=preflight(who,q,c);assert.equal(r.ok,true,r.code);assert.equal(JSON.stringify(q),before);assert.equal(r.plan.obstacleReceipt.foreign[0].intrinsicIdentity,c.props.fountain_bowl.identity);
 const planning=planningSceneWithObstacles(owner(who).scene,q.yard,c),obstacles=q.yard.placedGoodies.map(p=>footprint(p,planning.scene)).concat(planning.scene.exclusions||[]),guard=who==='mika'?createMotionGroundGuard(q.yard,{scene:planning.scene}):createAuthoredMotionGround(MOCHI_ACTOR_ASSETS.ground,{remodel:q.yard.remodel,obstacles});
 for(const route of[r.plan.incoming,r.plan.outgoing,...(r.plan.restApproach?[r.plan.restApproach]:[])]){const finalYard={...q.yard,placedGoodies:q.yard.placedGoodies.map(p=>p.slotId==='mouse'?{...p,...r.plan.finalTransform}:p)},g=who==='mika'&&route!==r.plan.incoming?createMotionGroundGuard(finalYard,{scene:planning.scene}):guard;
  for(const l of route.legs)assert.equal(l.kind==='turn'?g.canTurn(l.position,l.fromFacing,l.direction,l.angleSteps):g.walkSegment(l.from,l.to,l.facing,l.phaseStart??0),true);}
 for(const[x,y]of [[32,45],[90,68]]){const q=candidate(who);q.yard.placedGoodies[1].x=x;q.yard.placedGoodies[1].y=y;const before=JSON.stringify(q);assert.equal(preflight(who,q,c).ok,false);assert.equal(JSON.stringify(q),before);}
 assert.equal(preflight(who,candidate(who),context()).ok,false);
 assert.equal(propObstacleReceiptCompatible(r.plan,registry('sage')),true);assert.equal(propObstacleReceiptCompatible(r.plan,registry('basil','sage')),true);assert.equal(propObstacleReceiptCompatible(r.plan,registry()),false);
 const changed=copy(r.plan);changed.obstacleReceipt.foreign[0].sourceGeometrySha256='0'.repeat(64);assert.equal(propObstacleReceiptCompatible(changed,registry('sage')),false);
});
test('legacy Snack/Leaf source descriptors retain their one-provider form',()=>{assert.equal(Object.keys(SOURCE_PROP_OBSTACLES).length,2);for(const c of Object.values(SOURCE_PROP_OBSTACLES)){assert.ok(c.bindingId&&c.bindingRevision&&c.sourceRigSha256);assert.equal(c.intrinsicIdentity,undefined);}});
