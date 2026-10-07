/** Finite, visual-only inspection admission from actual pose and committed canonical rows. */
import leaves from './data/interaction-leaf-anchors.json' with {type:'json'};
import {angleDelta} from './motion/trajectory.mjs';
import {buildGaitRequest,sampleMotion} from './motion/kinematics.mjs';
import {corners,transform} from './motion/math.mjs';
import {createCanonicalNavigation,convexHull} from './dynamic-navigation.mjs';
import {directContinuousTrajectory,continuousDetourTrajectory,reachablePolyline} from './dynamic-trajectory.mjs';
export const DYNAMIC_INSPECTION_VERSION='pip-canonical-inspection/v1';
// An entry registration, used only for the first appearance in an unoccupied location.
// It is checked against all current geometry before the actor becomes visible.
export const PIP_GARDEN_ENTRY=Object.freeze({id:'pip-garden-entry-r1',locationId:'pip-garden',locationVersion:1,geometryRevision:'pip-garden-t2-r1',position:Object.freeze({x:79,y:129.5}),heading:-1.45});
const EPS=1e-6;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const direction=h=>({x:Math.cos(h),y:Math.sin(h)});
const plus=(p,v,d)=>({x:p.x+v.x*d,y:p.y+v.y*d});
const pose=world=>({position:{x:world.root.x,y:world.root.y},heading:world.heading});
export function bodyPolygon(actor,root,heading,reserve=0){return corners({x:-(actor.bodyHalfExtentsSource.x+reserve)*actor.unitsPerSource,y:-actor.bodyHalfExtentsSource.y*actor.unitsPerSource,width:2*(actor.bodyHalfExtentsSource.x+reserve)*actor.unitsPerSource,height:2*actor.bodyHalfExtentsSource.y*actor.unitsPerSource}).map(p=>transform(p,{...root,yaw:heading}));}
export function supportedPose(actor,at=PIP_GARDEN_ENTRY){
 const route=turnRoute(actor,at,at.heading),gait=buildGaitRequest(route,actor);return sampleMotion(route,gait,actor,0);
}
export function supportedWorldValid(world,actor,nav,{reserve=0}={}){
 return !!world?.root&&Number.isFinite(world.heading)&&nav.visualPoint(world.root)&&nav.clearPolygon(bodyPolygon(actor,world.root,world.heading,reserve))&&['L','R'].every(side=>{const f=world.feet?.[side];return f&&Number.isFinite(f.heading)&&[f.position.x,f.position.y,f.position.z].every(Number.isFinite)&&distance(world.root,f.position)<=actor.maxFootReachSource*actor.unitsPerSource+EPS&&nav.clearPolygon(f.solePolygon);});
}
function turnRoute(actor,start,heading){
 const steps=Math.max(2,Math.ceil(Math.abs(angleDelta(heading,start.heading))/(Math.PI/6))*2),moveMs=steps*actor.halfStepMs;
 return {ok:true,motionKind:'supported-turn',format:'yard-continuous-trajectory-request/v1',start,goal:{position:{...start.position},heading},length:0,moveMs,anticipationMs:actor.anticipationMs,settleMs:actor.halfStepMs*2,totalMs:actor.anticipationMs+moveMs+actor.halfStepMs*2,maxCurvature:0};
}
function lineRoute(actor,start,end,heading=start.heading,speedScale=1){
 const length=distance(start.position,end),moveMs=Math.max(2,Math.ceil(1.875*length/(actor.maxSpeedSourcePerSecond*actor.unitsPerSource*speedScale)*1000/actor.halfStepMs))*actor.halfStepMs;
 return {ok:true,format:'yard-continuous-trajectory-request/v1',start,goal:{position:end,heading},fixedHeading:heading,length,moveMs,anticipationMs:actor.anticipationMs,settleMs:actor.halfStepMs*2,totalMs:actor.anticipationMs+moveMs+actor.halfStepMs*2,maxCurvature:0,segments:[{kind:'line',control:[start.position,end],offset:0,length,arc:[{t:0,length:0},{t:1,length}]}]};
}
function extendFinalApproach(actor,route,end){
 const tail=lineRoute(actor,route.goal,end,route.goal.heading),length=route.length+tail.length,moveMs=Math.max(2,Math.ceil(1.875*length/(actor.maxSpeedSourcePerSecond*actor.unitsPerSource)*1000/actor.halfStepMs))*actor.halfStepMs;
 return {...route,goal:tail.goal,length,moveMs,totalMs:route.anticipationMs+moveMs+route.settleMs,segments:[...route.segments,{...tail.segments[0],offset:route.length}]};
}
export function gaitFromSupported(route,actor,previous){
 if(previous?.support?.length!==2||!['L','R'].every(s=>previous.feet[s].planted))throw Error('SUPPORTED_START_REQUIRED');
 if(distance(route.start.position,previous.root)>EPS||Math.abs(angleDelta(route.start.heading,previous.heading))>EPS)throw Error('POSE_RESET_REFUSED');
 const gait=buildGaitRequest(route,actor),last={};
 for(const side of ['L','R'])last[side]=gait.initial[side]={position:{...previous.feet[side].position},heading:previous.feet[side].heading};
 for(const event of gait.events){event.from=structuredClone(last[event.side]);last[event.side]=event.to;}
 return gait;
}
function qualifyStage(route,actor,previous,nav,kind){
 const gait=gaitFromSupported(route,actor,previous),times=[0,route.totalMs,...gait.events.flatMap(e=>[e.startMs,e.endMs,(e.startMs+e.endMs)/2]),...Array.from({length:Math.ceil(route.totalMs/25)},(_,i)=>i*25)];
 const plants=new Map();let reach=0;
 for(const t of times){const world=sampleMotion(route,gait,actor,t);if(!world.support.length||!supportedWorldValid(world,actor,nav))return {ok:false,code:'KINEMATIC_ENVELOPE_BLOCKED',atMs:t,kind};for(const [side,f] of Object.entries(world.feet)){reach=Math.max(reach,distance(world.root,f.position)/actor.unitsPerSource);if(f.planted){const old=plants.get(f.plantId);if(old&&(distance(old.position,f.position)>EPS||Math.abs(angleDelta(old.heading,f.heading))>EPS))return {ok:false,code:'PLANTED_FOOT_DRIFT'};plants.set(f.plantId,f);}}}
 return {ok:true,kind,route,gait,end:sampleMotion(route,gait,actor,route.totalMs),check:{samples:times.length,maxFootReachSource:reach,maxPlantDrift:0}};
}
function finalSweepClear(actor,start,end,heading,nav){return nav.clearPolygon(convexHull([...bodyPolygon(actor,start,heading,.075),...bodyPolygon(actor,end,heading,.075)]))&&nav.visualHull([start,end]);}
export function interactionAnchors(actor,target){
 const standOff=4.65+(actor.bodyHalfExtentsSource.x+.075+.04)*actor.unitsPerSource;
 return leaves.map(leaf=>{const [x,y,z]=leaf.focusLocalCanonical,len=Math.hypot(x,y),outward={x:x/len,y:y/len},heading=Math.atan2(-y,-x);return {id:leaf.id,outward,heading,position:plus(target,outward,standOff),focus:{x:target.x+x,y:target.y+y,z},standOff};});
}
function departure(actor,previous,nav){
 if(nav.passable(previous.root))return {ok:true,world:previous,stages:[]};
 // Leave a close interaction by stepping backward without changing body/foot headings.
 const reverse=direction(previous.heading+Math.PI);
 for(let amount=2;amount<=20;amount+=2){const end=plus(previous.root,reverse,amount);if(!nav.passable(end)||!finalSweepClear(actor,previous.root,end,previous.heading,nav))continue;const stage=qualifyStage(lineRoute(actor,pose(previous),end,previous.heading,.5),actor,previous,nav,'back-away');if(stage.ok)return {ok:true,world:stage.end,stages:[stage]};}
 return {ok:false,code:'NO_SUPPORTED_DEPARTURE'};
}
export function planCanonicalInspection({geometry,rows,actor,targetSlotId,previous,attentionVariant=0,composition=true}){
 let nav;try{nav=createCanonicalNavigation({geometry,rows,actor,composition});}catch(error){return {ok:false,code:error.message};}
 const target=rows.find(r=>r.slotId===targetSlotId);if(!target)return {ok:false,code:'TARGET_REMOVED',layoutKey:nav.layoutKey};
 if(!supportedWorldValid(previous,actor,nav)||previous.support?.length!==2)return {ok:false,code:'CURRENT_POSE_BLOCKED',layoutKey:nav.layoutKey};
 const anchors=interactionAnchors(actor,target).sort((a,b)=>distance(previous.root,a.position)-distance(previous.root,b.position)||a.id.localeCompare(b.id));
 const failures=[];
 for(const anchor of anchors){
  if(distance(previous.root,anchor.position)<EPS&&Math.abs(angleDelta(previous.heading,anchor.heading))<EPS&&finalSweepClear(actor,previous.root,previous.root,previous.heading,nav))return {ok:true,kind:DYNAMIC_INSPECTION_VERSION,layoutKey:nav.layoutKey,target:structuredClone(target),anchor,stages:[],settled:structuredClone(previous),attentionVariant,holdOnly:true,attempts:failures};
 }
 const away=departure(actor,previous,nav);if(!away.ok)return {...away,layoutKey:nav.layoutKey};
 const start=pose(away.world),lead=actor.headingLeadSource*actor.unitsPerSource;
 const modes=['continuous','continuous-detour','supported-waypoints'];
 for(const mode of modes)for(const anchor of anchors){
  const staging=plus(target,anchor.outward,Math.max(anchor.standOff+lead,4.65+nav.clearance+.5));
  if(!nav.passable(staging)||!finalSweepClear(actor,staging,anchor.position,anchor.heading,nav)){failures.push({anchor:anchor.id,mode,code:'ANCHOR_BLOCKED'});continue;}
  let world=away.world,stages=[...away.stages],current=start;
  if(mode!=='supported-waypoints'){
   const trajectory=mode==='continuous'?directContinuousTrajectory:continuousDetourTrajectory;
   const approach=trajectory(actor,current,{position:staging,heading:anchor.heading},nav);
   if(!approach){failures.push({anchor:anchor.id,mode,code:'NO_CLEAR_CONTINUOUS_CURVE'});continue;}
   const travel=qualifyStage(extendFinalApproach(actor,approach,anchor.position),actor,world,nav,'approach');if(!travel.ok){failures.push({anchor:anchor.id,mode,code:travel.code});continue;}stages.push(travel);world=travel.end;
  }else{
   const path=reachablePolyline(nav,current.position,staging);if(!path){failures.push({anchor:anchor.id,mode,code:'NO_CONNECTED_PATH'});continue;}
   let rejected=null;
   for(let i=1;i<path.length;i++){
    const heading=Math.atan2(path[i].y-world.root.y,path[i].x-world.root.x);
    if(Math.abs(angleDelta(heading,world.heading))>EPS){const turn=qualifyStage(turnRoute(actor,pose(world),heading),actor,world,nav,'orient-with-steps');if(!turn.ok){rejected=turn;break;}stages.push(turn);world=turn.end;}
    const walk=qualifyStage(lineRoute(actor,pose(world),path[i],heading),actor,world,nav,'approach');if(!walk.ok){rejected=walk;break;}stages.push(walk);world=walk.end;
   }
   if(!rejected&&Math.abs(angleDelta(anchor.heading,world.heading))>EPS){const turn=qualifyStage(turnRoute(actor,pose(world),anchor.heading),actor,world,nav,'face-leaf-with-steps');if(!turn.ok)rejected=turn;else {stages.push(turn);world=turn.end;}}
   if(rejected){failures.push({anchor:anchor.id,mode,code:rejected.code});continue;}
  }
  if(mode==='supported-waypoints'){const close=qualifyStage(lineRoute(actor,pose(world),anchor.position,anchor.heading),actor,world,nav,'close-approach');if(!close.ok){failures.push({anchor:anchor.id,mode,code:close.code});continue;}stages.push(close);world=close.end;}
  return {ok:true,kind:DYNAMIC_INSPECTION_VERSION,layoutKey:nav.layoutKey,target:structuredClone(target),anchor,stages,settled:world,attentionVariant,holdOnly:false,attempts:failures};
 }
 return {ok:false,code:'NO_REACHABLE_INTERACTION_ANCHOR',layoutKey:nav.layoutKey,attempts:failures};
}
