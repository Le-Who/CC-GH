import test from 'node:test';import assert from 'node:assert/strict';
import clip from './fixtures/yard-mochi-r3/combined-binding.json' with {type:'json'};
import stride from './fixtures/yard-mochi-r1/authored-stride.json' with {type:'json'};
import ground from './fixtures/yard-mochi-r2/ground-motion.json' with {type:'json'};
import {createMochiCombinedCandidate,MOCHI_COMBINED_SCHEDULE} from '../game-logic/yard-v2/media/mochi-combined-binding.mjs';
import {ACTOR_PROFILES} from '../game-logic/yard-v2/actor-profiles.mjs';
const copy=structuredClone,close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const scene={entry:{x:90,y:68},entryClearance:4,footprints:{yarn_mouse:{width:8.8,height:3.2},sun_cushion:{width:22.4,height:19.2}},exclusions:[]};
const make=()=>createMochiCombinedCandidate({clip,strideContract:stride,motionContract:ground,scene});
const candidate=()=>{const p={slotId:'target-toy',goodieId:'yarn_mouse',x:50,y:45,condition:'new',rotationZ:0,opaque:'keep'};return{at:100000,leavesAt:2800000,placement:p,yard:{remodel:'meadow',expansion:{level:1},placedGoodies:[p]},active:[],reserved:[],visitor:{id:'mochi_bunny'}};};

test('the actual combined source binding plans geometry but cannot admit an unregistered actor',()=>{
 const m=make(),c=candidate(),before=JSON.stringify(c),r=m.preflightCandidate(c);assert.equal(r.ok,true,r.code);assert.equal(r.plan.schedule.version,MOCHI_COMBINED_SCHEDULE);
 assert.equal(m.binding.propMode,'composited');assert.equal(m.binding.playbackReady,false);assert.equal(m.preflight(c).code,'BROWSER_VISUAL_QA_AND_ACTOR_REGISTRATION_REQUIRED');
 assert.deepEqual(Object.keys(ACTOR_PROFILES),['mika']);assert.equal(r.plan.runtimeActivated,false);assert.equal(JSON.stringify(c),before);
 assert.deepEqual(r.plan.finalTransform,c.placement);assert.deepEqual(r.plan.schedule.propCommits,[]);assert.equal(r.plan.requiresEndpointCommit,false);
});
test('45-minute schedule covers every visible moment with complete native-rate breathing cycles',()=>{
 const m=make(),c=candidate(),p=m.preflightCandidate(c).plan,s=p.schedule;assert.equal(s.leavesAt,c.leavesAt);assert.equal(s.arrivalAt,c.at);assert.ok(s.loop.cycles>1000);
 for(let i=1;i<s.segments.length;i++)assert.equal(s.segments[i-1].endAt,s.segments[i].startAt);
 assert.equal(s.segments.at(-1).endAt,c.leavesAt);assert.equal(m.sample(p,s.enterAt-1),null);assert.equal(m.sample(p,c.leavesAt),null);
 const rest=s.segments.find(x=>x.kind==='loop');for(let cycle of [0,1,100,s.loop.cycles-1]){
  const a=m.sample(p,rest.startAt+cycle*1200);assert.equal(a.frameIndex,200);assert.equal(a.clipAtMs,10000);
  assert.equal(m.sample(p,rest.startAt+cycle*1200+1199).frameIndex,223);
 }
 const restored=JSON.parse(JSON.stringify(p));for(const t of [s.enterAt,s.combinedStart,s.combinedStart+1500,rest.startAt+873,rest.endAt,s.combinedEnd,c.leavesAt-1])assert.deepEqual(m.sample(restored,t),m.sample(p,t));
});
test('entry and exit samples use the same world roots as their separate authored routes',()=>{
 const m=make(),p=m.preflightCandidate(candidate()).plan,s=p.schedule;
 const enter=m.sample(p,s.combinedStart);close(enter.position.x,p.startRoot.x);close(enter.position.y,p.startRoot.y);assert.equal(enter.frameIndex,0);
 const exit=m.sample(p,s.combinedEnd);close(exit.position.x,p.endRoot.x);close(exit.position.y,p.endRoot.y);assert.equal(exit.frameIndex,0);assert.equal(exit.headingRadians,0);
 close(p.clipOrigin.x,50-1.1*8);close(p.clipOrigin.y,45+.2*8);
});
test('only the exact target slot is hidden, and only with the matching decoded combined frame',()=>{
 const m=make(),c=candidate(),p=m.preflightCandidate(c).plan,at=p.schedule.combinedStart+2500,pose=m.sample(p,at);
 const other={slotId:'other-toy',goodieId:'yarn_mouse',x:76,y:42,rotationZ:.1,condition:'worn',drawStandalone:true,opaque:{keep:1}};
 const props=[{...c.placement,drawStandalone:true},other],before=JSON.stringify(props);
 const pending=m.compose(props,p,at);assert.equal(pending.targetSlotHidden,null);assert.equal(pending.requiresCoherentFrameHold,true);assert.deepEqual(pending.props,props);
 const stale=m.compose(props,p,at,{readyFrame:{clipId:pose.clipId,frameIndex:pose.frameIndex-1}});assert.equal(stale.targetSlotHidden,null);
 const ready=m.compose(props,p,at,{readyFrame:{clipId:pose.clipId,frameIndex:pose.frameIndex}});assert.equal(ready.targetSlotHidden,'target-toy');assert.equal(ready.props[0].drawStandalone,false);assert.deepEqual(ready.props[1],other);
 for(const t of [p.schedule.combinedStart-1,p.schedule.combinedEnd])assert.deepEqual(m.compose(props,p,t).props,props);
 const changed=copy(props);changed[0].x++;const blocked=m.compose(changed,p,at,{readyFrame:{clipId:pose.clipId,frameIndex:pose.frameIndex}});assert.equal(blocked.targetSlotHidden,null);assert.equal(blocked.issue,'TARGET_PROP_CHANGED');assert.equal(blocked.pose,null);
 assert.equal(JSON.stringify(props),before);
});
test('target source state, other props, exclusions and occupied regions fail closed without moving saves',()=>{
 const m=make();
 const edits=[
  [c=>c.placement.rotationZ=.1,'TARGET_PROP_STATE_UNSUPPORTED'],
  [c=>c.placement.condition='worn','TARGET_PROP_STATE_UNSUPPORTED'],
  [c=>c.leavesAt=c.at+1000,'STAY_TOO_SHORT_FOR_AUTHORED_MOTION'],
  [c=>c.yard.placedGoodies.push({slotId:'blocker',goodieId:'sun_cushion',x:40,y:48,condition:'new'}),'COMPOSITE_REGION_BLOCKED'],
  [c=>c.reserved.push({slotId:'other',arrivedAt:0,leavesAt:9999999,reservationBoxes:[{x:25,y:40,width:30,height:25}]}),'PRESENTATION_REGION_RESERVED'],
  [c=>c.active.push({slotId:'target-toy',arrivedAt:0,leavesAt:9999999}),'TARGET_PROP_RESERVED']];
 for(const [edit,reason]of edits){const c=candidate();edit(c);const before=JSON.stringify(c);assert.equal(m.preflightCandidate(c).code,reason);assert.equal(JSON.stringify(c),before);}
 const c=candidate();c.yard.placedGoodies.push({slotId:'other',goodieId:'yarn_mouse',x:76,y:42,condition:'new',rotationZ:0});const r=m.preflightCandidate(c);assert.equal(r.ok,true,r.code);
});
