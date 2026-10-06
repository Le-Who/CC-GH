import {smooth} from './motion/trajectory.mjs';
import {sampleMotion} from './motion/kinematics.mjs';
import {planCanonicalInspection,supportedPose,supportedWorldValid,PIP_GARDEN_ENTRY,DYNAMIC_INSPECTION_VERSION} from './dynamic-prop-planner.mjs';
import {canonicalLayoutKey,createCanonicalNavigation} from './dynamic-navigation.mjs';
const clamp=v=>Math.max(0,Math.min(1,v));
const pulse=(t,start,d)=>{const u=(t-start)/d;return u<=0||u>=1?0:64*u**3*(1-u)**3;};
export const INSPECTION_DURATION_MS=1965;
export function sampleLocalInspection(world,focus,actor,t,variant=0){
 const channels=time=>({anticipate:pulse(time,0,180),lean:smooth((time-180)/380)*(1-smooth((time-1350)/520)),sniff:pulse(time,560,180)+.72*pulse(time,870,210),curiosity:pulse(time,1080,478)});
 const a=channels(t),lag=channels(t-95),theta=world.heading+Math.PI/2,dx=(focus.x-world.root.x)/actor.unitsPerSource,dy=(focus.y-world.root.y)/actor.unitsPerSource;
 return {version:'pip-planter-inspection/experimental-v1',...a,earFollow:t>=INSPECTION_DURATION_MS?0:lag.lean,earSniff:t>=INSPECTION_DURATION_MS?0:lag.sniff,focusSource:[Math.cos(theta)*dx+Math.sin(theta)*dy,-Math.sin(theta)*dx+Math.cos(theta)*dy,(focus.z-(world.root.z??0))/actor.unitsPerSource],attentionSide:variant%2===0?1:-1};
}
function idleSample(world){return {world:structuredClone(world),startsFromSettled:true,styleFrame:96,anticipationU:1,settleU:1,intention:'supported-idle'};}
function stageSample(stage,actor,t){const step=Math.max(0,(t-stage.route.anticipationMs)/actor.halfStepMs);return {world:sampleMotion(stage.route,stage.gait,actor,t),startsFromSettled:true,styleFrame:29+7.5*((step%2+2)%2),anticipationU:clamp(t/stage.route.anticipationMs),settleU:clamp((t-stage.route.anticipationMs-stage.route.moveMs)/stage.route.settleMs),intention:stage.kind};}
/** No economic writes, timers, HTTP, food, wear, rewards or saved visitor state.
 * Caller provides its existing visibility-aware active clock in milliseconds.
 */
export function createCanonicalInspectionController({geometry,actor,rows=[],entry=PIP_GARDEN_ENTRY,composition=true,planner=planCanonicalInspection,planningNow=()=>performance.now(),onChange=()=>{}}={}){
 let committed=structuredClone(rows),key=canonicalLayoutKey(geometry,committed),sample=null,phase='entry-blocked',error=null,plan=null,startedAt=0,lastAt=0,recovery=null,targetSlotId=null,pendingTarget=null,serial=0,completed=0,planCount=0,invalidations=0,disposed=false,lastPlanningMs=0,maxPlanningMs=0,planning=null,planSerial=0;
 const navigation=()=>createCanonicalNavigation({geometry,rows:committed,actor,composition});
 const valid=w=>{try{return supportedWorldValid(w,actor,navigation());}catch{return false;}};
 function spawn(){if(sample)return;const initial=supportedPose(actor,entry);if(valid(initial)){sample=idleSample(initial);phase='idle';error=null;}else {phase='entry-blocked';error='REGISTERED_ENTRY_BLOCKED';}}
 spawn();
 function admit(slot,at){
  if(!sample){spawn();if(!sample)return false;}
  const id=++planSerial,layout=key,planningStart=planningNow();planning={id,layout};targetSlotId=slot;phase='planning';error=null;planCount++;
  const finish=(admitted,async=false)=>{
   if(disposed||planning?.id!==id||layout!==key)return false;
   planning=null;lastPlanningMs=Math.max(0,planningNow()-planningStart);maxPlanningMs=Math.max(maxPlanningMs,lastPlanningMs);
   if(!admitted.ok){plan=null;phase='no-path';error=admitted.code;onChange();return false;}
   plan=admitted;startedAt=async?lastAt:at+lastPlanningMs;phase='approaching';error=null;onChange();return true;
  };
  let admitted;try{admitted=planner({geometry,rows:committed,actor,targetSlotId:slot,previous:sample.world,attentionVariant:completed%2,composition});}catch(e){return finish({ok:false,code:e.message});}
  // Worker admission keeps the actor in the actual supported pose and excludes
  // its wall time from the motion clock. Stale answers can never become active.
  if(admitted?.then){admitted.then(p=>finish(p,true),e=>finish({ok:false,code:e.message},true));return true;}
  return finish(admitted);
 }
 function startRecovery(reason,at,nextTarget){
  pendingTarget=nextTarget;plan=null;planning=null;invalidations++;error=reason;
  if(!sample){phase='entry-blocked';return;}
  recovery={id:++serial,start:at,duration:620,from:structuredClone(sample)};phase='recovering';
 }
 function tick(at=lastAt){
  if(disposed)return null;if(!Number.isFinite(at)||at<lastAt)throw Error('MONOTONIC_ACTIVE_CLOCK_REQUIRED');lastAt=at;
  if(recovery){
   if(!valid(recovery.from.world)){phase='blocked-occupancy';error='COMMITTED_LAYOUT_OVERLAPS_ACTOR';return sample;}
   const u=clamp((at-recovery.start)/recovery.duration),w=smooth(u),world=structuredClone(recovery.from.world);
   for(const [side,foot] of Object.entries(world.feet))if(!foot.planted){foot.position.z*=1-w;foot.solePolygon=foot.solePolygon.map(p=>({...p,z:foot.position.z}));if(u===1){foot.planted=true;foot.plantId=`recovery:${recovery.id}:${side}`;}}
   world.support=Object.keys(world.feet).filter(s=>world.feet[s].planted);world.phase='support-preserving-recovery';world.moving=false;
   sample={...idleSample(world),poseRecovery:{id:recovery.id,u},intention:'support-preserving-recovery'};phase='recovering';
   if(u===1){recovery=null;phase='idle';const next=pendingTarget;pendingTarget=null;if(next&&committed.some(r=>r.slotId===next))admit(next,at);else {targetSlotId=null;phase='cancelled';}}
   return sample;
  }
  if(!plan)return sample;
  let elapsed=Math.max(0,at-startedAt);
  for(const stage of plan.stages){if(elapsed<stage.route.totalMs){sample=stageSample(stage,actor,elapsed);phase='approaching';return sample;}elapsed-=stage.route.totalMs;}
  const world=structuredClone(plan.settled);world.phase=elapsed>=INSPECTION_DURATION_MS?'inspection-complete':'local-leaf-inspection';
  sample={...idleSample(world),inspection:sampleLocalInspection(world,plan.anchor.focus,actor,Math.min(elapsed,INSPECTION_DURATION_MS),plan.attentionVariant),focus:plan.anchor.focus,intention:world.phase};
  phase=elapsed>=INSPECTION_DURATION_MS?'settled':'inspecting';
  if(phase==='settled'){completed++;plan=null;}
  return sample;
 }
 function updateLayout(nextRows,at=lastAt,{geometry:nextGeometry=geometry}={}){
  tick(at);const next=structuredClone(nextRows),nextKey=canonicalLayoutKey(nextGeometry,next);if(nextKey===key)return false;
  // Validate the new authoritative rows before replacing the current registry.
  createCanonicalNavigation({geometry:nextGeometry,rows:next,actor,composition});geometry=nextGeometry;committed=next;key=nextKey;
  if(planning){planning=null;invalidations++;if(committed.some(r=>r.slotId===targetSlotId)&&valid(sample.world))admit(targetSlotId,at);else {phase=valid(sample.world)?'cancelled':'blocked-occupancy';error=committed.some(r=>r.slotId===targetSlotId)?'COMMITTED_LAYOUT_OVERLAPS_ACTOR':'TARGET_REMOVED';}return true;}
  if(recovery){pendingTarget=pendingTarget&&committed.some(r=>r.slotId===pendingTarget)?pendingTarget:null;recovery={...recovery,id:++serial,start:at,from:structuredClone(sample)};if(!valid(sample.world)){phase='blocked-occupancy';error='COMMITTED_LAYOUT_OVERLAPS_ACTOR';}return true;}
  if(plan)startRecovery(committed.some(r=>r.slotId===targetSlotId)?'LAYOUT_CHANGED':'TARGET_REMOVED',at,committed.some(r=>r.slotId===targetSlotId)?targetSlotId:null);
  else if(sample&&!valid(sample.world)){phase='blocked-occupancy';error='COMMITTED_LAYOUT_OVERLAPS_ACTOR';}
  else {spawn();if(sample){phase='idle';error=null;}}
  return true;
 }
 return {
  tick,updateLayout,
  request(slot,at=lastAt){tick(at);if(typeof slot!=='string')throw Error('TARGET_SLOT_REQUIRED');if(recovery){pendingTarget=slot;return true;}if(plan){startRecovery('RETARGETED',at,slot);return true;}return admit(slot,at);},
  cancel(at=lastAt){tick(at);if(planning){planning=null;phase='cancelled';targetSlotId=null;error='CANCELLED';}else if(plan||recovery)startRecovery('CANCELLED',at,null);},
  placementIsSafe(row){if(!sample)return true;try{return supportedWorldValid(sample.world,actor,createCanonicalNavigation({geometry,actor,rows:[...committed.filter(r=>r.slotId!==row.slotId),row],composition}));}catch{return false;}},
  get sample(){return sample;},
  get state(){return {version:DYNAMIC_INSPECTION_VERSION,phase,error,targetSlotId,layoutKey:key,planLayoutKey:plan?.layoutKey??null,selectedAnchor:plan?.anchor.id??null,active:!!plan||!!recovery||!!planning,spawned:!!sample,completed,planCount,invalidations,lastPlanningMs,maxPlanningMs,stageCount:plan?.stages.length??0,routeDurationMs:plan?plan.stages.reduce((s,p)=>s+p.route.totalMs,INSPECTION_DURATION_MS):0,startsFromActualPose:true,savedVisitor:false};},
  dispose(){disposed=true;plan=null;recovery=null;planning=null;pendingTarget=null;},
 };
}
