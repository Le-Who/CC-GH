/** Pip-owned 40 ms route clock. Uses the existing graph only with an explicit
 * independent profile, and maps cardinal start orientations around the square
 * yard center. No source media or timings are borrowed from Mika or Mochi. */
import {clone,deepFreeze} from '../util.mjs';
import {createAuthoredStrideSampler} from './authored-stride.mjs';
import {routeProgram} from './stride-routes.mjs';
const finite=Number.isFinite,near=(a,b)=>Math.abs(a-b)<1e-6;
const dirs={0:[1,0],2:[0,1],4:[-1,0],6:[0,-1]};
const point=p=>p&&finite(p.x)&&finite(p.y);
const rot=(p,f)=>{const x=p.x-50,y=p.y-50;switch((f+8)%8){case 0:return{x:p.x,y:p.y};case 2:return{x:50-y,y:50+x};case 4:return{x:50-x,y:50-y};case 6:return{x:50+y,y:50-x};default:throw Error('Cardinal rotation required');}};
export function createPipRouteAdapter({strideContract,motionContract}={}){
 const sampler=createAuthoredStrideSampler(strideContract),s=sampler.contract,c=clone(motionContract);
 if(c?.format!=='yard-pip-ground-motion/v1'||c.visitorId!=='pip_hamster'||c.sourceSampleMs!==40||c.unitsPerWorld!==8||!near(c.strideWorld,s.strideWorld)||c.cycleMs!==s.durationMs||c.clips.walk.frames.length!==s.frames.length)throw TypeError('Pip exact 40 ms source contracts required');
 for(const [i,r]of c.clips.walk.frames.entries())if(r.atMs!==s.frames[i].atMs||!near(r.root[0],s.frames[i].distanceWorld))throw TypeError('Pip walk/root rows differ');
 for(const [k,duration]of [['left90',1920],['right90',1920],['left180',3840]])if(c.clips[k].durationMs!==duration||c.clips[k].frames.some((r,i)=>r.atMs!==i*40))throw TypeError('Pip exact turn frames required');
 deepFreeze(c);const u=c.unitsPerWorld,step=s.strideWorld*u;
 const profile=deepFreeze({id:'pip',revision:c.id,visitorId:'pip_hamster',playbackReady:false,unitsPerWorld:u,sourceSampleMs:40,locomotion:{strideWorld:s.strideWorld,cycleMs:s.durationMs,facings:[0,2,4,6],canonicalPhase:0,phaseSamples:s.frames.slice(0,-1).map(r=>r.atMs/s.durationMs),rampDistanceQuanta:0,rampReferenceSamples:20,turnRoutePreferenceMs:320},turns:{durations:{2:1920,4:3840},entryPhase:0,exitPhase:0,variants:[0,2,4,6].flatMap(f=>[`${f}:-1:2`,`${f}:1:2`,`${f}:1:4`])}});
 function plan({navigation,guard,anchor,entry,incoming=true,initialFacing=0,initialSourceMs=0,atMs=0,portalHalfSize=4}={}){
  if(!navigation||typeof navigation.passable!=='function'||typeof navigation.segment!=='function'||!guard||JSON.stringify(guard.contract)!==JSON.stringify(c)||!point(anchor)||!point(entry)||!finite(atMs)||!finite(portalHalfSize)||portalHalfSize<0)throw TypeError('Explicit matching Pip route inputs required');
  if(!dirs[initialFacing]||initialSourceMs!==0)return{ok:false,reason:'PIP_CANONICAL_CARDINAL_HANDOFF_REQUIRED'};
  if(!guard.canStand(anchor,initialFacing))return{ok:false,reason:'PIP_CANONICAL_STANCE_BLOCKED'};
  const world=p=>rot(p,initialFacing),local=p=>rot(p,-initialFacing),heading=f=>(f+initialFacing)%8;
  const nav={...navigation,passable:p=>navigation.passable(world(p)),segment:(a,b)=>navigation.segment(world(a),world(b)),walkSegment:(a,b,f,phase)=>(!navigation.walkSegment||navigation.walkSegment(world(a),world(b),heading(f),phase))&&guard.walkSegment(world(a),world(b),heading(f),phase)};
  const base=routeProgram({navigation:nav,anchor:local(anchor),entry:local(entry),incoming,initialPhase:0,portalHalfSize,actorProfile:profile,unitsPerWorld:u,turnDurations:profile.turns.durations,canTurn:(p,f,d,q)=>guard.canTurn(world(p),heading(f),d,q)});
  if(!base.ok)return base;
  const legs=base.legs.map(l=>{
   if(l.kind==='turn')return{kind:'turn',position:world(l.position),fromFacing:heading(l.fromFacing),direction:l.direction,angleSteps:l.angleSteps,durationMs:profile.turns.durations[l.angleSteps]};
   const cycles=Math.round(l.distance/step);if(cycles<1||!near(cycles*step,l.distance))throw TypeError('Whole Pip cycles only');return{kind:'walk',from:world(l.from),to:world(l.to),facing:heading(l.facing),cycles,netDistanceWorld:cycles*s.strideWorld,durationMs:cycles*s.durationMs};
  });
  let cursor=0;for(const l of legs){l.startMs=cursor;cursor+=l.durationMs;l.endMs=cursor;}
  const program={format:'yard-pip-route/v1',ok:true,runtimeActivated:false,actorReady:false,initialFacing,motionId:c.id,strideId:s.id,unitsPerWorld:u,legs,durationMs:cursor,portal:world(base.portal),portalCenter:clone(entry),points:base.points.map(world),latticeOrigin:clone(anchor),phaseAtEnd:0,turnCount:legs.filter(l=>l.kind==='turn').length};
  if(!guard.planAllowed(program,atMs))return{ok:false,reason:'PIP_AUTHORED_OCCUPANCY_CONFLICT'};
  program.reservations=legs.map(l=>guard.reservation(l,atMs+l.startMs));return deepFreeze(program);
 }
 function sample(program,elapsedMs){
  if(program?.format!=='yard-pip-route/v1'||!program.ok||program.motionId!==c.id||program.strideId!==s.id||program.unitsPerWorld!==u||!finite(elapsedMs))throw TypeError('Matching Pip program required');
  const t=Math.max(0,Math.min(program.durationMs,elapsedMs)),leg=program.legs.find(l=>t<l.endMs)||program.legs.at(-1);
  if(!leg)return{position:clone(program.points[0]),headingRadians:program.initialFacing*Math.PI/4,complete:true,motion:{kind:'walk',facing:program.initialFacing,frameIndex:0}};
  const at=Math.max(0,Math.min(leg.durationMs,t-leg.startMs));
  if(leg.kind==='turn'){
   const kind=leg.angleSteps===4?'left180':leg.direction===1?'left90':'right90',rows=c.clips[kind].frames,index=Math.min(rows.length-1,Math.floor(at/40)),row=rows[index];
   return{position:clone(leg.position),headingRadians:leg.fromFacing*Math.PI/4+row.bodyYaw,complete:t===program.durationMs,motion:{kind:'turn',fromFacing:leg.fromFacing,direction:leg.direction,angleSteps:leg.angleSteps,atMs:at,durationMs:leg.durationMs,frameIndex:index,sourceSampleMs:40}};
  }
  const q=sampler.sample(at,{cycles:leg.cycles}),d=dirs[leg.facing],position={x:leg.from.x+d[0]*q.distanceWorld*u,y:leg.from.y+d[1]*q.distanceWorld*u};
  return{position,continuousPosition:{x:leg.from.x+d[0]*q.continuousDistanceWorld*u,y:leg.from.y+d[1]*q.continuousDistanceWorld*u},headingRadians:leg.facing*Math.PI/4,gaitPhase:q.phase,frameIndex:q.frameIndex,complete:t===program.durationMs,motion:{kind:'walk',facing:leg.facing,frameIndex:q.frameIndex,atMs:at,durationMs:leg.durationMs,sourceSampleMs:40}};
 }
 return Object.freeze({profile,contract:c,plan,sample});
}
