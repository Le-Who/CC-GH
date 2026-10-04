import test from 'node:test';import assert from 'node:assert/strict';
import {createEightAcceptanceOptions} from './fixtures/yard-eight-canonical/acceptance.mjs';
import {candidate,nativePlayer,NOW,H,EIGHT_FIXTURE_SPECS} from './helpers/yard-eight-fixtures.mjs';
import {createAdmissionPolicy} from '../game-logic/yard-v2/orchestrator.mjs';
import {ensurePersistentPlayerYard,publicPersistentYard,executePersistentYardAction} from '../game-logic/yard-v2/service.mjs';
import {YARD_GOODIES,YARD_VISITORS} from '../game-logic/yard-v2/catalog.mjs';
import {FAMILY_ASSETS} from '../game-logic/yard-v2/media/family-assets.mjs';
import {FAMILY_RELEASE_GATE,conditionAtUses} from '../game-logic/yard-v2/family-media-source.mjs';
import {getYardServerOptions} from '../game-logic/yard-v2/yard-media.mjs';
import {createFamilySourceMedia} from '../game-logic/yard-v2/family-media-source.mjs';
import {MIKA_SCENE} from '../game-logic/yard-v2/mika-media.mjs';
const options=createEightAcceptanceOptions(),policy=createAdmissionPolicy(options),copy=structuredClone;
test('family readiness reuses geometry across slot identities/opaque fields, reattaches IDs and preserves validation classes',()=>{
 const source=createFamilySourceMedia('sage',{scene:copy(MIKA_SCENE)}),a=candidate('sage').yard;let reads=0;
 Object.defineProperty(a.placedGoodies[0],'uses',{enumerable:true,get(){reads++;return 0;}});
 const first=source.sourcePlacementReadiness(a);assert.equal(first[0].status,'ready');assert.ok(reads>1,'cold source validation must actually read the candidate');
 const b=copy(a);b.placedGoodies[0].slotId='other-account-slot';b.placedGoodies[0].opaque={unrelated:['keep','out','of','geometry']};
 Object.defineProperty(b.placedGoodies[0],'uses',{enumerable:true,get(){reads++;return 0;}});reads=0;
 const reused=source.sourcePlacementReadiness(b);assert.equal(reads,1,'semantic cache hit must avoid a fresh preflight');assert.equal(reused[0].slotId,'other-account-slot');assert.equal(first[0].slotId,'target');
 reused[0].status='caller-mutated';assert.equal(source.sourcePlacementReadiness(b)[0].status,'ready');
 const invalid=copy(b);invalid.placedGoodies[0].slotId='';assert.notEqual(source.sourcePlacementReadiness(invalid)[0].status,'ready');
 const corrupt=copy(b);corrupt.placedGoodies[0].condition='broken';assert.notEqual(source.sourcePlacementReadiness(corrupt)[0].status,'ready');
 assert.equal(source.sourcePlacementReadiness(b,{untrusted:true})[0].reason,'UNTRUSTED_PROP_OBSTACLE_CONTEXT');
});
test('family readiness invalidates geometry, expansion and duplicate slot classes',()=>{
 const source=createFamilySourceMedia('sage',{scene:copy(MIKA_SCENE)}),baseline=candidate('sage').yard;source.sourcePlacementReadiness(baseline);
 const cold=yard=>{let reads=0;for(const p of yard.placedGoodies){const uses=p.uses;Object.defineProperty(p,'uses',{enumerable:true,get(){reads++;return uses;}});}const rows=source.sourcePlacementReadiness(yard);assert.ok(reads>yard.placedGoodies.length,'changed semantic input must run source validation');return rows;};
 const moved=copy(baseline);moved.placedGoodies[0].x=-1000;assert.notEqual(cold(moved)[0].status,'ready');
 const expanded=copy(baseline);expanded.expansion.level=2;assert.equal(cold(expanded)[0].status,'ready');
 const two=copy(baseline);two.placedGoodies=[{...two.placedGoodies[0],slotId:'left',x:35,y:42},{...two.placedGoodies[0],slotId:'right',x:55,y:48}];assert.ok(source.sourcePlacementReadiness(two).every(r=>r.status==='ready'));
 const duplicate=copy(two);duplicate.placedGoodies[1].slotId='left';assert.ok(cold(duplicate).every(r=>r.status!=='ready'&&r.reason==='TARGET_PLACEMENT_MISMATCH'));
 assert.ok(source.sourcePlacementReadiness(two).every(r=>r.status==='ready'));
});
for(const actorId of ['willow','starlit','basil','sage'])test(`${actorId}: every wear boundary selects exact post-admission pixels and consumes exactly once`,()=>{
 const g=YARD_GOODIES[EIGHT_FIXTURE_SPECS[actorId].goodieId],d=g.durability;
 for(const uses of [0,d-2,d-1,d,2*d-2,2*d-1,2*d]){
  const q=candidate(actorId,{uses}),before=JSON.stringify(q),r=policy(q);assert.equal(r.ok,true,r.code);assert.equal(JSON.stringify(q),before);
  const plan=r.binding.plan,c=FAMILY_ASSETS[actorId].clips[plan.clipId],after=conditionAtUses(uses+1,d);
  assert.deepEqual(c.conditions,[after]);assert.equal(plan.initialPlacement.condition,after);assert.equal(plan.initialPlacement.uses,uses+1);assert.equal(plan.conditionReceipt.usesBefore,uses);assert.equal(plan.conditionReceipt.usesAfter,uses+1);assert.equal(plan.conditionReceipt.sourceClipId,c.id);
  assert.equal(plan.schedule.leavesAt-q.at,110*60000);assert.equal(plan.propReleaseAt,plan.schedule.combinedEnd);assert.equal(plan.departureAt,plan.schedule.combinedEnd);
  const p=nativePlayer(actorId,{uses}),neighbor=copy({resources:p.resources,garden:p.garden,merge:p.merge,futureAccount:p.futureAccount});
  assert.equal(ensurePersistentPlayerYard(p,{now:NOW,...options}).status,200);assert.equal(ensurePersistentPlayerYard(p,{now:NOW+H,simulate:true,...options}).status,200);
  const records=Object.values(p._yardV2.runtime.visits);assert.equal(records.length,1,JSON.stringify(p._yardV2.runtime.events));const saved=records[0];assert.equal(saved.original.visitorId,EIGHT_FIXTURE_SPECS[actorId].visitorId);
  assert.equal(saved.mediaAdmission.plan.clipId,plan.clipId);assert.equal(p.yard.placedGoodies[0].uses,uses+1);assert.equal(p.yard.placedGoodies[0].condition,after);assert.equal(p.yard.bowls[0].servings,0);assert.equal(p.yard.petbook[saved.original.visitorId].visits,1);
  const preserved=JSON.stringify(p),view=publicPersistentYard(p,{now:NOW+H,...options});assert.equal(view.visits[0].renderCompatible,true,view.visits[0].presentationIssues.join(','));assert.equal(JSON.stringify(p),preserved);
  const restored=JSON.parse(preserved);assert.equal(ensurePersistentPlayerYard(restored,{now:NOW+H,simulate:true,...options}).status,200);assert.deepEqual(restored,p);
  assert.deepEqual({resources:p.resources,garden:p.garden,merge:p.merge,futureAccount:p.futureAccount},neighbor);
 }
});
test('Starlit glow admits only post-use new, rejects threshold/worn/broken before serving, wear or petbook',()=>{
 const d=YARD_GOODIES.moon_lamp.durability;
 for(const uses of [0,d-2,d-1,d,2*d-2,2*d-1,2*d]){
  const q=candidate('starlit',{uses,activityId:'glow'}),before=JSON.stringify(q),r=policy(q);assert.equal(JSON.stringify(q),before);
  assert.equal(r.ok,uses<d-1);if(uses===d-1)assert.equal(r.code,'POST_ADMISSION_PROP_STATE_UNSUPPORTED');
 }
 const p=nativePlayer('starlit',{uses:d-1,activityId:'glow'});const economy=copy(p.yard);
 ensurePersistentPlayerYard(p,{now:NOW,...options});ensurePersistentPlayerYard(p,{now:NOW+H,simulate:true,...options});
 assert.deepEqual(p.yard.placedGoodies,economy.placedGoodies);assert.deepEqual(p.yard.bowls,economy.bowls);assert.deepEqual(p.yard.petbook,economy.petbook);assert.equal(Object.values(p._yardV2.runtime.visits).length,0);
 assert.ok(p._yardV2.runtime.events.some(e=>e.reason==='POST_ADMISSION_PROP_STATE_UNSUPPORTED'));
});
test('Sage Fountain+Berry and Starlit Moon+Bonito are strict; Willow has one peek binding using listen variant',()=>{
 for(const [id,foodId]of [['sage','kibble'],['starlit','berry_plate']]){const q=candidate(id);q.bowl.foodId=foodId;const before=JSON.stringify(q);assert.equal(policy(q).code,'REQUIRED_PROP_OR_FOOD_UNAVAILABLE');assert.equal(JSON.stringify(q),before);}
 const willow=options.mediaRegistry.bindings.filter(b=>b.visitorId===YARD_VISITORS.willow_fox.id);assert.equal(willow.length,1);assert.deepEqual(willow[0].activityIds,['peek']);
 for(const condition of ['new','worn','broken'])assert.match(willow[0].conditionContract[condition].clipId,new RegExp(`willow-listen-${condition}-r7`));
 assert.equal(policy(candidate('willow',{activityId:'listen'})).code,'UNSUPPORTED_VISIT_MEDIA');
});
for(const actorId of Object.keys(EIGHT_FIXTURE_SPECS))for(const minutes of actorId==='mochi'?[45,109]:[45,110])test(`${actorId} native ${minutes}min: reload/partition/completion and lost collect reply are exactly once`,()=>{
 const uses=minutes===110&&['basil','sage'].includes(actorId)?YARD_GOODIES.fountain_bowl.durability:0,activityId=minutes===110&&actorId==='starlit'?'glow':EIGHT_FIXTURE_SPECS[actorId].activityId;
 const p=nativePlayer(actorId,{minutes,uses,activityId}),other=copy({resources:p.resources,garden:p.garden,merge:p.merge,futureAccount:p.futureAccount});
 assert.equal(ensurePersistentPlayerYard(p,{now:NOW,...options}).status,200);assert.equal(ensurePersistentPlayerYard(p,{now:NOW+H,simulate:true,...options}).status,200);
 const rows=Object.values(p._yardV2.runtime.visits);assert.equal(rows.length,1,JSON.stringify(p._yardV2.runtime.events));const row=rows[0];assert.equal(row.original.visitorId,EIGHT_FIXTURE_SPECS[actorId].visitorId);assert.equal(row.leavesAt-row.arrivedAt,minutes*60000);
 const parts=JSON.parse(JSON.stringify(p)),bulk=copy(p),plan=row.mediaAdmission.plan;
 for(const at of [...new Set([plan.schedule.enterAt,plan.schedule.combinedStart,plan.schedule.segments.find(s=>s.kind==='loop')?.startAt,plan.schedule.combinedEnd,row.leavesAt-1].filter(Number.isSafeInteger))].sort((a,b)=>a-b)){
  const before=JSON.stringify(parts),view=publicPersistentYard(parts,{now:at,...options});assert.equal(view.visits[0].renderCompatible,true);assert.equal(JSON.stringify(parts),before);
  assert.equal(ensurePersistentPlayerYard(parts,{now:at,simulate:true,...options}).status,200);assert.equal(parts.yard.pendingGifts.length,0);
 }
 assert.equal(ensurePersistentPlayerYard(parts,{now:row.leavesAt,simulate:true,...options}).status,200);assert.equal(ensurePersistentPlayerYard(bulk,{now:row.leavesAt,simulate:true,...options}).status,200);assert.deepEqual(parts,bulk);
 assert.equal(bulk.yard.pendingGifts.length,1);const once=copy(bulk);ensurePersistentPlayerYard(bulk,{now:row.leavesAt+1,simulate:true,...options});assert.deepEqual(bulk.yard, {...once.yard,lastSimulatedAt:row.leavesAt+1});assert.equal(Object.values(bulk._yardV2.runtime.giftLedger).length,1);
 const actionId=`yard-v2:eight-${actorId}-${minutes}-collect`,gift=copy(bulk.yard.pendingGifts[0]),balance=copy(bulk.yard.currencies),result=executePersistentYardAction(bulk,'yard.collectGifts',{}, {...options,now:row.leavesAt+1,actionId});assert.equal(result.status,200);
 for(const k of ['treats','shinyTreats'])assert.equal(bulk.yard.currencies[k],balance[k]+gift[k]);const claimed=JSON.parse(JSON.stringify(bulk));assert.equal(executePersistentYardAction(claimed,'yard.collectGifts',{}, {...options,now:row.leavesAt+H,actionId}).replayed,true);assert.deepEqual(claimed,bulk);
 assert.equal(executePersistentYardAction(claimed,'yard.collectGifts',{unexpected:true},{...options,now:row.leavesAt+H,actionId}).status,409);assert.deepEqual(claimed,bulk);
 assert.deepEqual({resources:bulk.resources,garden:bulk.garden,merge:bulk.merge,futureAccount:bulk.futureAccount},other);
 console.log('EIGHT_NATIVE_WITNESS',JSON.stringify({actorId,minutes,seed:p.id,visitId:row.visitId,clipId:plan.clipId,condition:plan.conditionReceipt||null}));
});
test('restored source condition corruption stays preserved and invisible, without economic normalization',()=>{
 const p=nativePlayer('starlit',{activityId:'glow'});ensurePersistentPlayerYard(p,{now:NOW,...options});ensurePersistentPlayerYard(p,{now:NOW+H,simulate:true,...options});
 const visit=Object.values(p._yardV2.runtime.visits)[0];assert.equal(visit.activityId,'glow');
 for(const mutate of [r=>r.placement.uses++,r=>r.mediaAdmission.plan.clipId='starlit-watch-worn-r6',r=>r.mediaAdmission.plan.conditionReceipt.conditionAfter='worn',r=>r.mediaAdmission.plan.initialPlacement.condition='broken',r=>delete r.mediaAdmission.plan.conditionReceipt,r=>r.mediaAdmission.plan.calibrationHash='a'.repeat(64)]){
  const corrupt=copy(p),row=Object.values(corrupt._yardV2.runtime.visits)[0];mutate(row);const before=JSON.stringify(corrupt),view=publicPersistentYard(corrupt,{now:NOW+H,...options});assert.equal(view.visits[0].renderCompatible,false);assert.ok(view.visits[0].presentationIssues.includes('SAVED_SOURCE_CONDITION_MISMATCH'));assert.equal(JSON.stringify(corrupt),before);
 }
});
test('all runtime/player gates remain closed and default source registry remains the published Mika registry',()=>{
 assert.equal(FAMILY_RELEASE_GATE.accepted,false);assert.deepEqual(Object.keys(getYardServerOptions().actorProfiles),['mika']);assert.equal(getYardServerOptions().mediaRegistry.bindings.some(b=>Object.hasOwn(b,'conditionContract')),false);
});
