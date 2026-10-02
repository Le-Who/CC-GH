/** Exact cardinal, whole-stride routes. Turn nodes are canonical phase0. */
import {lookupWalkPhase,WALK_PHASE_REVISION} from './walk-phase-lookup.mjs';
export {WALK_PHASES,WALK_PHASE_UNITS_96} from './walk-phase-lookup.mjs';
export const STRIDE_WORLD = .64;
export const WALK_CYCLE_MS = 1200;
export const ROUTE_CADENCE_REVISION = WALK_PHASE_REVISION;
// 2 ORIGINAL24-frame quanta = .053333 world, not2/28 of the stride.
// Sampling still uses ONE distance cursor for pose and displayed root.
export const RAMP_DISTANCE_QUANTA = 2;
// Keep the validated spatial route preference. This is a turn penalty, not
// an estimate of the new ramp duration, so cadence cannot reroute saved props.
const TURN_ROUTE_PREFERENCE_MS = 600;
const directions = [[1,0],[0,1],[-1,0],[0,-1]];
const mod = (n,m) => ((n%m)+m)%m;
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const near = (a,b) => distance(a,b)<1e-7;
const key = (x,y,f,turned=false) => `${x},${y},${f},${turned?1:0}`;
export function routeProgram({navigation,anchor,entry,portalHalfSize=4,unitsPerWorld=8,
  incoming=true,initialPhase=0,turnDurations={2:2800,4:4400},canTurn=()=>true}) {
  const step=STRIDE_WORLD*unitsPerWorld;
  if(![2,4].every(n=>Number.isFinite(turnDurations[n])&&turnDurations[n]>0))throw new TypeError('Explicit authored turn durations required');
  const runway=incoming?0:mod(1-initialPhase,1)*step;
  const latticeOrigin=incoming?{...anchor}:{x:anchor.x+runway,y:anchor.y};
  if(!navigation.segment(anchor,latticeOrigin)||(runway>1e-8&&navigation.walkSegment&&!navigation.walkSegment(anchor,latticeOrigin,0,initialPhase)))return{ok:false,reason:'HALF_CYCLE_RUNWAY_BLOCKED'};
  const point=(x,y)=>({x:latticeOrigin.x+x*step,y:latticeOrigin.y+y*step});
  const minX=Math.ceil(-latticeOrigin.x/step),maxX=Math.floor((100-latticeOrigin.x)/step);
  const minY=Math.ceil(-latticeOrigin.y/step),maxY=Math.floor((100-latticeOrigin.y)/step);
  const allowed=new Map(), edgeCache=new Map();
  const inside=(x,y)=>x>=minX&&x<=maxX&&y>=minY&&y<=maxY;
  const pass=(x,y)=>{const id=`${x},${y}`;if(!allowed.has(id))allowed.set(id,navigation.passable(point(x,y)));return allowed.get(id);};
  const edge=(x,y,nx,ny,facing)=>{const id=`${x},${y}:${nx},${ny}`;if(!edgeCache.has(id)){
    const a=point(x,y),b=point(nx,ny);
    edgeCache.set(id,navigation.segment(a,b)&&(!navigation.walkSegment||navigation.walkSegment(a,b,facing,0)));
  }return edgeCache.get(id);};
  const portal=[];
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++) {
    const p=point(x,y);
    if(Math.abs(p.x-entry.x)<=portalHalfSize+1e-8&&Math.abs(p.y-entry.y)<=portalHalfSize+1e-8
      &&pass(x,y)&&navigation.segment(entry,p))portal.push({x,y,p,distance:distance(p,entry)});
  }
  portal.sort((a,b)=>a.distance-b.distance||a.x-b.x||a.y-b.y);
  if(!portal.length)return{ok:false,reason:'NO_VALID_PHASE_ALIGNED_PORTAL',latticeOrigin,portalHalfSize};
  const queue=[],best=new Map(),records=new Map();
  const add=(r,cost,previous,operation)=>{
    const id=key(r.x,r.y,r.facing,r.justTurned);if(cost>=(best.get(id)??Infinity)-1e-8)return;
    best.set(id,cost);records.set(id,{...r,cost,previous,operation});queue.push({id,cost});
  };
  if(incoming)for(const p of portal)for(let f=0;f<4;f++)add({x:p.x,y:p.y,facing:f},p.distance*.001,null,null);
  else add({x:0,y:0,facing:0},0,null,null);
  const portalKeys=new Set(portal.map(p=>`${p.x},${p.y}`));
  let terminal=null;
  while(queue.length) {
    queue.sort((a,b)=>a.cost-b.cost||(a.id<b.id?-1:a.id>b.id?1:0));const item=queue.shift();
    if(item.cost!==best.get(item.id))continue;
    const r=records.get(item.id);
    if(incoming?r.x===0&&r.y===0&&r.facing===0:portalKeys.has(`${r.x},${r.y}`)) {terminal=item.id;break;}
    const [dx,dy]=directions[r.facing],nx=r.x+dx,ny=r.y+dy;
    if(inside(nx,ny)&&pass(nx,ny)&&edge(r.x,r.y,nx,ny,r.facing*2))add({x:nx,y:ny,facing:r.facing,justTurned:false},r.cost+WALK_CYCLE_MS+(r.justTurned?TURN_ROUTE_PREFERENCE_MS:0),item.id,
      {kind:'walk',from:point(r.x,r.y),to:point(nx,ny),facing:r.facing*2,distance:step,durationMs:WALK_CYCLE_MS,phaseStart:0,phaseEnd:0});
    for(const [angleSteps,sign] of (r.justTurned||incoming&&r.x===0&&r.y===0?[]:[[2,-1],[2,1],[4,1]])) {
      if(!canTurn(point(r.x,r.y),r.facing*2,sign,angleSteps))continue;
      add({x:r.x,y:r.y,facing:mod(r.facing+sign*angleSteps/2,4),justTurned:true},r.cost+turnDurations[angleSteps]+TURN_ROUTE_PREFERENCE_MS,item.id,
        {kind:'turn',position:point(r.x,r.y),fromFacing:r.facing*2,direction:sign,angleSteps,durationMs:turnDurations[angleSteps]});
    }
  }
  if(!terminal)return{ok:false,reason:'NO_PHASE_ALIGNED_ROUTE',latticeOrigin,portalHalfSize,portalCandidates:portal.map(p=>p.p)};
  const reversed=[];let id=terminal;
  while(id!==null){const r=records.get(id);if(r.operation)reversed.push(r.operation);id=r.previous;}
  const operations=reversed.reverse();
  const legs=[];
  if(runway>1e-8)legs.push({kind:'walk',from:{...anchor},to:{...latticeOrigin},facing:0,distance:runway,
    durationMs:WALK_CYCLE_MS*mod(1-initialPhase,1),phaseStart:initialPhase,phaseEnd:0,canonicalRunway:true});
  for(const op of operations) {
    const last=legs.at(-1);
    if(op.kind==='walk'&&last?.kind==='walk'&&!last.canonicalRunway&&last.facing===op.facing&&near(last.to,op.from)) {
      last.to=op.to;last.distance+=op.distance;last.durationMs+=op.durationMs;
    } else legs.push({...op});
  }
  const speed=step/WALK_CYCLE_MS;
  for(let i=0;i<legs.length;i++) {
    const leg=legs[i];if(leg.kind!=='walk')continue;
    leg.rampInDistance=legs[i-1]?.kind==='turn'?Math.min(step*RAMP_DISTANCE_QUANTA/24,leg.distance):0;
    leg.rampOutDistance=legs[i+1]?.kind==='turn'?Math.min(step*RAMP_DISTANCE_QUANTA/24,leg.distance-leg.rampInDistance):0;
    leg.rampInMs=2*leg.rampInDistance/speed;
    leg.cruiseDistance=leg.distance-leg.rampInDistance-leg.rampOutDistance;
    leg.cruiseMs=leg.cruiseDistance/speed;
    leg.rampOutMs=2*leg.rampOutDistance/speed;
    leg.durationMs=Math.round(leg.rampInMs+leg.cruiseMs+leg.rampOutMs);
  }
  let cursor=0;for(const leg of legs){leg.startMs=cursor;cursor+=leg.durationMs;leg.endMs=cursor;}
  const points=[];for(const leg of legs) {
    if(leg.kind==='walk'){if(!points.length||!near(points.at(-1),leg.from))points.push(leg.from);points.push(leg.to);}
  }
  if(!points.length)points.push({...anchor});
  return{ok:true,legs,durationMs:cursor,distance:legs.reduce((n,l)=>n+(l.distance||0),0),points,
    portal:incoming?points[0]:points.at(-1),portalCenter:{...entry},portalHalfSize,latticeOrigin,
    phaseAtStart:incoming?0:initialPhase,phaseAtEnd:0,turnCount:legs.filter(l=>l.kind==='turn').length};
}
export function sampleRoute(program,elapsedMs,{unitsPerWorld=8,turnYaw}={}) {
  if(!program?.ok)throw new Error('Sample only a validated route');
  const t=Math.max(0,Math.min(program.durationMs,elapsedMs));
  const leg=program.legs.find(l=>t<l.endMs)||program.legs.at(-1);
  if(!leg||program.durationMs===0)return{position:{...program.points[0]},continuousPosition:{...program.points[0]},
    headingRadians:0,gaitPhase:0,groundDistance:0,continuousGroundDistance:0,
    motion:{kind:'walk',facing:0,frameIndex:0,atMs:0,durationMs:0,legIndex:-1,routeElapsedMs:0}};
  const legIndex=program.legs.indexOf(leg);
  const before=program.legs.slice(0,legIndex).reduce((n,l)=>n+(l.distance||0),0);
  const atMs=Math.max(0,Math.min(leg.durationMs,t-leg.startMs));
  if(leg.kind==='turn')return{position:{...leg.position},continuousPosition:{...leg.position},headingRadians:turnYaw?turnYaw(leg.fromFacing,leg.direction,leg.angleSteps,atMs):leg.fromFacing*Math.PI/4,
    gaitPhase:0,groundDistance:before,continuousGroundDistance:before,motion:{kind:'turn',fromFacing:leg.fromFacing,direction:leg.direction,angleSteps:leg.angleSteps,atMs,durationMs:leg.durationMs,legIndex,routeElapsedMs:t}};
  let d;
  if(leg.rampInMs&&atMs<leg.rampInMs)d=leg.rampInDistance*(atMs/leg.rampInMs)**2;
  else if(atMs<leg.rampInMs+leg.cruiseMs)d=leg.rampInDistance+(atMs-leg.rampInMs)*leg.cruiseDistance/(leg.cruiseMs||1);
  else {const u=leg.rampOutMs?Math.min(1,(atMs-leg.rampInMs-leg.cruiseMs)/leg.rampOutMs):1;
    d=leg.rampInDistance+leg.cruiseDistance+leg.rampOutDistance*(2*u-u*u);}
  d=Math.min(leg.distance,Math.max(0,d));
  const step=STRIDE_WORLD*unitsPerWorld;
  const chosen=lookupWalkPhase(leg.phaseStart+d/step);
  const sampled=Math.min(leg.distance,Math.max(0,(chosen.sampledCycles-leg.phaseStart)*step));
  const q=sampled/leg.distance,continuousQ=d/leg.distance;
  const positionAt=q=>q>=1?{...leg.to}:q<=0?{...leg.from}:{x:leg.from.x+(leg.to.x-leg.from.x)*q,y:leg.from.y+(leg.to.y-leg.from.y)*q};
  return{position:positionAt(q),continuousPosition:positionAt(continuousQ),headingRadians:leg.facing*Math.PI/4,
    gaitPhase:chosen.phase,groundDistance:before+sampled,continuousGroundDistance:before+d,
    motion:{kind:'walk',facing:leg.facing,frameIndex:chosen.frameIndex,atMs,durationMs:leg.durationMs,legIndex,routeElapsedMs:t}};
}
