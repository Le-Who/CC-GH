/** Inactive polygon-domain trajectory; existing continuous-curve algorithm reused with a separately versioned navigation adapter. */
import {add,sub,mul,unit,distance,direction,bounds} from './math.mjs';
import {makeNavigation} from './polygon-domain.mjs';
const EPS=1e-8;
export const smooth=u=>{u=Math.min(1,Math.max(0,u));return u*u*u*(10+u*(-15+6*u));};
export const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function evaluate(points,t){let a=points;while(a.length>1)a=a.slice(1).map((p,i)=>add(mul(a[i],1-t),mul(p,t)));return a[0];}
export function sampleSegment(seg,t){
 const n=seg.control.length-1,d1=seg.control.slice(1).map((p,i)=>mul(sub(p,seg.control[i]),n));
 const d2=d1.slice(1).map((p,i)=>mul(sub(p,d1[i]),n-1));
 return {point:evaluate(seg.control,t),tangent:evaluate(d1,t),second:d2.length?evaluate(d2,t):{x:0,y:0}};
}
function line(a,b){return {kind:'line',control:[a,b]};}
function simplify(points,nav){
 const unique=points.filter((p,i)=>!i||distance(p,points[i-1])>EPS),out=[unique[0]];let i=0;
 while(i<unique.length-1){let next=i+1;for(let j=unique.length-1;j>i;j--)if(nav.clearControlHull([unique[i],unique[j]])){next=j;break;}out.push(unique[next]);i=next;}
 return out;
}
function round(points,nav){
 const segs=[];let cursor=points[0];
 for(let i=1;i<points.length-1;i++){
  const p=points[i],prev=points[i-1],next=points[i+1],u=unit(sub(p,prev)),v=unit(sub(next,p));
  if(Math.abs(u.x*v.y-u.y*v.x)<1e-8&&u.x*v.x+u.y*v.y>0)continue;
  let accepted=null;
  for(const fraction of [.40,.30,.22,.15,.10]){
   const r=Math.min(distance(p,prev),distance(p,next))*fraction,A=sub(p,mul(u,r)),B=add(p,mul(v,r));
   // Collinear/equidistant first and last triples: zero curvature at each join.
   const controls=[A,add(A,mul(u,r*.35)),add(A,mul(u,r*.70)),sub(B,mul(v,r*.70)),sub(B,mul(v,r*.35)),B];
   if(nav.clearControlHull(controls)){accepted={kind:'quintic-corner',control:controls};break;}
  }
  if(!accepted)return {ok:false,code:'NO_CLEAR_CONTINUOUS_CORNER',corner:p};
  if(distance(cursor,accepted.control[0])>EPS)segs.push(line(cursor,accepted.control[0]));
  segs.push(accepted);cursor=accepted.control.at(-1);
 }
 if(distance(cursor,points.at(-1))>EPS)segs.push(line(cursor,points.at(-1)));
 if(!segs.length)return {ok:false,code:'ZERO_LENGTH_ROUTE'};
 if(segs.some(s=>!nav.clearControlHull(s.control)))return {ok:false,code:'SWEPT_ENVELOPE_OUTSIDE_LOCATION'};
 return {ok:true,segments:segs};
}
export function buildTrajectory({location,actor,start,goal}){
 const lead=actor.headingLeadSource*actor.unitsPerSource,entryLead=add(start.position,mul(direction(start.heading),lead));
 const targetLead=sub(goal.position,mul(direction(goal.heading),lead)),nav=makeNavigation(location,actor,entryLead);
 if(!nav.clearControlHull([start.position,entryLead])||!nav.clearControlHull([targetLead,goal.position]))return {ok:false,code:'HEADING_RUNWAY_BLOCKED'};
 const grid=nav.routeTo(targetLead);if(!grid)return {ok:false,code:'NO_R5_ROUTE'};
 const points=[start.position,...simplify(grid.points,nav),goal.position],rounded=round(points,nav);
 if(!rounded.ok)return rounded;
 const segments=rounded.segments;let length=0,maxCurvature=0;
 for(const seg of segments){seg.offset=length;seg.arc=[{t:0,length:0}];let last=sampleSegment(seg,0).point,total=0;
  const count=seg.kind==='line'?1:160;
  for(let i=1;i<=count;i++){const t=i/count,p=sampleSegment(seg,t);total+=distance(last,p.point);seg.arc.push({t,length:total});last=p.point;
   const d=p.tangent,dd=p.second,k=Math.abs(d.x*dd.y-d.y*dd.x)/Math.pow(Math.hypot(d.x,d.y),3);maxCurvature=Math.max(maxCurvature,k);}
  seg.length=total;length+=total;
 }
 const last=sampleSegment(segments.at(-1),1),first=sampleSegment(segments[0],0);
 if(Math.abs(angleDelta(Math.atan2(first.tangent.y,first.tangent.x),start.heading))>1e-7||Math.abs(angleDelta(Math.atan2(last.tangent.y,last.tangent.x),goal.heading))>1e-7)return {ok:false,code:'ENDPOINT_HEADING_MISMATCH'};
 if(maxCurvature>actor.maxPathCurvaturePerSource/actor.unitsPerSource)return {ok:false,code:'TURN_CURVATURE_EXCEEDS_CAPABILITY',maxCurvature,allowed:actor.maxPathCurvaturePerSource/actor.unitsPerSource};
 const moveMs=Math.ceil(1.875*length/(actor.maxSpeedSourcePerSecond*actor.unitsPerSource)*1000/actor.halfStepMs)*actor.halfStepMs;
 return {ok:true,format:'yard-continuous-trajectory-request/v1',segments,length,maxCurvature,moveMs,
  anticipationMs:actor.anticipationMs,settleMs:actor.halfStepMs*2,totalMs:actor.anticipationMs+moveMs+actor.halfStepMs*2,
  start,goal,clearance:nav.clearance,coarsePoints:points,sweptBoxes:segments.map(s=>bounds(s.control,nav.clearance)),
  curveGuarantee:'Each control hull plus full root-relative body/foot envelope lies in allowed flat ground. Bezier convex hull supplies continuous geometric clearance.',
  numericLimit:'Arc length uses 160 subdivisions per quintic segment. Curvature and kinematic checks are finite diagnostics, not mesh/IK/dynamics proof.'};
}
export function sampleTrajectory(route,timeMs){
 const u=Math.min(1,Math.max(0,(timeMs-route.anticipationMs)/route.moveMs)),s=smooth(u)*route.length;
 const seg=route.segments.find(x=>s<x.offset+x.length-1e-9)??route.segments.at(-1),local=Math.max(0,Math.min(seg.length,s-seg.offset));
 const b=seg.arc.find(x=>x.length>=local)??seg.arc.at(-1),i=seg.arc.indexOf(b),a=seg.arc[Math.max(0,i-1)];
 const t=b.length>a.length?a.t+(b.t-a.t)*(local-a.length)/(b.length-a.length):a.t,p=sampleSegment(seg,t);
 return {root:{...p.point,z:0},heading:Math.atan2(p.tangent.y,p.tangent.x),distance:s,moving:u>0&&u<1};
}
