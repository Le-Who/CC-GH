/** Ground support belongs to measured soles, not to the pet's root point.
 * Clip each convex sole across the catalog's two-unit horizontal ground strips;
 * a concave mask step can lie between otherwise valid polygon vertices. */
import { getYardPlayzoneRows } from '../yard-playzones.js';
import { YARD_REMODELS } from '../yard-catalog.js';

const EPS=1e-8;
const masks=new Map();
// Source coverage is immutable, while origin/remodel/obstacles belong to each
// request. Compile only deeply frozen, finite polygons; mutable/test inputs
// retain the original per-polygon path. No account geometry is cached here.
const coverageBounds=new WeakMap();
const frozenArray=value=>Array.isArray(value)&&Object.isFrozen(value)&&Object.getPrototypeOf(value)===Array.prototype
  &&Reflect.ownKeys(value).length===value.length+1;
function frozenCoverageBounds(polygons) {
  if(!Object.isFrozen(polygons))return null;
  if(coverageBounds.has(polygons))return coverageBounds.get(polygons);
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,valid=frozenArray(polygons);
  const xs=new Set(),ys=new Set();
  for(let i=0;valid&&i<polygons.length;i++){
    const points=Object.getOwnPropertyDescriptor(polygons,i)?.value;
    if(!frozenArray(points)||points.length<3){valid=false;break;}
    for(let j=0;j<points.length;j++){
      const p=Object.getOwnPropertyDescriptor(points,j)?.value;
      const x=p&&Object.getOwnPropertyDescriptor(p,0)?.value,y=p&&Object.getOwnPropertyDescriptor(p,1)?.value;
      if(!Array.isArray(p)||!Object.isFrozen(p)||!Number.isFinite(x)||!Number.isFinite(y)){valid=false;break;}
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);xs.add(x);ys.add(y);
    }
    if(!valid)break;
  }
  const value=valid&&minX<maxX&&minY<maxY?{minX,minY,maxX,maxY,x:[...xs].sort((a,b)=>a-b),y:[...ys].sort((a,b)=>a-b),scaled:new Map()}:null;
  coverageBounds.set(polygons,value);return value;
}
// clipAxis deliberately retains its historical fuzzy membership/exact-bound
// intersection arithmetic. A source vertex in its EPS band can extrapolate a
// near-parallel edge beyond the source bound, so those cases must fall back.
function nearClipBoundary(bounds,axis,unitsPerWorld,origin,boundary) {
  let scaled=bounds.scaled.get(unitsPerWorld);
  if(!scaled){
    scaled={x:bounds.x.map(v=>v*unitsPerWorld),y:bounds.y.map(v=>v*unitsPerWorld)};
    if(bounds.scaled.size>=4)bounds.scaled.delete(bounds.scaled.keys().next().value);
    bounds.scaled.set(unitsPerWorld,scaled);
  }
  const values=scaled[axis];let lo=0,hi=values.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(origin+values[mid]<boundary-EPS)lo=mid+1;else hi=mid;}
  return lo<values.length&&origin+values[lo]<=boundary+EPS;
}
const maskFor=remodel=>{if(!masks.has(remodel))masks.set(remodel,getYardPlayzoneRows(remodel));return masks.get(remodel);};

function clipAxis(points,axis,bound,greater) {
  if(!points.length)return [];
  const output=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    const aIn=greater?a[axis]>=bound-EPS:a[axis]<=bound+EPS;
    const bIn=greater?b[axis]>=bound-EPS:b[axis]<=bound+EPS;
    if(aIn)output.push(a);
    if(aIn!==bIn){const q=(bound-a[axis])/(b[axis]-a[axis]);output.push([a[0]+(b[0]-a[0])*q,a[1]+(b[1]-a[1])*q]);}
  }
  return output;
}

export function solePolygonOnGround(points,remodel) {
  if(!Object.hasOwn(YARD_REMODELS,remodel)||!Array.isArray(points)||points.length<3||points.some(p=>!Array.isArray(p)||p.length<2||!p.slice(0,2).every(Number.isFinite)))return false;
  const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
  if(minY<0||maxY>100||points.some(p=>p[0]<0||p[0]>100))return false;
  const rows=maskFor(remodel);
  // The public source point contract uses round(y/2), so row r is centred on2r.
  for(let row=Math.max(0,Math.ceil((minY-1)/2));row<=Math.min(rows.length-1,Math.floor((maxY+1)/2));row++){
    const part=clipAxis(clipAxis(points,1,Math.max(0,row*2-1),true),1,Math.min(100,row*2+1),false);
    if(!part.length)continue;
    const lo=Math.min(...part.map(p=>p[0])),hi=Math.max(...part.map(p=>p[0]));
    if(!(rows[row]||[]).some(([a,b])=>lo>=a-EPS&&hi<=b+EPS))return false;
  }
  return true;
}

export function solePolygonOverlapsRect(points,rect) {
  let part=clipAxis(clipAxis(points,0,rect.x,true),0,rect.x+rect.width,false);
  part=clipAxis(clipAxis(part,1,rect.y,true),1,rect.y+rect.height,false);
  if(part.length<3)return false;
  const area=Math.abs(part.reduce((sum,a,i)=>{const b=part[(i+1)%part.length];return sum+a[0]*b[1]-b[0]*a[1];},0))*.5;
  return area>EPS;
}

export function groundCoverageAllowed(polygons,origin,remodel,{unitsPerWorld=8,obstacles=[]}={}) {
  if(!Array.isArray(polygons)||!polygons.length||![origin?.x,origin?.y,unitsPerWorld].every(Number.isFinite)||unitsPerWorld<=0)return false;
  const bounds=frozenCoverageBounds(polygons);
  if(bounds){
    const x0=origin.x+bounds.minX*unitsPerWorld,x1=origin.x+bounds.maxX*unitsPerWorld;
    const y0=origin.y+bounds.minY*unitsPerWorld,y1=origin.y+bounds.maxY*unitsPerWorld;
    // Accept only strict interior/separation, never an area-based tolerance.
    // Every crossed strip must contain the WHOLE bound in one allowed span.
    // Concavities, holes, touching edges and ambiguous gaps use exact clipping.
    if(Object.hasOwn(YARD_REMODELS,remodel)&&[x0,x1,y0,y1].every(Number.isFinite)
      &&x0>EPS&&x1<100-EPS&&y0>EPS&&y1<100-EPS
      &&obstacles.every(r=>[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0
        &&(x1<r.x-EPS||x0>r.x+r.width+EPS
          ||(y1<r.y-EPS||y0>r.y+r.height+EPS)
            &&!nearClipBoundary(bounds,'x',unitsPerWorld,origin.x,r.x)
            &&!nearClipBoundary(bounds,'x',unitsPerWorld,origin.x,r.x+r.width)))){
      const rows=maskFor(remodel);let interior=true;
      for(let row=Math.max(0,Math.ceil((y0-1-EPS)/2));row<=Math.min(rows.length-1,Math.floor((y1+1+EPS)/2));row++){
        if(!(rows[row]||[]).some(([a,b])=>x0>a+EPS&&x1<b-EPS)
          ||nearClipBoundary(bounds,'y',unitsPerWorld,origin.y,Math.max(0,row*2-1))
          ||nearClipBoundary(bounds,'y',unitsPerWorld,origin.y,Math.min(100,row*2+1))){interior=false;break;}
      }
      if(interior)return true;
    }
  }
  for(const raw of polygons){
    const points=(raw.polygon||raw.points||raw).map(p=>[origin.x+p[0]*unitsPerWorld,origin.y+p[1]*unitsPerWorld]);
    if(!solePolygonOnGround(points,remodel)||obstacles.some(r=>solePolygonOverlapsRect(points,r)))return false;
  }
  return true;
}

/** Convex Minkowski expansion by a tiny square covers measured rig drift. */
export function paddedConvexPolygon(points,padding=0) {
  if(!padding)return points.map(p=>p.slice(0,2));
  const cloud=points.flatMap(([x,y])=>[[-1,-1],[-1,1],[1,-1],[1,1]].map(([a,b])=>[x+a*padding,y+b*padding]));
  cloud.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const half=values=>{const out=[];for(const p of values){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out;};
  const lower=half(cloud),upper=half([...cloud].reverse());lower.pop();upper.pop();return lower.concat(upper);
}
