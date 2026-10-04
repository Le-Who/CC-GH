import test from 'node:test';import assert from 'node:assert/strict';
import {createEightAcceptanceOptions} from './fixtures/yard-eight-canonical/acceptance.mjs';
import {candidate,nativePlayer,NOW,H,findSeed} from './helpers/yard-eight-fixtures.mjs';
import {createAdmissionPolicy} from '../game-logic/yard-v2/orchestrator.mjs';
import {ensurePersistentPlayerYard,publicPersistentYard} from '../game-logic/yard-v2/service.mjs';
import {visitReservations,presentationReservationsConflict} from '../game-logic/yard-v2/visit-reservations.mjs';
import {getYardGoodieCapacity,YARD_GOODIES} from '../game-logic/yard-v2/catalog.mjs';
import {validateLayout,overlaps} from '../game-logic/yard-v2/geometry.mjs';
const options=createEightAcceptanceOptions(),policy=createAdmissionPolicy(options),copy=structuredClone;
const record=(q,r)=>({visitorId:q.visitor.id,slotId:q.placement.slotId,arrivedAt:q.at,leavesAt:q.leavesAt,mediaAdmission:r.binding});
for(const first of ['basil','sage'])test(`${first} first: capacity-two Fountain preserves one composite owner through reload and every release boundary`,()=>{
 const a=candidate(first),r=policy(a);assert.equal(r.ok,true,r.code);assert.equal(getYardGoodieCapacity(YARD_GOODIES.fountain_bowl),2);
 const old=record(a,r),second=first==='basil'?'sage':'basil',saved=JSON.parse(JSON.stringify(old)),end=r.binding.plan.schedule.combinedEnd;
 assert.equal(end,r.binding.plan.propReleaseAt);assert.ok(end<old.leavesAt);assert.deepEqual(visitReservations(saved),saved.mediaAdmission.plan.reservations);
 for(const at of [end-1,end,end+1,old.leavesAt-1])for(const variant of ['complete','legacy','partial']){
  const previous=copy(saved);if(variant==='legacy')delete previous.mediaAdmission.plan.reservations;if(variant==='partial')previous.mediaAdmission.plan.reservations.pop();
  const q=candidate(second,{at});q.active=[previous];q.reserved=[previous];const before=JSON.stringify(q),out=policy(q);
  assert.equal(out.ok,false);assert.equal(out.code,'COMPOSITE_PROP_ALREADY_OWNED');assert.equal(JSON.stringify(q),before);
 }
 for(const at of [old.leavesAt,old.leavesAt+1]){
  const q=candidate(second,{at});q.active=[];q.reserved=[];const before=JSON.stringify(q),out=policy(q);assert.equal(out.ok,true,out.code);assert.equal(JSON.stringify(q),before);
  assert.equal(presentationReservationsConflict(out.binding.plan.reservations,saved),false);
 }
 const p=nativePlayer(first);ensurePersistentPlayerYard(p,{now:NOW,...options});ensurePersistentPlayerYard(p,{now:NOW+H,simulate:true,...options});
 const reloaded=JSON.parse(JSON.stringify(p)),before=JSON.stringify(reloaded),view=publicPersistentYard(reloaded,{now:NOW+H,...options});
 assert.equal(view.visits.length,1);assert.equal(view.visits[0].renderCompatible,true);assert.equal(JSON.stringify(reloaded),before);
});
for(const id of ['basil','sage'])test(`${id}: unsupported soak-left rejects before food, wear, petbook and visit effects`,()=>{
 const q=candidate(id,{activityId:'soak-left'}),before=JSON.stringify(q);assert.equal(policy(q).code,'UNSUPPORTED_VISIT_MEDIA');assert.equal(JSON.stringify(q),before);
 const p=nativePlayer(id,{id:findSeed(id,{activityId:'soak-left',rejectSecond:true})}),economy=copy(p.yard);
 ensurePersistentPlayerYard(p,{now:NOW,...options});ensurePersistentPlayerYard(p,{now:NOW+H,simulate:true,...options});
 assert.deepEqual(p.yard.placedGoodies,economy.placedGoodies);assert.deepEqual(p.yard.bowls,economy.bowls);assert.deepEqual(p.yard.petbook,economy.petbook);
 assert.equal(Object.values(p._yardV2.runtime.visits).length,0);assert.ok(p._yardV2.runtime.events.some(e=>e.reason==='UNSUPPORTED_VISIT_MEDIA'));
});
test('route cache rebases only new candidate reservations; persisted envelopes and conflicts stay exact',()=>{
 const a=candidate('sage'),first=policy(a);assert.equal(first.ok,true,first.code);const saved=record(a,first),before=JSON.stringify(saved);
 const later=policy(candidate('sage',{at:a.at+H}));assert.equal(later.ok,true,later.code);const old=first.binding.plan.reservations,rebased=later.binding.plan.reservations;
 assert.equal(old.length,rebased.length);for(let i=0;i<old.length;i++){assert.deepEqual(rebased[i].rect,old[i].rect);assert.equal(rebased[i].startMs-old[i].startMs,H);assert.equal(rebased[i].endMs-old[i].endMs,H);}
 const duplicate=candidate('sage',{at:a.at+H});duplicate.active=[saved];duplicate.reserved=[saved];assert.match(policy(duplicate).code,/ALREADY_VISITING|COMPOSITE_PROP_ALREADY_OWNED/);assert.equal(JSON.stringify(saved),before);
});
for(const first of ['basil','sage'])test(`${first} first: two independent legal Fountains retain real routes and reject the actual overlapping second route`,()=>{
 const yard=candidate('basil').yard;yard.placedGoodies=[{...yard.placedGoodies[0],slotId:'left',x:35,y:42},{...yard.placedGoodies[0],slotId:'right',x:55,y:48}];
 const layout=validateLayout(yard,options.scene);assert.equal(layout.ok,true);for(const slot of ['left','right'])assert.ok(layout.routes[slot]['watch-right']);
 const placed=id=>yard.placedGoodies[id==='sage'?0:1],second=first==='basil'?'sage':'basil',a=candidate(first,{yard,placement:placed(first)}),one=policy(a);assert.equal(one.ok,true,one.code);
 const q=candidate(second,{at:NOW+2*H,yard,placement:placed(second)}),alone=policy(q);assert.equal(alone.ok,true,alone.code);assert.notDeepEqual(alone.binding.plan.incoming,one.binding.plan.incoming);assert.notDeepEqual(alone.binding.plan.outgoing,one.binding.plan.outgoing);
 const old=JSON.parse(JSON.stringify(record(a,one))),next=record(q,alone),conflicts=visitReservations(old).flatMap(o=>visitReservations(next).filter(n=>n.startMs<o.endMs&&n.endMs>o.startMs&&overlaps(n.rect,o.rect)).map(n=>({old:o,next:n})));
 assert.ok(conflicts.length>0,'This actual source route crosses a still occupied body envelope');q.active=[old];q.reserved=[old];const before=JSON.stringify(q);assert.equal(policy(q).code,'PRESENTATION_REGION_RESERVED');assert.equal(JSON.stringify(q),before);
 const legacy=copy(old);delete legacy.mediaAdmission.plan.reservations;assert.equal(policy({...q,active:[legacy],reserved:[legacy]}).code,'PRESENTATION_REGION_RESERVED');
 const released=candidate(second,{at:old.leavesAt,yard,placement:placed(second)});assert.equal(policy(released).ok,true);
 console.log('TURTLE_DISTINCT_PROP_ROUTE_CONFLICT',JSON.stringify({first,placements:yard.placedGoodies,firstIncomingMs:one.binding.plan.incoming.durationMs,secondIncomingMs:alone.binding.plan.incoming.durationMs,conflicts}));
});
test('every exact actor identity is blocked from a second active visit before planning or save effects',()=>{
 for(const id of ['mika','mochi','pebble','pip','willow','starlit','basil','sage']){const q=candidate(id),old={visitorId:q.visitor.id,original:{visitorId:q.visitor.id},slotId:'another-slot',arrivedAt:NOW,leavesAt:NOW+3*H};q.active=[old];const before=JSON.stringify(q),out=policy(q);assert.equal(out.ok,false);assert.match(out.code,/ALREADY_VISITING/);assert.equal(JSON.stringify(q),before);}
});
