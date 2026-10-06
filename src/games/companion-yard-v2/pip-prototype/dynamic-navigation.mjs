/** Bounded canonical navigation. No fixture obstacles, saved economic visits or XY remapping. */
import {inside,pointSegmentDistance,segmentDistance} from './motion/polygon-domain.mjs';
const EPS=1e-8;
const xy=p=>Array.isArray(p)?{x:p[0],y:p[1]}:{x:p.x,y:p.y};
const edges=p=>p.map((a,i)=>[a,p[(i+1)%p.length]]);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
export function convexHull(points){
 const p=points.map(xy).sort((a,b)=>a.x-b.x||a.y-b.y),lo=[],hi=[];
 for(const v of p){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),v)<=EPS)lo.pop();lo.push(v);}
 for(const v of [...p].reverse()){while(hi.length>1&&cross(hi.at(-2),hi.at(-1),v)<=EPS)hi.pop();hi.push(v);}
 return lo.slice(0,-1).concat(hi.slice(0,-1));
}
function overlap(a,b){return a.some(p=>inside(p,b))||b.some(p=>inside(p,a))||edges(a).some(e=>edges(b).some(f=>segmentDistance(...e,...f)<EPS));}
function distanceToHull(p,h){return h.length===1?distance(p,h[0]):Math.min(...edges(h).map(e=>pointSegmentDistance(p,...e)));}
const validPolygon=p=>Array.isArray(p)&&p.length>=3&&p.length<=128&&p.every(v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite));
export function actorClearance(actor){return (Math.max(Math.hypot(actor.bodyHalfExtentsSource.x,actor.bodyHalfExtentsSource.y),actor.maxFootReachSource+Math.hypot(actor.soleHalfExtentsSource.x,actor.soleHalfExtentsSource.y))+(actor.routingMarginSource??0))*actor.unitsPerSource;}
function foreground(geometry,actor){
 const {camera:c,art,canonicalPerSceneUnit:u,foregroundExclusions}=geometry.composition;
 const scale=c.pixelsPerSceneUnitCss/u,r=actor.unitsPerSource,h=1.5*r;
 const project=(p,z=0)=>({x:c.projectionOriginCss[0]+((p.x-c.projectionOriginCanonical[0])*c.right[0]+(p.y-c.projectionOriginCanonical[1])*c.right[1]+z*c.right[2])*scale,y:c.projectionOriginCss[1]+((p.x-c.projectionOriginCanonical[0])*c.down[0]+(p.y-c.projectionOriginCanonical[1])*c.down[1]+z*c.down[2])*scale});
 const offsets=[];for(const x of [-r,r])for(const y of [-r,r])for(const z of [0,h])offsets.push({x:(x*c.right[0]+y*c.right[1]+z*c.right[2])*scale,y:(x*c.down[0]+y*c.down[1]+z*c.down[2])*scale});
 const minX=Math.min(...offsets.map(p=>p.x)),maxX=Math.max(...offsets.map(p=>p.x)),minY=Math.min(...offsets.map(p=>p.y)),maxY=Math.max(...offsets.map(p=>p.y));
 const forbidden=foregroundExclusions.map(row=>{const p=row.sourceScreenCss;return [{x:Math.min(...p.map(v=>v[0]))-maxX,y:Math.min(...p.map(v=>v[1]))-maxY},{x:Math.max(...p.map(v=>v[0]))-minX,y:Math.min(...p.map(v=>v[1]))-maxY},{x:Math.max(...p.map(v=>v[0]))-minX,y:Math.max(...p.map(v=>v[1]))-minY},{x:Math.min(...p.map(v=>v[0]))-maxX,y:Math.max(...p.map(v=>v[1]))-minY}];});
 const point=p=>{const q=project(p);return q.x+minX>=-EPS&&q.x+maxX<=art.width+EPS&&q.y+minY>=-EPS&&q.y+maxY<=art.height+EPS&&!forbidden.some(f=>inside(q,f));};
 const hull=points=>points.every(point)&&!forbidden.some(f=>overlap(points.map(p=>project(p)),f));
 return {point,hull};
}
export function canonicalLayoutKey(geometry,rows){
 return JSON.stringify([geometry.domain,geometry.ground,geometry.exclusions,geometry.composition,[...rows].sort((a,b)=>a.slotId.localeCompare(b.slotId)).map(r=>[r.slotId,r.goodieId,r.locationId,r.locationVersion,r.geometryRevision,r.itemGeometryRevision,r.x,r.y])]);
}
export function createCanonicalNavigation({geometry,rows,actor,itemRadius=4.65,maxRows=8,composition=true}){
 if(geometry.domain?.min?.join()!=='0,0'||geometry.domain?.max?.join()!=='200,220'||geometry.groundZ!==0||!validPolygon(geometry.ground)||!Array.isArray(rows)||rows.length>maxRows)throw Error('INVALID_CANONICAL_NAVIGATION_INPUT');
 const ids=new Set();for(const r of rows){if(!r||typeof r.slotId!=='string'||ids.has(r.slotId)||r.goodieId!=='leaf_pot'||r.itemGeometryRevision!=='yard-succulent-T2'||r.locationId!=='pip-garden'||r.locationVersion!==1||r.geometryRevision!=='pip-garden-t2-r1'||![r.x,r.y].every(Number.isFinite))throw Error('UNREGISTERED_CANONICAL_OBSTACLE');ids.add(r.slotId);}
 const ground=geometry.ground.map(xy),obstacles=(geometry.exclusions??[]).map(r=>{if(!validPolygon(r.polygon))throw Error('INVALID_FIXED_SHELL');return r.polygon.map(xy);});
 // Circumscription conservatively covers the measured round T2 envelope.
 for(const r of rows){const radius=itemRadius/Math.cos(Math.PI/24);obstacles.push(Array.from({length:24},(_,i)=>({x:r.x+radius*Math.cos(i*Math.PI/12),y:r.y+radius*Math.sin(i*Math.PI/12)})));}
 const boundary=[ground,...obstacles].flatMap(edges),clearance=actorClearance(actor),visual=composition?foreground(geometry,actor):{point:()=>true,hull:()=>true};
 const passable=p=>inside(p,ground)&&!obstacles.some(o=>inside(p,o))&&boundary.every(e=>pointSegmentDistance(p,...e)>=clearance-EPS)&&visual.point(p);
 const segment=(a,b)=>passable(a)&&passable(b)&&boundary.every(e=>segmentDistance(a,b,...e)>=clearance-EPS)&&visual.hull([a,b]);
 function clearPolygon(poly){const h=poly.map(xy);return h.every(p=>inside(p,ground))&&!edges(h).some(e=>edges(ground).some(f=>segmentDistance(...e,...f)<EPS))&&!ground.some(p=>inside(p,h))&&!obstacles.some(o=>overlap(h,o));}
 function clearControlHull(points){const h=convexHull(points);if(!h.length)return false;if(h.length===1)return passable(h[0]);return h.every(passable)&&!obstacles.some(o=>o.some(p=>inside(p,h)))&&boundary.every(e=>edges(h).every(f=>segmentDistance(...e,...f)>=clearance-EPS))&&visual.hull(h);}
 let cells=null;
 function withEntry(entry){
  if(!cells){cells=new Map();for(let y=0;y<=220;y+=2)for(let x=0;x<=200;x+=2){const p={x,y};if(passable(p))cells.set(`${x},${y}`,p);}}
  const nearest=p=>[...cells].filter(([,q])=>distance(p,q)<=3&&segment(p,q)).sort((a,b)=>distance(p,a[1])-distance(p,b[1])||a[0].localeCompare(b[0]))[0]?.[0];
  const start=nearest(entry),parents=new Map(),queue=[];if(start){parents.set(start,null);queue.push(start);}
  for(let i=0;i<queue.length;i++){const k=queue[i],p=cells.get(k);for(const [dx,dy] of [[0,-2],[-2,0],[2,0],[0,2],[-2,-2],[2,-2],[-2,2],[2,2]]){const key=`${p.x+dx},${p.y+dy}`,q=cells.get(key);if(q&&!parents.has(key)&&segment(p,q)){parents.set(key,k);queue.push(key);}}}
  return {...api,entryReachable:!!start,reachableCells:parents.size,routeTo(target){const end=nearest(target);if(!end||!parents.has(end))return null;const points=[target];let k=end;while(k!==null){points.push(cells.get(k));k=parents.get(k);}points.push(entry);points.reverse();return {points};}};
 }
 const api={passable,segment,clearance,clearPolygon,clearControlHull,withEntry,visualPoint:visual.point,visualHull:visual.hull,clearBox:r=>clearPolygon([{x:r.x,y:r.y},{x:r.x+r.width,y:r.y},{x:r.x+r.width,y:r.y+r.height},{x:r.x,y:r.y+r.height}]),rows:structuredClone(rows),layoutKey:canonicalLayoutKey(geometry,rows)};return api;
}
