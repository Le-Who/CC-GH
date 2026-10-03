/** Ground support belongs to measured soles, not to the pet's root point.
 * Clip each convex sole across the catalog's two-unit horizontal ground strips;
 * a concave mask step can lie between otherwise valid polygon vertices. */
import { getYardPlayzoneRows } from '../yard-playzones.js';
import { YARD_REMODELS } from '../yard-catalog.js';

const EPS=1e-8;
const masks=new Map();
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
