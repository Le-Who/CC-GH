import './yard-inventory-only-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultPlayer} from '../game-logic/player.js';
import {createMochiMedia} from '../game-logic/yard-v2/mochi-media.mjs';
import {createPebbleMedia} from '../game-logic/yard-v2/pebble-media.mjs';
import {createPipMedia} from '../game-logic/yard-v2/pip-media.mjs';
import {createYardMedia,getYardServerOptions} from '../game-logic/yard-v2/yard-media.mjs';
import {createAdmissionPolicy} from '../game-logic/yard-v2/orchestrator.mjs';
import {ensurePersistentPlayerYard,publicPersistentYard,executePersistentYardAction} from '../game-logic/yard-v2/service.mjs';
import {YARD_GOODIES,YARD_VISITORS} from '../game-logic/yard-v2/catalog.mjs';
import {validateLayout,overlaps} from '../game-logic/yard-v2/geometry.mjs';
import {visitReservations,timeOverlaps} from '../game-logic/yard-v2/visit-reservations.mjs';
import {validPresentationPlan} from '../game-logic/yard-v2/simulation.mjs';
import {getMikaServerOptions} from '../game-logic/yard-v2/mika-media.mjs';
import {MOCHI_RELEASE_GATE} from '../game-logic/yard-v2/mochi-actor-profile.mjs';
import {PEBBLE_RELEASE_GATE} from '../game-logic/yard-v2/pebble-actor-profile.mjs';
import {PIP_RELEASE_GATE} from '../game-logic/yard-v2/pip-actor-profile.mjs';
const copy=structuredClone,NOW=Date.UTC(2026,9,3,12),H=3600000;
// Trusted acceptance fixtures only. No production registry or gate is opened.
const accept=s=>({...s,preflight:s.preflightCandidate,actorProfiles:{[s.candidateProfile.id]:{...copy(s.candidateProfile),playbackReady:true}},mediaRegistry:{...copy(s.mediaRegistry),bindings:s.mediaRegistry.bindings.map(b=>({...copy(b),playbackReady:true}))}});
const options=createYardMedia({mochi:accept(createMochiMedia()),pebble:accept(createPebbleMedia()),pip:accept(createPipMedia())}),policy=createAdmissionPolicy(options);
const placed=(slotId,goodieId,x,y)=>({slotId,goodieId,x,y,rotationZ:0,condition:'new',uses:0,opaque:{keep:slotId}});
function layout(coords=[60,35,50,65]){return{remodel:'meadow',expansion:{level:1},placedGoodies:[placed('leaf','leaf_pot',coords[0],coords[1]),placed('snack','snack_table',coords[2],coords[3])]};}
function candidate(who,at,y=layout(),minutes=110){const p=y.placedGoodies[who==='pip'?1:0];return{at,leavesAt:at+minutes*60000,placement:p,yard:y,visitor:YARD_VISITORS[who==='pip'?'pip_hamster':'pebble_pup'],goodie:YARD_GOODIES[p.goodieId],activity:{id:who==='pip'?'nibble':'sniff'},bowl:{id:'bowl-1',foodId:'berry_plate'},active:[],reserved:[]};}
const record=(q,binding)=>({visitorId:q.visitor.id,slotId:q.placement.slotId,arrivedAt:q.at,leavesAt:q.leavesAt,mediaAdmission:binding});
function collisions(a,b){return visitReservations(a).flatMap(n=>visitReservations(b).filter(old=>timeOverlaps(n,old)&&overlaps(n.rect,old.rect)).map(old=>({n,old})));}
for(const first of['pip','pebble'])test(`${first} first: genuinely staggered mixed admission preserves 110min stay and rejects concurrent/legacy routes`,()=>{
 const a=candidate(first,NOW),r=policy(a);assert.equal(r.ok,true,r.code);const old=record(a,r.binding),second=first==='pip'?'pebble':'pip';
 const q=candidate(second,NOW+H);q.active=[old];q.reserved=[old];const before=JSON.stringify(q),out=policy(q);assert.equal(out.ok,true,out.code);assert.equal(JSON.stringify(q),before);
 assert.equal(old.leavesAt,NOW+110*60000);assert.equal(out.binding.plan.arrivalAt,NOW+H);assert.equal(validPresentationPlan(out.binding.plan,{at:q.at,leavesAt:q.leavesAt,slotId:q.placement.slotId}),true);
 const next=record(q,out.binding);assert.deepEqual(collisions(next,old),[]);assert.deepEqual(collisions(JSON.parse(JSON.stringify(next)),JSON.parse(JSON.stringify(old))),[]);
 assert.ok(out.binding.plan.reservationBoxes.some(n=>old.mediaAdmission.plan.reservationBoxes.some(o=>overlaps(n,o))),'spatially overlapping routes are genuinely shared at different times');
 const legacy=copy(old);delete legacy.mediaAdmission.plan.reservations;assert.equal(policy({...q,active:[legacy],reserved:[legacy]}).code,'PRESENTATION_REGION_RESERVED');
 const same=candidate(second,NOW);same.active=[old];same.reserved=[old];assert.equal(policy(same).code,'PRESENTATION_REGION_RESERVED','simultaneous portal/route occupancy stays blocked');
 const duplicate=candidate(first,NOW+H);duplicate.active=[old];assert.match(policy(duplicate).code,/ALREADY_VISITING/);
 const occupied={visitorId:'unrelated',slotId:q.placement.slotId,arrivedAt:NOW,leavesAt:NOW+2*H,reservationBoxes:[]};assert.equal(policy({...q,active:[occupied],reserved:[occupied]}).code,'COMPOSITE_PROP_ALREADY_OWNED');
});
for(const first of['pip','pebble'])test(`${first} first: colliding mixed layout still rejects real route/rest or departure overlap`,()=>{
 const y=layout([70,45,50,70]);assert.equal(validateLayout(y,options.scene).ok,true);
 const a=candidate(first,NOW,y),r=policy(a);assert.equal(r.ok,true);const old=record(a,r.binding),q=candidate(first==='pip'?'pebble':'pip',NOW+H,y),alone=policy(q);assert.equal(alone.ok,true);
 const conflicts=collisions(record(q,alone.binding),old);assert.ok(conflicts.length>0);assert.ok(conflicts.every(({n,old})=>Math.min(n.endMs,old.endMs)>Math.max(n.startMs,old.startMs)));
 q.active=[old];q.reserved=[old];const before=JSON.stringify(q);assert.equal(policy(q).code,'PRESENTATION_REGION_RESERVED');assert.equal(JSON.stringify(q),before);
});
for(const [first,id,secondMinutes]of[['pip','mixed-timed-pip-2316',56],['pebble','mixed-timed-pebble-737',104]])test(`${first} native probability witness: two simultaneous active visitors, reload, partitioned catch-up and exactly-once economy`,()=>{
 const p=createDefaultPlayer(id,'Fixture',NOW);Object.assign(p.yard,layout());p.yard.bowls[0]={id:'bowl-1',foodId:'berry_plate',servings:2,placedAt:NOW,expiresAt:NOW+5*H};
 const inventory=copy(p.yard.goodieInventory),otherGames=copy({resources:p.resources,garden:p.garden,merge:p.merge});
 assert.equal(ensurePersistentPlayerYard(p,{now:NOW,...options}).status,200);assert.equal(ensurePersistentPlayerYard(p,{now:NOW+H,simulate:true,...options}).status,200);
 let rows=Object.values(p._yardV2.runtime.visits);assert.equal(rows.length,1);assert.equal(rows[0].original.visitorId,first==='pip'?'pip_hamster':'pebble_pup');assert.equal(rows[0].leavesAt-rows[0].arrivedAt,110*60000);
 assert.equal(ensurePersistentPlayerYard(p,{now:NOW+2*H,simulate:true,...options}).status,200);rows=Object.values(p._yardV2.runtime.visits);assert.equal(rows.length,2);assert.ok(rows.every(r=>r.status==='active'));assert.equal(rows[1].leavesAt-rows[1].arrivedAt,secondMinutes*60000);assert.equal(rows[1].arrivedAt-rows[0].arrivedAt,H);
 assert.equal(p.yard.activeVisitors.length,2);assert.equal(p.yard.bowls[0].servings,0);assert.deepEqual(p.yard.placedGoodies.map(r=>r.uses),[1,1]);assert.deepEqual(Object.values(p.yard.petbook).map(r=>r.visits),[1,1]);assert.deepEqual(collisions(rows[0],rows[1]),[]);
 const restored=JSON.parse(JSON.stringify(p)),before=JSON.stringify(restored),view=publicPersistentYard(restored,{now:NOW+2*H+60000,...options});assert.equal(view.visits.length,2);assert.ok(view.visits.every(r=>r.renderCompatible));assert.equal(JSON.stringify(restored),before);ensurePersistentPlayerYard(restored,{now:NOW+2*H,simulate:true,...options});assert.equal(JSON.stringify(restored),before);
 const bulk=copy(p),parts=copy(restored),end=Math.max(...rows.map(r=>r.leavesAt))+1;ensurePersistentPlayerYard(bulk,{now:end,simulate:true,...options});for(let at=NOW+2*H+5*60000;at<end;at+=5*60000)ensurePersistentPlayerYard(parts,{now:at,simulate:true,...options});ensurePersistentPlayerYard(parts,{now:end,simulate:true,...options});assert.deepEqual(parts,bulk);
 assert.equal(bulk.yard.pendingGifts.length,2);assert.ok(Object.values(bulk._yardV2.runtime.visits).every(r=>r.status==='completed'));assert.equal(Object.keys(bulk._yardV2.runtime.propCommitReceipts||{}).length,0);assert.deepEqual(bulk.yard.goodieInventory,inventory);assert.deepEqual({resources:bulk.resources,garden:bulk.garden,merge:bulk.merge},otherGames);
 const once=copy(bulk);ensurePersistentPlayerYard(bulk,{now:end,simulate:true,...options});assert.deepEqual(bulk,once);
 const balance=copy(bulk.yard.currencies),gifts=copy(bulk.yard.pendingGifts);const result=executePersistentYardAction(bulk,'yard.collectGifts',{}, {...options,now:end,actionId:'yard-v2:mixed-timed-collect'});assert.equal(result.status,200);for(const k of['treats','shinyTreats'])assert.equal(bulk.yard.currencies[k],balance[k]+gifts.reduce((n,g)=>n+g[k],0));const claimed=copy(bulk);assert.equal(executePersistentYardAction(bulk,'yard.collectGifts',{}, {...options,now:end+H,actionId:'yard-v2:mixed-timed-collect'}).replayed,true);assert.deepEqual(bulk,claimed);
 console.log('MIXED_TIMED_NATIVE',JSON.stringify({first,id,firstMinutes:110,secondMinutes,arrivals:rows.map(r=>r.arrivedAt),leaves:rows.map(r=>r.leavesAt),gifts:gifts.length}));
});
test('Mika emits complete timed phase and leg envelopes without altering routes, targets or source registry',()=>{
 const source=getMikaServerOptions(),y={remodel:'meadow',expansion:{level:1},placedGoodies:[placed('cushion','sun_cushion',54,66)]},p=y.placedGoodies[0];
 const q={at:NOW,leavesAt:NOW+110*60000,placement:p,yard:y,bowl:{id:'bowl-1',foodId:'kibble'},visitor:YARD_VISITORS.mika_cat,activity:{id:'nap'},active:[],reserved:[]};
 const out=source.preflight(q,source.mediaRegistry.bindings.find(b=>b.goodieId==='sun_cushion'));assert.equal(out.ok,true,out.code);const r={arrivedAt:q.at,leavesAt:q.leavesAt,mediaAdmission:{plan:out.plan}};assert.deepEqual(visitReservations(r),out.plan.reservations);
 for(const seg of out.plan.segments.filter(s=>s.kind!=='hidden'&&s.endAt>s.startAt)){const ranges=out.plan.reservations.filter(v=>v.startMs<seg.endAt&&v.endMs>seg.startAt);assert.ok(ranges.length);assert.equal(Math.min(...ranges.map(r=>Math.max(r.startMs,seg.startAt))),seg.startAt);assert.equal(Math.max(...ranges.map(r=>Math.min(r.endMs,seg.endAt))),seg.endAt);}
 assert.ok(out.plan.reservations.every(r=>r.startMs>=NOW&&r.endMs<=q.leavesAt));assert.equal(out.plan.propCommits.length,1);
});
test('production gates, eight visitors and media/economic catalog remain unchanged',()=>{
 assert.equal(Object.keys(YARD_VISITORS).length,8);for(const gate of[MOCHI_RELEASE_GATE,PEBBLE_RELEASE_GATE,PIP_RELEASE_GATE])assert.equal(gate.accepted,false);
 assert.deepEqual(Object.keys(getYardServerOptions().actorProfiles),['mika']);assert.deepEqual(getYardServerOptions().mediaRegistry,getMikaServerOptions().mediaRegistry);
});
