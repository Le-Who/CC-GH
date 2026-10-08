import {createMikaLocomotionRoute} from './mika-locomotion.mjs';
/** Four-second cruise diagnostics only. No arrivals, collisions or replans. */
export function createMikaPreviewRoute(variant,calibration) {
  if(variant==='p2'||variant==='mirror')return {kind:'accepted-p2-reference',mirror:variant==='mirror'};
  if(variant==='straight')return createMikaLocomotionRoute(t=>({position:[.74*t*Math.cos(-.65),.74*t*Math.sin(-.65),0],heading:-.65}),calibration);
  if(variant!=='alternate')throw Error('UNKNOWN_MIKA_PREVIEW_ROUTE');
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(x*(x*6-15)+10);};
  const heading=t=>-.35+Math.PI/3*smooth((t-.55)/2.85),positions=[[0,0,0]];
  for(let i=1;i<=8000;i++) {
    const before=heading(-2+(i-1)*.001),after=heading(-2+i*.001),last=positions[i-1];
    positions.push([last[0]+.74*.0005*(Math.cos(before)+Math.cos(after)),last[1]+.74*.0005*(Math.sin(before)+Math.sin(after)),0]);
  }
  const zero=positions[2000];
  return createMikaLocomotionRoute(t=>{
    const index=Math.max(0,Math.min(7999,Math.floor((t+2)*1000))),u=Math.max(0,Math.min(1,(t+2)*1000-index));
    return {position:positions[index].map((v,j)=>v+(positions[index+1][j]-v)*u-zero[j]),heading:heading(t)};
  },calibration);
}
