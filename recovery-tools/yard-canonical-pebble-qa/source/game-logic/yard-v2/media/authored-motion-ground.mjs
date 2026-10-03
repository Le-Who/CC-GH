/** Opt-in, source-owned ground and conservative full-body occupancy checks.
 * This module registers no actor and has no Mika defaults. */
import {clone,deepFreeze} from '../util.mjs';
import {groundCoverageAllowed,paddedConvexPolygon} from '../ground-coverage.mjs';
const finite=Number.isFinite;
const directions={0:[1,0],2:[0,1],4:[-1,0],6:[0,-1]};
const point=p=>p&&finite(p.x)&&finite(p.y);
const rect=r=>r&&[r.x,r.y,r.width,r.height].every(finite)&&r.width>0&&r.height>0;
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const rotate=([x,y],a)=>[x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)];
const near=(a,b)=>Math.abs(a-b)<1e-6;
const union=boxes=>({x:Math.min(...boxes.map(b=>b.x)),y:Math.min(...boxes.map(b=>b.y)),
 width:Math.max(...boxes.map(b=>b.x+b.width))-Math.min(...boxes.map(b=>b.x)),
 height:Math.max(...boxes.map(b=>b.y+b.height))-Math.min(...boxes.map(b=>b.y))});
export function createAuthoredMotionGround(input,{remodel,obstacles=[],reservations=[]}={}) {
 const c=clone(input),fail=()=>{throw new TypeError('Complete authored ground evidence required');};
 if(c?.format!=='yard-authored-ground-motion/v1'||!c.id||!finite(c.strideWorld)||c.strideWorld<=0
  ||!Number.isSafeInteger(c.cycleMs)||c.cycleMs<=0||!finite(c.unitsPerWorld)||c.unitsPerWorld<=0
  ||!finite(c.paddingWorld)||c.paddingWorld<=0||!Array.isArray(c.facings)||[0,2,4,6].some(f=>!c.facings.includes(f)))fail();
 for(const p of Object.values(c.soles||{}))if(!Array.isArray(p)||p.length<3||p.some(v=>v.length!==2||!v.every(finite)))fail();
 if(Object.keys(c.soles||{}).length!==4)fail();
 for(const kind of ['hop','left90','right90','rest']){
  const clip=c.clips?.[kind];
  if(!clip||!Number.isSafeInteger(clip.durationMs)||clip.durationMs<=0||!Array.isArray(clip.frames)||clip.frames.length<2
   ||clip.frames[0].atMs!==0||clip.frames.at(-1).atMs!==clip.durationMs||!Array.isArray(clip.bodyBounds)||!clip.bodyBounds.length)fail();
  for(const [i,r]of clip.frames.entries())if(!Number.isSafeInteger(r.atMs)||(i&&r.atMs<=clip.frames[i-1].atMs)
   ||r.root?.length!==3||!r.root.every(finite)||!finite(r.bodyYaw)||!Array.isArray(r.contacts)||r.contacts.some(f=>!c.soles[f.foot]
   ||typeof f.supportId!=='string'||f.world?.length!==3||!f.world.every(finite)||!finite(f.yaw)))fail();
  for(const [i,r]of clip.bodyBounds.entries())if(!finite(r.atMs)||(i&&r.atMs<=clip.bodyBounds[i-1].atMs)
   ||r.box?.length!==4||!r.box.every(finite)||r.box[0]>=r.box[2]||r.box[1]>=r.box[3])fail();
  if(clip.bodyBounds[0].atMs!==0||clip.bodyBounds.at(-1).atMs!==clip.durationMs
   ||clip.frames.some(r=>!clip.bodyBounds.some(b=>near(b.atMs,r.atMs))))fail();
 }
 if(c.clips.hop.durationMs!==c.cycleMs||!near(c.clips.hop.frames[0].root[0],0)||!near(c.clips.hop.frames.at(-1).root[0],c.strideWorld))fail();
 if(!Array.isArray(obstacles)||!obstacles.every(rect)||!Array.isArray(reservations)
  ||reservations.some(r=>!rect(r.rect)||![r.startMs,r.endMs].every(finite)||r.endMs<=r.startMs))fail();
 const blocks=deepFreeze(clone(obstacles)),reserved=deepFreeze(clone(reservations));deepFreeze(c);const cache=new Map();
 function coverage(kind,facing,sourceMs=0){
  if(!directions[facing]||!['hop','left90','right90','rest','stand'].includes(kind))return null;
  const clip=c.clips[kind==='stand'?'hop':kind],start=clip.frames.find(r=>r.atMs===sourceMs);
  if(!start||sourceMs>=clip.durationMs||kind!=='hop'&&sourceMs!==0)return null;
  const id=`${kind}:${facing}:${sourceMs}`;if(cache.has(id))return cache.get(id);
  const angle=facing*Math.PI/4,polygons=[],seen=new Map();
  for(const row of (kind==='stand'?clip.frames.slice(0,1):clip.frames.filter(r=>r.atMs>=sourceMs)))for(const f of row.contacts){
   const anchor=rotate([f.world[0]-start.root[0],f.world[1]-start.root[1]],angle);
   const polygon=paddedConvexPolygon(c.soles[f.foot].map(p=>{
    const q=rotate(p,f.yaw+angle);return[q[0]+anchor[0],q[1]+anchor[1]];
   }),c.paddingWorld);
   const old=seen.get(f.supportId);
   if(old){if(old.some((p,i)=>Math.hypot(p[0]-polygon[i][0],p[1]-polygon[i][1])>1e-6))throw new TypeError('Planted source support drift');}
   else{seen.set(f.supportId,polygon);polygons.push(polygon);}
  }
  const boxes=(kind==='stand'?clip.bodyBounds.slice(0,1):clip.bodyBounds.filter(r=>r.atMs>=sourceMs)).map(({box:[x0,y0,x1,y1]})=>{
   const corners=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(([x,y])=>rotate([x-start.root[0],y-start.root[1]],angle));
   const x=Math.min(...corners.map(p=>p[0]))-c.paddingWorld,y=Math.min(...corners.map(p=>p[1]))-c.paddingWorld;
   return{x,y,width:Math.max(...corners.map(p=>p[0]))+c.paddingWorld-x,height:Math.max(...corners.map(p=>p[1]))+c.paddingWorld-y};
  });
  const value=deepFreeze({polygons,body:union(boxes),durationMs:clip.durationMs-sourceMs});cache.set(id,value);return value;
 }
 function atOrigin(value,origin){const b=value.body,u=c.unitsPerWorld;return{x:origin.x+b.x*u,y:origin.y+b.y*u,width:b.width*u,height:b.height*u};}
 function allowed(value,origin,interval){
  if(!value||!point(origin)||!groundCoverageAllowed(value.polygons,origin,remodel,{unitsPerWorld:c.unitsPerWorld,obstacles:blocks}))return false;
  const body=atOrigin(value,origin);if(blocks.some(r=>overlap(body,r)))return false;
  if(interval){
   if(![interval.startMs,interval.endMs].every(finite)||interval.endMs<=interval.startMs)return false;
   if(reserved.some(r=>interval.startMs<r.endMs&&interval.endMs>r.startMs&&overlap(body,r.rect)))return false;
  }
  return true;
 }
 function walkSegment(a,b,facing,phaseStart=0){
  if(!point(a)||!point(b)||phaseStart!==0||!directions[facing])return false;
  const d=directions[facing],length=(b.x-a.x)*d[0]+(b.y-a.y)*d[1],side=(b.x-a.x)*d[1]-(b.y-a.y)*d[0],step=c.strideWorld*c.unitsPerWorld;
  const cycles=Math.round(length/step);if(cycles<0||Math.abs(side)>1e-7||!near(cycles*step,length))return false;
  if(!cycles)return allowed(coverage('hop',facing),a);
  for(let i=0;i<cycles;i++)if(!allowed(coverage('hop',facing),{x:a.x+i*step*d[0],y:a.y+i*step*d[1]}))return false;
  return true;
 }
 function turnValues(facing,sign,steps){
  if(!directions[facing]||![1,-1].includes(sign)||![2,4].includes(steps)||steps===4&&sign!==1)return null;
  return steps===2?[coverage(sign===1?'left90':'right90',facing)]:[coverage('left90',facing),coverage('left90',(facing+2)%8)];
 }
 function canTurn(origin,facing,sign,steps){const values=turnValues(facing,sign,steps);return !!values&&values.every(v=>allowed(v,origin));}
 function canRunway(origin,facing,sourceMs){return allowed(coverage('hop',facing,sourceMs),origin);}
 function reservation(leg,startMs){
  if(!leg||!finite(startMs)||!finite(leg.durationMs)||leg.durationMs<=0||!finite(startMs+leg.durationMs))return null;
  let boxes=[];
  if(leg.kind==='turn'){
   const values=turnValues(leg.fromFacing,leg.direction,leg.angleSteps);if(!values||!point(leg.position))return null;
   boxes=values.map(v=>atOrigin(v,leg.position));
  }else if(leg.kind==='walk'||leg.kind==='authoredRunway'){
   if(!point(leg.from)||!directions[leg.facing])return null;
   const fromMs=leg.kind==='authoredRunway'?leg.sourceStartMs:0,v=coverage('hop',leg.facing,fromMs);if(!v)return null;
   const cycles=leg.kind==='authoredRunway'?1:leg.cycles;
   if(!Number.isSafeInteger(cycles)||cycles<1)return null;
   const d=directions[leg.facing];for(let i=0;i<cycles;i++)boxes.push(atOrigin(v,{x:leg.from.x+i*c.strideWorld*c.unitsPerWorld*d[0],y:leg.from.y+i*c.strideWorld*c.unitsPerWorld*d[1]}));
  }else if(leg.kind==='rest'){
   const v=coverage('rest',leg.facing);if(!v||!point(leg.position))return null;boxes=[atOrigin(v,leg.position)];
  }else return null;
  return{startMs,endMs:startMs+leg.durationMs,rect:union(boxes)};
 }
 function planAllowed(program,atMs){
  if(!program?.ok||!finite(atMs)||!Array.isArray(program.legs))return false;
  if(!program.legs.length)return program.durationMs===0&&allowed(coverage('stand',0),program.points?.[0]);
  return program.legs.every(leg=>{
   if(!finite(leg.startMs)||!finite(leg.endMs)||leg.endMs-leg.startMs!==leg.durationMs)return false;
   let safe=false;
   if(leg.kind==='walk')safe=walkSegment(leg.from,leg.to,leg.facing)&&Number.isSafeInteger(leg.cycles)&&leg.cycles>=1
    &&leg.durationMs===leg.cycles*c.cycleMs&&near(Math.hypot(leg.to.x-leg.from.x,leg.to.y-leg.from.y),leg.cycles*c.strideWorld*c.unitsPerWorld);
   else if(leg.kind==='authoredRunway'){
    const row=c.clips.hop.frames.find(r=>r.atMs===leg.sourceStartMs),d=directions[leg.facing];
    safe=!!row&&!!d&&point(leg.from)&&point(leg.to)&&canRunway(leg.from,leg.facing,leg.sourceStartMs)
     &&leg.durationMs===c.cycleMs-leg.sourceStartMs
     &&near(leg.to.x-leg.from.x,(c.strideWorld-row.root[0])*c.unitsPerWorld*d[0])
     &&near(leg.to.y-leg.from.y,(c.strideWorld-row.root[0])*c.unitsPerWorld*d[1]);
   }else if(leg.kind==='turn')safe=canTurn(leg.position,leg.fromFacing,leg.direction,leg.angleSteps)
    &&leg.durationMs===c.clips[leg.direction===1?'left90':'right90'].durationMs*leg.angleSteps/2;
   else if(leg.kind==='rest')safe=allowed(coverage('rest',leg.facing),leg.position);
   if(!safe)return false;
   const proposed=reservation(leg,atMs+leg.startMs);if(!proposed)return false;
   return !reserved.some(r=>proposed.startMs<r.endMs&&proposed.endMs>r.startMs&&overlap(proposed.rect,r.rect));
  });
 }
 return Object.freeze({contract:c,walkSegment,canTurn,canRunway,canStand:(p,f=0)=>allowed(coverage('stand',f),p),canRest:(p,f=0)=>allowed(coverage('rest',f),p),
  reservation,planAllowed,coverage:(...args)=>clone(coverage(...args)),
  motionAllowed:(kind,origin,facing,{sourceMs=0,startMs,endMs}={})=>allowed(coverage(kind,facing,sourceMs),origin,{startMs,endMs})});
}
