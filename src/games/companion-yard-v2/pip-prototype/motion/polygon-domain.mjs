/** New inactive polygon-domain adapter. Historical R5 0..100 geometry is untouched. */
export const VERSION='yard-polygon-domain/experimental-v1';
const EPS=1e-9;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const xy=p=>Array.isArray(p)?{x:p[0],y:p[1]}:p;
const edges=poly=>poly.map((p,i)=>[p,poly[(i+1)%poly.length]]);
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
export function pointSegmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy,u=den?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/den)):0;return Math.hypot(p.x-a.x-u*dx,p.y-a.y-u*dy);}
export function inside(p,poly){let yes=false;for(const[a,b]of edges(poly)){if(pointSegmentDistance(p,a,b)<EPS)return true;if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;}
export function segmentDistance(a,b,c,d){
 const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
 if(abC*abD<0&&cdA*cdB<0)return 0;
 return Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b));
}
function validatePolygon(p){if(Array.isArray(p)){const e=edges(p);for(let i=0;i<e.length;i++)for(let j=i+1;j<e.length;j++)if(j!==i+1&&!(i===0&&j===e.length-1)&&segmentDistance(...e[i],...e[j])<EPS)return false;}return Array.isArray(p)&&p.length>=3&&p.length<=128&&p.every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y))&&Math.abs(p.reduce((s,v,i)=>s+v.x*p[(i+1)%p.length].y-v.y*p[(i+1)%p.length].x,0))>EPS;}
function polygonOverlap(a,b){return a.some(p=>inside(p,b))||b.some(p=>inside(p,a))||edges(a).some(([p,q])=>edges(b).some(([r,s])=>segmentDistance(p,q,r,s)<EPS));}
export function makeNavigation(location,actor,entry){
 if(location.format!==VERSION||location.runtimeActivated!==false||location.groundZ!==0||location.surface!=='flat-ground-only'||location.historicalRemodel!==null)throw Error('EXPLICIT_INACTIVE_POLYGON_LOCATION_REQUIRED');
 const domain=location.domain;if(!domain||domain.min[0]!==0||domain.min[1]!==0||domain.max[0]!==200||domain.max[1]!==220)throw Error('BOUNDED_200_BY_220_DOMAIN_REQUIRED');
 const ground=location.ground.map(xy),obstacles=location.obstacles.map(p=>p.polygon.map(xy));
 if(!validatePolygon(ground)||obstacles.length>32||!obstacles.every(validatePolygon)||ground.some(p=>p.x<0||p.y<0||p.x>200||p.y>220))throw Error('INVALID_BOUNDED_POLYGONS');
 const clearance=(Math.max(Math.hypot(actor.bodyHalfExtentsSource.x,actor.bodyHalfExtentsSource.y),actor.maxFootReachSource+Math.hypot(actor.soleHalfExtentsSource.x,actor.soleHalfExtentsSource.y))+(actor.routingMarginSource??0))*actor.unitsPerSource;
 if(!Number.isFinite(clearance)||clearance<=0||!Number.isFinite(actor.unitsPerSource)||actor.unitsPerSource<=0)throw Error('POSITIVE_FINITE_ACTOR_SCALE_REQUIRED');
 const boundary=[ground,...obstacles].flatMap(edges),passable=p=>[p.x,p.y].every(Number.isFinite)&&inside(p,ground)&&!obstacles.some(q=>inside(p,q))&&boundary.every(([a,b])=>pointSegmentDistance(p,a,b)>=clearance-EPS);
 const segment=(a,b)=>passable(a)&&passable(b)&&boundary.every(([c,d])=>segmentDistance(a,b,c,d)>=clearance-EPS);
 const grid=2,key=(x,y)=>`${x},${y}`,allowed=new Map();for(let y=0;y<=220;y+=grid)for(let x=0;x<=200;x+=grid){const p={x,y};if(passable(p))allowed.set(key(x,y),p);}
 const nearest=(p,ids)=>[...ids].map(k=>({k,p:allowed.get(k)})).filter(x=>distance(p,x.p)<=grid*1.5&&segment(p,x.p)).sort((a,b)=>distance(p,a.p)-distance(p,b.p)||a.k.localeCompare(b.k))[0]?.k;
 const start=nearest(entry,allowed.keys()),parents=new Map(),queue=[];if(start){parents.set(start,null);queue.push(start);}
 for(let i=0;i<queue.length;i++){const k=queue[i],p=allowed.get(k);for(const[dx,dy]of[[0,-2],[-2,0],[2,0],[0,2]]){const next=key(p.x+dx,p.y+dy),q=allowed.get(next);if(q&&!parents.has(next)&&segment(p,q)){parents.set(next,k);queue.push(next);}}}
 function clearBox(r){if(![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.width<=0||r.height<=0)return false;const rectangle=[{x:r.x,y:r.y},{x:r.x+r.width,y:r.y},{x:r.x+r.width,y:r.y+r.height},{x:r.x,y:r.y+r.height}];
  if(!rectangle.every(p=>inside(p,ground)))return false;
  // Polygon edges cannot enter the interior of a rectangle whose corners are inside a concave ground polygon.
  const inner=p=>p.x>r.x+EPS&&p.x<r.x+r.width-EPS&&p.y>r.y+EPS&&p.y<r.y+r.height-EPS;
  if(ground.some(inner)||edges(rectangle).some(([a,b])=>edges(ground).some(([c,d])=>segmentDistance(a,b,c,d)<EPS)))return false;
  return !obstacles.some(p=>polygonOverlap(rectangle,p));
 }
 return {version:VERSION,runtimeActivated:false,passable,segment,clearance,clearBox,clearControlHull(points){const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return clearBox({x:Math.min(...xs)-clearance,y:Math.min(...ys)-clearance,width:Math.max(...xs)-Math.min(...xs)+2*clearance,height:Math.max(...ys)-Math.min(...ys)+2*clearance});},
  entryReachable:!!start,reachableCells:parents.size,routeTo(target){const end=nearest(target,parents.keys());if(!end)return null;const points=[target];let k=end;while(k!==null){points.push(allowed.get(k));k=parents.get(k);}points.push(entry);points.reverse();return{points,length:points.slice(1).reduce((s,p,i)=>s+distance(points[i],p),0)};}};
}
