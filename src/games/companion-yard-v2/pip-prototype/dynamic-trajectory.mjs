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
