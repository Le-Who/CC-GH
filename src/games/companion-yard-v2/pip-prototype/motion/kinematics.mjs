/** Measured A2 sole-goal request generator. Native evaluated vertices are checked separately by the bridge. */
import {add,mul,direction,distance,bounds,corners,transform} from './math.mjs';
import {sampleTrajectory,smooth,angleDelta} from './trajectory.mjs';
export function buildGaitRequest(route,actor){
 const footAt=(side,at)=>{const p=sampleTrajectory(route,at),offset=actor.soleCenterOffsetsForwardLateralSource[side];
  return {position:{...add(add(p.root,mul(direction(p.heading),offset.x*actor.unitsPerSource)),mul(direction(p.heading+Math.PI/2),offset.y*actor.unitsPerSource)),z:0},heading:p.heading};};
 const initial={L:footAt('L',0),R:footAt('R',0)},events=[],last=structuredClone(initial),count=route.moveMs/actor.halfStepMs+2;
 for(let i=0;i<count;i++){
  const side=i%2===0?'L':'R',start=route.anticipationMs+i*actor.halfStepMs,
   target=footAt(side,start+actor.halfStepMs*1.35),event={index:i,side,startMs:start+actor.halfStepMs*.12,endMs:start+actor.halfStepMs*.88,
   from:structuredClone(last[side]),to:target};
  events.push(event);last[side]=target;
 }
 return {format:'A2-measured-alternating-sole-goals/v1',initial,events,
  notice:'Foot plants are exact mathematical goals only. An evaluated rig, mesh sole witnesses, balance and visual review are still required.',
  minimumDoubleSupportMs:actor.halfStepMs*.24};
}
export function sampleMotion(route,gait,actor,timeMs){
 const p=sampleTrajectory(route,timeMs),feet={};
 for(const side of ['L','R']){
  let f=structuredClone(gait.initial[side]),plantId=`${side}:initial`,planted=true;
  for(const e of gait.events.filter(e=>e.side===side)){
   if(timeMs<e.startMs)break;
   if(timeMs>=e.endMs){f=structuredClone(e.to);plantId=`${side}:${e.index}`;continue;}
   const u=(timeMs-e.startMs)/(e.endMs-e.startMs),w=smooth(u);
   f={position:{x:e.from.position.x+(e.to.position.x-e.from.position.x)*w,y:e.from.position.y+(e.to.position.y-e.from.position.y)*w,
    z:actor.footLiftSource*actor.unitsPerSource*64*u**3*(1-u)**3},heading:e.from.heading+angleDelta(e.to.heading,e.from.heading)*w};planted=false;plantId=null;break;
  }
  const soleRect={x:-actor.soleHalfExtentsSource.x*actor.unitsPerSource,y:-actor.soleHalfExtentsSource.y*actor.unitsPerSource,
   width:2*actor.soleHalfExtentsSource.x*actor.unitsPerSource,height:2*actor.soleHalfExtentsSource.y*actor.unitsPerSource};
  feet[side]={...f,planted,plantId,solePolygon:corners(soleRect).map(q=>transform(q,{...f.position,yaw:f.heading,groundZ:f.position.z}))};
 }
 const support=Object.entries(feet).filter(([,f])=>f.planted).map(([s])=>s);
 const rect={x:-actor.bodyHalfExtentsSource.x*actor.unitsPerSource,y:-actor.bodyHalfExtentsSource.y*actor.unitsPerSource,
  width:2*actor.bodyHalfExtentsSource.x*actor.unitsPerSource,height:2*actor.bodyHalfExtentsSource.y*actor.unitsPerSource};
 return {...p,feet,support,phase:timeMs<route.anticipationMs?'anticipation':p.moving?'locomotion':'supported-settle',
  gaitPhase:((Math.max(0,timeMs-route.anticipationMs)/actor.halfStepMs)%2)/2,
  bodyPolygon:corners(rect).map(q=>transform(q,{...p.root,yaw:p.heading})),
  bodyEnvelopeBasis:'declared synthetic source envelope; not a native mesh bound',
  supportConstraint:{kind:support.length===1?'single-support':'double-support',requiresRigWeightTransfer:true,balanceProved:false}};
}
export function inspectKinematics(route,gait,actor,nav){
 const times=[...new Set([0,route.totalMs,...Array.from({length:Math.ceil(route.totalMs/10)},(_,i)=>i*10),...gait.events.flatMap(e=>[e.startMs,e.endMs,(e.startMs+e.endMs)/2])])].sort((a,b)=>a-b);
 const failures=[],plants=new Map();let maxPlantDrift=0,maxFootReachSource=0,maxHeadingJumpRadians=0,maxRootStep=0,last=null;
 for(const atMs of times){const p=sampleMotion(route,gait,actor,atMs);
  if(!p.support.length)failures.push({code:'NO_SUPPORT_FOOT',atMs});
  if(!nav.clearBox(bounds(p.bodyPolygon)))failures.push({code:'BODY_ENVELOPE_BLOCKED',atMs});
  for(const [side,f] of Object.entries(p.feet)){
   if(!nav.clearBox(bounds(f.solePolygon)))failures.push({code:'SOLE_SWEEP_BLOCKED',side,atMs});
   const reach=distance(p.root,f.position)/actor.unitsPerSource;maxFootReachSource=Math.max(maxFootReachSource,reach);
   if(reach>actor.maxFootReachSource+1e-8)failures.push({code:'FOOT_REACH_EXCEEDED',side,atMs,reach});
   if(f.planted){const prior=plants.get(f.plantId);if(prior)maxPlantDrift=Math.max(maxPlantDrift,distance(prior,f.position));else plants.set(f.plantId,f.position);}
  }
  if(last){maxHeadingJumpRadians=Math.max(maxHeadingJumpRadians,Math.abs(angleDelta(p.heading,last.heading)));maxRootStep=Math.max(maxRootStep,distance(p.root,last.root));}last=p;
 }
 return {ok:!failures.length,samples:times.length,maxPlantDriftWorld:maxPlantDrift,maxFootReachSource,maxHeadingJumpRadians,maxRootStepWorld:maxRootStep,
  failures:failures.slice(0,8),proof:'Synthetic flat-ground kinematic request sampled at 10ms plus every lift/plant boundary and midpoint; not evaluated native animation, balance or visual acceptance.'};
}
