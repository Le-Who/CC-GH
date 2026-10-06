/** Optional visual prefetch only. The persisted plan and its actor sampler own
 * time, roots and phases; this cursor only visits their next pose boundaries.
 * In particular, native runtimeCells can have different page ownership from
 * the source manifest. Never compare source pages before binding the clip. */
import {sampleStay} from '../../../game-logic/yard-v2/media/stay-schedule.mjs';
import {selectPetPose} from './pose-selection.mjs';
import {atlasPageFor} from './atlas.mjs';

export function boundPageOwner(clip,index){
 const url=new URL(atlasPageFor(clip,index).page.src,clip.assetBaseURL);
 if(clip.assetRevision)url.searchParams.set('yard-media',clip.assetRevision);
 return url.href;
}

// A source boundary added to epoch milliseconds can round down. Sample just
// inside the new interval (at most a few epoch ULPs), never a cadence-sized hop.
const inside=at=>at+Math.max(1e-7,Math.abs(at)*Number.EPSILON*2);
const positive=n=>Number.isFinite(n)&&n>0;

/** Inverse of Mika's existing distance ramp, for a prefetch event only. The
 * result is always passed back through sampleStay and selectPetPose. It never
 * supplies a root, gait phase, frame or elapsed time to the renderer. */
function rampTime(leg,distance){
 const d=Math.max(0,Math.min(leg.distance,distance));
 if(leg.rampInDistance>0&&d<leg.rampInDistance)return leg.rampInMs*Math.sqrt(d/leg.rampInDistance);
 if(leg.cruiseDistance>0&&d<leg.rampInDistance+leg.cruiseDistance)
  return leg.rampInMs+(d-leg.rampInDistance)*leg.cruiseMs/leg.cruiseDistance;
 if(leg.rampOutDistance>0){const q=Math.max(0,Math.min(1,(d-leg.rampInDistance-leg.cruiseDistance)/leg.rampOutDistance));
  return leg.rampInMs+leg.cruiseMs+leg.rampOutMs*(1-Math.sqrt(1-q));}
 return leg.durationMs;
}

function nextBoundary(plan,at,pet,pose,entry){
 const segment=plan.schedule?.segments?.find(s=>at>=s.startAt&&at<s.endAt);
 if(!segment)return null;
 let end=segment.endAt,event=end,periodic=false,scope=segment;
 if(pet.phase==='active-clip'){
  if(!positive(pose.clip.fps)||!Number.isFinite(pet.clipAtMs))return null;
  const nextSource=(pose.sourceIndex+1)*1000/pose.clip.fps;
  event=at+nextSource-pet.clipAtMs;
  if(segment.kind==='loop'){
   event=Math.min(event,at+segment.sourceEndMs-pet.clipAtMs);periodic=true;
  }else if(pose.sourceIndex===pose.clip.frameCount-1)event=end;
 }else{
  const route=segment.route,elapsed=at-segment.startAt;
  const leg=route?.legs?.find(l=>elapsed<l.endMs);
  if(!leg)return{at:end,end,scope,periodic:false};
  const start=segment.startAt+leg.startMs;end=Math.min(end,segment.startAt+leg.endMs);scope=leg;
  if(pet.motion?.kind==='turn'){
   if(!positive(pose.clip.fps))return null;
   event=start+(pose.index+1)*1000/pose.clip.fps;
  }else{
   const phases=pose.clip.phaseSamples,cycleMs=entry.profile.locomotion.cycleMs;
   if(!phases?.length||!positive(cycleMs))return null;
   const nextPhase=phases[pose.index+1]??1;
   if(route.format==='yard-authored-route/v1'||route.format==='yard-pip-route/v1'){
    // Authored anticipation/overshoot is time-sampled, never distance-inverted.
    const offset=leg.kind==='authoredRunway'?leg.sourceStartMs:0;
    const sourceAt=at-start+offset,cycle=Math.floor(sourceAt/cycleMs);
    event=start-offset+(cycle+nextPhase)*cycleMs;periodic=leg.kind==='walk';
   }else if(Number.isFinite(leg.cruiseDistance)&&Number.isFinite(pet.groundDistance)){
    const step=entry.profile.locomotion.strideWorld*entry.profile.unitsPerWorld;
    const before=route.legs.slice(0,route.legs.indexOf(leg)).reduce((n,l)=>n+(l.distance||0),0);
    const cycle=Math.round(leg.phaseStart+(pet.groundDistance-before)/step-pet.gaitPhase);
    const distance=(cycle+nextPhase-leg.phaseStart)*step;
    event=start+rampTime(leg,distance);periodic=true;
   }else return null; // Unknown visual clock: omit speculation, keep demand.
  }
 }
 event=Math.min(event,end);
 if(!Number.isFinite(event)||event<at)return null;
 return{at:Math.min(inside(event),end),end,scope,periodic};
}

/** One lazy, constant-size result per live plan (weakly held), not a generated
 * timeline or whole-world snapshot. Limits bound cold work and are fail-safe:
 * if the nearest change cannot be established, no optional page is requested.
 * AtlasCache still decides whether a hint fits spare decode bytes/slots. */
export function createBoundPageLookahead({bindClip=clip=>clip,maxSamples=96,maxLookaheadMs=2000,retryMs=250}={}){
 if(typeof bindClip!=='function'||!Number.isInteger(maxSamples)||maxSamples<0||!Number.isFinite(maxLookaheadMs)||maxLookaheadMs<0||!positive(retryMs))throw TypeError('Bounded visual lookahead options required');
 let cache=new WeakMap();
 function requests(entry,plan,at,currentPet){
  if(!Number.isFinite(at))throw TypeError('Finite presentation time required');
  const sample=t=>entry.presentation?entry.presentation.sample(plan,t,currentPet||{}):sampleStay(plan,t,currentPet||{},{actorProfile:entry.profile});
  const pet=currentPet||sample(at);
  if(!pet)return{required:[],lookahead:[],nextAt:null,samples:0,bounded:false};
  const select=p=>selectPetPose(entry.manifest,p,{actorProfile:entry.profile});
  const first=select(pet),bound=bindClip(first.clip),current={...first,clip:bound},owner=boundPageOwner(bound,first.index);
  const required=[current],prior=cache.get(plan);
  if(prior&&prior.entry===entry&&prior.bound===bound&&prior.owner===owner&&at>=prior.at&&at<prior.until)
   return{required,lookahead:prior.lookahead,nextAt:prior.nextAt,samples:0,bounded:prior.bounded};
  const limit=at+maxLookaheadMs,seen=new Map();let cursor=at,selected=first,value=pet,samples=0,nextAt=null,bounded=false,lookahead=[];
  while(samples<maxSamples){
   const event=nextBoundary(plan,cursor,value,selected,entry);
   if(!event){bounded=true;break;}
   let next=event.at;
   if(event.periodic){
    let states=seen.get(event.scope);if(!states){states=new Set();seen.set(event.scope,states);}
    const state=selected.sourceIndex??selected.index;
    // A complete same-owner cycle cannot hide a different page. Skip repeated
    // cycles, but still inspect the next leg/clip boundary through its sampler.
    if(states.has(state))next=event.end;else states.add(state);
   }
   if(next>limit){bounded=true;break;}
   if(!(next>cursor)){bounded=true;break;}
   cursor=next;value=sample(cursor);samples++;
   if(!value)break;
   selected=select(value);const clip=bindClip(selected.clip);
   if(boundPageOwner(clip,selected.index)!==owner){lookahead=[{...selected,clip}];nextAt=cursor;break;}
  }
  if(samples===maxSamples&&!lookahead.length)bounded=true;
  cache.set(plan,{entry,bound,owner,at,until:nextAt??Math.min(at+retryMs,Math.max(inside(at),cursor)),lookahead,nextAt,bounded});
  return{required,lookahead,nextAt,samples,bounded};
 }
 return Object.freeze({requests,clear(){cache=new WeakMap();}});
}
