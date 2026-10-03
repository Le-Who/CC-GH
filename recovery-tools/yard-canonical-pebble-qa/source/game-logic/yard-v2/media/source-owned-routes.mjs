/** Source-owned cardinal adapter. Exact source cadence and explicit entry/exit
 * facing; only the shared graph algorithm is reused, never another actor clock.
 * Existing Mika and Mochi route semantics remain on their original adapters. */
import {clone,deepFreeze} from '../util.mjs';
import {createAuthoredStrideSampler} from './authored-stride.mjs';
import {routeProgram} from './stride-routes.mjs';
const finite=Number.isFinite,near=(a,b)=>Math.abs(a-b)<1e-6;
const directions={0:[1,0],2:[0,1],4:[-1,0],6:[0,-1]};
const point=p=>p&&finite(p.x)&&finite(p.y);
export function createSourceOwnedRouteAdapter({strideContract,motionContract}={}) {
 const sampler=createAuthoredStrideSampler(strideContract),c=clone(motionContract),s=sampler.contract;
 const fail=()=>{throw new TypeError('Matching source-owned route and ground contracts required');};
 if(c?.format!=='yard-authored-ground-motion/v1'||!finite(c.unitsPerWorld)||c.unitsPerWorld<=0
  ||!near(c.strideWorld,s.strideWorld)||c.cycleMs!==s.durationMs||c.clips?.hop?.frames?.length!==s.frames.length)fail();
 if(c.clips.hop.frames.some((r,i)=>r.atMs!==s.frames[i].atMs||!near(r.root[0],s.frames[i].distanceWorld)||!near(r.root[1],0)||!near(r.root[2],0)))fail();
 const turnMs=c.clips.left90?.durationMs,sampleMs=c.clips.left90?.frames?.[1]?.atMs;
 if(!Number.isSafeInteger(sampleMs)||sampleMs<=0||['left90','right90'].some(k=>c.clips[k]?.frames?.some((r,i)=>r.atMs!==i*sampleMs)))fail();
 if(['left90','right90'].some(k=>!c.clips[k]?.frames?.every(r=>finite(r.bodyYaw))))fail();
 if(!Number.isSafeInteger(turnMs)||turnMs<=0||turnMs!==c.clips.right90?.durationMs)fail();
 deepFreeze(c);const u=c.unitsPerWorld,step=s.strideWorld*u;
 const profile=deepFreeze({id:'authored-candidate',revision:c.id,visitorId:c.visitorId,playbackReady:false,unitsPerWorld:u,
  locomotion:{strideWorld:s.strideWorld,cycleMs:s.durationMs,facings:[0,2,4,6],canonicalPhase:0,
   phaseSamples:s.frames.slice(0,-1).map(r=>r.atMs/s.durationMs),rampDistanceQuanta:0,rampReferenceSamples:s.frames.length-1,turnRoutePreferenceMs:250},
  turns:{durations:{2:turnMs,4:2*turnMs},entryPhase:0,exitPhase:0,variants:[0,2,4,6].flatMap(f=>[`${f}:-1:2`,`${f}:1:2`,`${f}:1:4`])}});
 function plan({navigation,guard,anchor,entry,incoming=true,initialSourceMs=0,initialFacing=0,atMs=0,portalHalfSize=4}={}) {
  if(!navigation||typeof navigation.passable!=='function'||typeof navigation.segment!=='function'||!guard
   ||JSON.stringify(guard.contract)!==JSON.stringify(c)||!point(anchor)||!point(entry)||!finite(atMs)
   ||!finite(portalHalfSize)||portalHalfSize<0)throw new TypeError('Explicit navigation, matching guard, points, and route clock required');
  // Rotate the square graph coordinate frame only. Ground evidence and rendered
  // actor clips still use the true world-facing cardinal source samples.
  if(!directions[initialFacing])return{ok:false,reason:'UNSUPPORTED_AUTHORED_ENTRY_FACING'};
  const angle=initialFacing*Math.PI/4,rotate=(p,a)=>({x:50+(p.x-50)*Math.cos(a)-(p.y-50)*Math.sin(a),y:50+(p.x-50)*Math.sin(a)+(p.y-50)*Math.cos(a)});
  const world=p=>rotate(p,angle),local=p=>rotate(p,-angle),facing=f=>(f+initialFacing)%8;
  const row=s.frames.find(r=>r.atMs===initialSourceMs);
  if(!row||initialSourceMs>=s.durationMs||incoming&&initialSourceMs!==0)return{ok:false,reason:'EXACT_AUTHORED_START_FRAME_REQUIRED'};
  if(initialSourceMs===0&&!guard.canStand(anchor,initialFacing))return{ok:false,reason:'AUTHORED_CANONICAL_STANCE_BLOCKED'};
  const prefix=[];let origin={...anchor};
  if(!incoming&&initialSourceMs!==0){
   const remaining=s.strideWorld-row.distanceWorld;origin={x:anchor.x+remaining*u*directions[initialFacing][0],y:anchor.y+remaining*u*directions[initialFacing][1]};
   if(!navigation.segment(anchor,origin)||!guard.canRunway(anchor,initialFacing,initialSourceMs))return{ok:false,reason:'AUTHORED_RUNWAY_BLOCKED'};
   prefix.push({kind:'authoredRunway',from:{...anchor},to:{...origin},facing:initialFacing,sourceStartMs:initialSourceMs,
    sourceStartDistanceWorld:row.distanceWorld,netDistanceWorld:remaining,durationMs:s.durationMs-initialSourceMs});
  }
  const nav={passable:p=>navigation.passable(world(p)),segment:(a,b)=>navigation.segment(world(a),world(b)),
   walkSegment:(a,b,f,phase)=>(!navigation.walkSegment||navigation.walkSegment(world(a),world(b),facing(f),phase))&&guard.walkSegment(world(a),world(b),facing(f),phase)};
  const base=routeProgram({navigation:nav,anchor:local(origin),entry:local(entry),incoming,initialPhase:0,portalHalfSize,
   actorProfile:profile,unitsPerWorld:u,turnDurations:profile.turns.durations,canTurn:(p,f,sign,steps)=>guard.canTurn(world(p),facing(f),sign,steps)});
  if(!base.ok)return base;
  const legs=prefix.concat(base.legs.map(leg=>{
   if(leg.kind==='turn')return{kind:'turn',position:world(leg.position),fromFacing:facing(leg.fromFacing),direction:leg.direction,angleSteps:leg.angleSteps,durationMs:profile.turns.durations[leg.angleSteps]};
   const cycles=Math.round(leg.distance/step);
   if(cycles<1||!near(cycles*step,leg.distance))throw new TypeError('Canonical whole-source cycles required');
   return{kind:'walk',from:world(leg.from),to:world(leg.to),facing:facing(leg.facing),cycles,netDistanceWorld:cycles*s.strideWorld,durationMs:cycles*s.durationMs};
  }));
  let cursor=0;for(const leg of legs){leg.startMs=cursor;cursor+=leg.durationMs;leg.endMs=cursor;}
  const result={format:'yard-authored-route/v1',ok:true,runtimeActivated:false,actorReady:false,motionId:c.id,strideId:s.id,
   sourceStartMs:initialSourceMs,sourceSampleMs:sampleMs,initialFacing,unitsPerWorld:u,legs,durationMs:cursor,portal:world(base.portal),portalCenter:world(base.portalCenter),
   turnCount:legs.filter(l=>l.kind==='turn').length,points:prefix.length?[{...anchor},...base.points.map(world)]:base.points.map(world),
   latticeOrigin:origin,phaseAtEnd:0};
  if(!guard.planAllowed(result,atMs))return{ok:false,reason:'AUTHORED_OCCUPANCY_CONFLICT'};
  result.reservations=legs.map(l=>guard.reservation(l,atMs+l.startMs));return deepFreeze(result);
 }
 function sample(program,elapsedMs){
  if(program?.format!=='yard-authored-route/v1'||!program.ok||program.motionId!==c.id||program.strideId!==s.id
   ||program.unitsPerWorld!==u||!finite(elapsedMs))throw new TypeError('Matching validated authored route required');
  const t=Math.max(0,Math.min(program.durationMs,elapsedMs));const leg=program.legs.find(l=>t<l.endMs)||program.legs.at(-1);
  if(!leg)return{position:{...program.points[0]},frameIndex:0,gaitPhase:0,complete:true,headingRadians:(program.initialFacing||0)*Math.PI/4,motion:{kind:'walk',facing:program.initialFacing||0,frameIndex:0}};
  const at=Math.max(0,Math.min(leg.durationMs,t-leg.startMs));
  if(leg.kind==='turn'){
   const second=leg.angleSteps===4&&at>=turnMs,local=second?at-turnMs:at;
   const rows=c.clips[leg.direction===1?'left90':'right90'].frames;
   const row=rows.findLast(r=>r.atMs<=local)||rows[0];
   return{position:{...leg.position},headingRadians:leg.fromFacing*Math.PI/4+(second?Math.PI/2:0)+row.bodyYaw,
    complete:t===program.durationMs,motion:{kind:'turn',fromFacing:leg.fromFacing,direction:leg.direction,angleSteps:leg.angleSteps,atMs:at,durationMs:leg.durationMs,frameIndex:Math.min(Math.round(leg.durationMs/sampleMs),Math.floor(at/sampleMs))}};
  }
  const chosen=leg.kind==='authoredRunway'?sampler.sample(leg.sourceStartMs+at):sampler.sample(at,{cycles:leg.cycles});
  const baseline=leg.kind==='authoredRunway'?leg.sourceStartDistanceWorld:0;
  const relative=chosen.distanceWorld-baseline,continuous=chosen.continuousDistanceWorld-baseline,d=directions[leg.facing];
  // Signed source anticipation and settling overshoot remain intact. The root
  // is held on the same 20 Hz row as its sprite, never at the diagnostic cursor.
  const pos=distance=>({x:leg.from.x+d[0]*distance*u,y:leg.from.y+d[1]*distance*u});
  return{position:pos(relative),continuousPosition:pos(continuous),headingRadians:leg.facing*Math.PI/4,frameIndex:chosen.frameIndex,gaitPhase:chosen.phase,
   complete:t===program.durationMs,motion:{kind:'walk',facing:leg.facing,frameIndex:chosen.frameIndex,sourceSampleMs:chosen.sampledTimeMs,atMs:at,durationMs:leg.durationMs}};
 }
 return Object.freeze({profile,contract:c,plan,sample});
}
