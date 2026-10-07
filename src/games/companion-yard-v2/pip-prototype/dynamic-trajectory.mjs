import {sampleSegment} from './motion/trajectory.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const offset=(p,h,d)=>({x:p.x+Math.cos(h)*d,y:p.y+Math.sin(h)*d});
/** Prefer a single C2 quintic. Every control hull is collision certified; never
 * smooth an obstacle route by merely interpolating its unchecked corners. */
export function directContinuousTrajectory(actor,start,goal,nav){
 const d=distance(start.position,goal.position);if(d<1e-6)return null;
 for(const fraction of [.33,.5,.7,.2,1,1.4]){
  const h=d*fraction,control=[start.position,offset(start.position,start.heading,h*.5),offset(start.position,start.heading,h),offset(goal.position,goal.heading,-h),offset(goal.position,goal.heading,-h*.5),goal.position];
  if(!nav.clearControlHull(control))continue;
  const seg={kind:'quintic-heading-approach',control,offset:0,arc:[{t:0,length:0}]};let last=start.position,length=0,maxCurvature=0;
  for(let i=1;i<=160;i++){const t=i/160,p=sampleSegment(seg,t);length+=distance(last,p.point);last=p.point;seg.arc.push({t,length});const v=p.tangent,a=p.second;maxCurvature=Math.max(maxCurvature,Math.abs(v.x*a.y-v.y*a.x)/Math.pow(Math.hypot(v.x,v.y),3));}
  if(!Number.isFinite(maxCurvature)||maxCurvature>actor.maxPathCurvaturePerSource/actor.unitsPerSource)continue;seg.length=length;
  const moveMs=Math.max(2,Math.ceil(1.875*length/(actor.maxSpeedSourcePerSecond*actor.unitsPerSource)*1000/actor.halfStepMs))*actor.halfStepMs;
  return {ok:true,format:'yard-continuous-trajectory-request/v1',segments:[seg],length,maxCurvature,moveMs,anticipationMs:actor.anticipationMs,settleMs:2*actor.halfStepMs,totalMs:actor.anticipationMs+moveMs+2*actor.halfStepMs,start,goal,curveGuarantee:'Convex hull plus full actor clearance certified against fixed shell, all committed items and fixed foreground.'};
 }
 return null;
}
export function reachablePolyline(nav,start,goal){
 if(nav.segment(start,goal))return [start,goal];
 const path=nav.withEntry(start).routeTo(goal)?.points;if(!path)return null;
 const points=path.filter((p,i)=>!i||distance(p,path[i-1])>1e-6),out=[points[0]];let i=0;
 while(i<points.length-1){let j=points.length-1;while(j>i+1&&!nav.segment(points[i],points[j]))j--;out.push(points[j]);i=j;if(out.length>10)return null;}
 return out;
}

export const CONTINUOUS_DETOUR_LIMITS=Object.freeze({maxWaypoints:10,tangentVariants:3,hullSubdivisionDepth:6});
function splitControl(control){
 let level=control,left=[level[0]],right=[level.at(-1)];
 while(level.length>1){level=level.slice(1).map((p,i)=>({x:(p.x+level[i].x)/2,y:(p.y+level[i].y)/2}));left.push(level[0]);right.unshift(level.at(-1));}
 return [left,right];
}
/** Subdivision changes only the certificate, never the curve or its clearance.
 * Every accepted subcurve still lies inside its full-envelope-clear control hull. */
function clearCurve(control,nav,work,depth=0){
 work.hullChecks++;
 if(nav.clearControlHull(control))return true;
 if(depth===CONTINUOUS_DETOUR_LIMITS.hullSubdivisionDepth||!nav.passable(control[0])||!nav.passable(control.at(-1)))return false;
 return splitControl(control).every(part=>clearCurve(part,nav,work,depth+1));
}
/** A bounded connected detour with one gait/time law across all joins. Interior
 * quintics share a tangent and zero endpoint curvature; there is no corner stop,
 * pose reset, or per-segment anticipation/settle. Unsupported narrow turns retain
 * the planner's existing supported-waypoint fallback. */
export function continuousDetourTrajectory(actor,start,goal,nav){
 const points=reachablePolyline(nav,start.position,goal.position);
 if(!points||points.length>CONTINUOUS_DETOUR_LIMITS.maxWaypoints)return null;
 const work={waypoints:points.length,tangentVariants:0,curveAttempts:0,hullChecks:0};
 const certified={...nav,clearControlHull:control=>clearCurve(control,nav,work)};
 for(const weight of [1,2,.5]){
  work.tangentVariants++;
  const poses=[start];let rejected=false;
  for(let i=1;i<points.length-1;i++){
   const p=points[i],a=points[i-1],b=points[i+1],incoming=distance(a,p),outgoing=distance(p,b);
   const tangent={x:(p.x-a.x)/incoming+(b.x-p.x)/outgoing*weight,y:(p.y-a.y)/incoming+(b.y-p.y)/outgoing*weight};
   if(Math.hypot(tangent.x,tangent.y)<1e-6){rejected=true;break;}
   poses.push({position:p,heading:Math.atan2(tangent.y,tangent.x)});
  }
  if(rejected)continue;poses.push(goal);
  const segments=[];let length=0,maxCurvature=0;
  for(let i=1;i<poses.length;i++){
   work.curveAttempts++;
   const part=directContinuousTrajectory(actor,poses[i-1],poses[i],certified);
   if(!part){rejected=true;break;}
   segments.push(...part.segments.map(seg=>({...seg,offset:length+seg.offset})));
   length+=part.length;maxCurvature=Math.max(maxCurvature,part.maxCurvature);
  }
  if(rejected)continue;
  const moveMs=Math.max(2,Math.ceil(1.875*length/(actor.maxSpeedSourcePerSecond*actor.unitsPerSource)*1000/actor.halfStepMs))*actor.halfStepMs;
  return {ok:true,format:'yard-continuous-trajectory-request/v1',segments,length,maxCurvature,moveMs,anticipationMs:actor.anticipationMs,settleMs:2*actor.halfStepMs,totalMs:actor.anticipationMs+moveMs+2*actor.halfStepMs,start,goal,coarsePoints:points,planningWork:{...work},curveGuarantee:'Every subdivided Bezier control hull plus full actor clearance is certified against fixed shell, all committed items and fixed foreground.',numericLimit:'Arc length and curvature use 160 subdivisions per quintic; sampled kinematics and native visual acceptance remain separate checks.'};
 }
 return null;
}
