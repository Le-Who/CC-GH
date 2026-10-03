import test from 'node:test';
import assert from 'node:assert/strict';
import { solePolygonOnGround,solePolygonOverlapsRect,paddedConvexPolygon } from '../game-logic/yard-v2/ground-coverage.mjs';
import { createMotionGroundGuard } from '../game-logic/yard-v2/motion-ground-guard.mjs';
import { getMikaServerOptions,MIKA_SCENE,MIKA_PLACEMENT_SUGGESTIONS } from '../game-logic/yard-v2/mika-media.mjs';
import { sampleRoute } from '../game-logic/yard-v2/media/stride-routes.mjs';
import { selectPetPose } from '../src/games/companion-yard-v2/pose-selection.mjs';
import media from '../public/assets/yard-mika/runtime-media.json' with {type:'json'};

const yard=()=>({remodel:'meadow',expansion:{level:1},placedGoodies:Object.entries(MIKA_PLACEMENT_SUGGESTIONS).map(([id,point])=>({slotId:id,goodieId:id,...point,condition:'new',uses:0}))});
const planned=(y,id,yaw=0)=>{
  const o=getMikaServerOptions(),p=y.placedGoodies.find(p=>p.goodieId===id);p.rotationZ=yaw;
  return o.preflight({at:100000,leavesAt:100000+45*60000,slotId:p.slotId,placement:p,yard:y,bowl:{id:'bowl-1',foodId:'kibble'},active:[],reserved:[]},o.mediaRegistry.bindings.find(b=>b.goodieId===id));
};
test('a sole crossing a stepped ground boundary is rejected even when every vertex lies on ground',()=>{
  // Meadow row25 narrows to89.7 between wider rows24 and26.
  const crossing=[[89.8,48.5],[90,48.5],[90,51.5],[89.8,51.5]];
  assert.equal(solePolygonOnGround(crossing,'meadow'),false);
  assert.equal(solePolygonOnGround([[80,48.5],[80.2,48.5],[80.2,51.5],[80,51.5]],'meadow'),true);
});
test('independent sole hulls preserve space between feet and detect actual prop intersections',()=>{
  const sole=[[0,0],[1,0],[1,1],[0,1]];
  assert.equal(solePolygonOverlapsRect(sole,{x:.5,y:.5,width:1,height:1}),true);
  assert.equal(solePolygonOverlapsRect(sole,{x:1,y:0,width:1,height:1}),false);
  const padded=paddedConvexPolygon(sole,.00001);assert.ok(Math.min(...padded.map(p=>p[0]))<0);assert.ok(Math.max(...padded.map(p=>p[1]))>1);
});
test('measured front soles reject the previously accepted late departure walk/turn',()=>{
  const g=createMotionGroundGuard(yard(),{scene:MIKA_SCENE});
  assert.equal(g.walkSegment({x:80.12,y:47.12},{x:85.24,y:47.12},0),false);
  assert.equal(g.canTurn({x:85.24,y:47.12},0,1,2),false);
  assert.equal(g.canTurn({x:80.12,y:47.12},0,1,2),true);
});
test('nonfinite route endpoints or world scales cannot bypass the coverage loop',()=>{
  const g=createMotionGroundGuard(yard(),{scene:MIKA_SCENE});
  for(const value of [NaN,Infinity,-Infinity])assert.equal(g.walkSegment({x:value,y:50},{x:value,y:50},0),false);
  for(const unitsPerWorld of [NaN,Infinity,0,-8])assert.equal(createMotionGroundGuard(yard(),{scene:MIKA_SCENE,unitsPerWorld}).walkSegment({x:45,y:45},{x:50.12,y:45},0),false);
});
test('solver selects the earlier safe turn without extra stride, pose reset, speed change or rerender',()=>{
  const result=planned(yard(),'yarn_mouse');assert.equal(result.ok,true,result.code);
  const route=result.plan.outgoing;assert.equal(route.durationMs,16800);assert.equal(route.turnCount,2);
  assert.deepEqual(route.points.map(p=>[Math.round(p.x*100)/100,Math.round(p.y*100)/100]),[[64.76,47.12],[80.12,47.12],[80.12,67.6],[90.36,67.6]]);
  for(let t=0;t<=route.durationMs;t+=50){const pose=sampleRoute(route,t);assert.doesNotThrow(()=>selectPetPose(media,pose));}
});
test('both fresh prop suggestions have routes with measured support coverage, including cushion half stride',()=>{
  for(const id of ['yarn_mouse','sun_cushion']){
    const y=yard(),result=planned(y,id);assert.equal(result.ok,true,`${id}:${result.code}`);
    const plans=[result.plan.incoming,result.plan.outgoing,...(result.plan.restApproach?[result.plan.restApproach]:[])];
    for(const path of plans){
      const final=path===result.plan.incoming?y:{...y,placedGoodies:y.placedGoodies.map(p=>p.goodieId===id?{...p,...result.plan.finalTransform}:p)};
      const g=createMotionGroundGuard(final,{scene:MIKA_SCENE});
      for(const leg of path.legs)assert.equal(leg.kind==='turn'?g.canTurn(leg.position,leg.fromFacing,leg.direction,leg.angleSteps):g.walkSegment(leg.from,leg.to,leg.facing,leg.phaseStart),true,`${id}:${leg.kind}`);
    }
  }
});
test('old coordinates remain untouched with an explicit recoverable readiness result',()=>{
  const y=yard();y.placedGoodies[0].x=35;y.placedGoodies[1].x=56;
  const before=JSON.stringify(y),o=getMikaServerOptions(),readiness=o.placementReadiness(y);
  assert.equal(readiness.find(p=>p.goodieId==='yarn_mouse').status,'reposition-needed');
  assert.equal(JSON.stringify(y),before);
  readiness[0].status='tampered';assert.notEqual(o.placementReadiness(y)[0].status,'tampered');
});
test('equivalent-layout readiness cannot leak another account’s slot IDs or opaque metadata',()=>{
  const o=getMikaServerOptions(),a=yard(),b=yard();
  a.placedGoodies.forEach((p,i)=>Object.assign(p,{slotId:`first-account-${i}`,placedAt:1,opaque:'first'}));
  b.placedGoodies.forEach((p,i)=>Object.assign(p,{slotId:`second-account-${i}`,placedAt:900,opaque:'second'}));
  const first=o.placementReadiness(a),second=o.placementReadiness(b);
  assert.deepEqual(second.map(p=>p.slotId),['second-account-0','second-account-1']);
  assert.deepEqual(first.map(p=>p.status),second.map(p=>p.status));assert.equal(JSON.stringify(second).includes('first-account'),false);
});
test('settled yaw uses its matching clip while keeping exactly the saved toy transform',()=>{
  const y=yard(),result=planned(y,'yarn_mouse',.1);assert.equal(result.ok,true,result.code);
  assert.equal(result.plan.clipId,'mika-mouse-settled-r1');assert.equal(result.plan.initialPlacement.rotationZ,.1);assert.equal(result.plan.finalTransform.rotationZ,.1);
});
