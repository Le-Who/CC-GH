/** Match full opacity at the clip handoff even when the final exit is short. */
export function edgeOpacity(route,phase,groundDistance){
 const length=route.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-route[i].x,p.y-route[i].y),0);
 const distance=phase==='approach'?groundDistance:length-groundDistance;
 return Math.max(0,Math.min(1,distance/Math.max(1e-9,Math.min(6,length))));
}
