export const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y});
export const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
export const mul=(a,k)=>({x:a.x*k,y:a.y*k});
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const unit=a=>mul(a,1/Math.hypot(a.x,a.y));
export const direction=angle=>({x:Math.cos(angle),y:Math.sin(angle)});
export function transform(point,placement){const c=Math.cos(placement.yaw),s=Math.sin(placement.yaw);return {x:placement.x+c*point.x-s*point.y,y:placement.y+s*point.x+c*point.y,z:(placement.groundZ??0)+(point.z??0)};}
export function corners(r){return [{x:r.x,y:r.y},{x:r.x+r.width,y:r.y},{x:r.x+r.width,y:r.y+r.height},{x:r.x,y:r.y+r.height}];}
export function bounds(points,pad=0){const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return {x:Math.min(...xs)-pad,y:Math.min(...ys)-pad,width:Math.max(...xs)-Math.min(...xs)+2*pad,height:Math.max(...ys)-Math.min(...ys)+2*pad};}
