/** An opt-in sampling primitive for authored, non-uniform root motion.
 * It grants no actor/binding readiness and is not wired into Mika's route clock.
 * Pose and displayed root always come from the SAME source row. The dense root
 * cursor is diagnostic only: placing a stepped pose there would slide its feet.
 * Small signed anticipation/settle motion is preserved; distance is never
 * inverted to guess time, or clamped to [0,stride] inside a cycle. */
import {clone,deepFreeze} from '../util.mjs';

const near=(a,b)=>Math.abs(a-b)<=1e-6;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
function ordered(rows,key) {
  return Array.isArray(rows)&&rows.length>=2&&rows.every((row,i)=>row&&finite(row[key])
    &&(i===0||row[key]>rows[i-1][key]));
}
function leftRow(rows,time,key) {
  let lo=0,hi=rows.length;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(rows[mid][key]<=time)lo=mid;else hi=mid;}
  return lo;
}

export function createAuthoredStrideSampler(input) {
  const c=clone(input),fail=()=>{throw new TypeError('Explicit coherent authored stride contract required');};
  if(!c||c.format!=='yard-authored-stride/v1'||typeof c.id!=='string'||!c.id
    ||!Number.isSafeInteger(c.durationMs)||c.durationMs<=0||!finite(c.strideWorld)||c.strideWorld<=0
    ||!ordered(c.frames,'atMs')||!ordered(c.rootSamples,'atMs'))fail();
  if(c.frames[0].atMs!==0||c.rootSamples[0].atMs!==0
    ||c.frames.at(-1).atMs!==c.durationMs||c.rootSamples.at(-1).atMs!==c.durationMs
    ||!near(c.frames[0].distanceWorld,0)||!near(c.frames.at(-1).distanceWorld,c.strideWorld)
    ||!near(c.rootSamples[0].distanceWorld,0)||!near(c.rootSamples.at(-1).distanceWorld,c.strideWorld))fail();
  if(c.frames.some((row,i)=>!Number.isSafeInteger(row.atMs)||!Number.isSafeInteger(row.frameIndex)
    ||row.frameIndex!==i||!finite(row.distanceWorld))||c.rootSamples.some(row=>!finite(row.distanceWorld)))fail();
  if(!Array.isArray(c.rootExtentWorld)||c.rootExtentWorld.length!==2||!c.rootExtentWorld.every(finite)
    ||c.rootExtentWorld[0]>0||c.rootExtentWorld[1]<c.strideWorld
    ||c.rootSamples.some(row=>row.distanceWorld<c.rootExtentWorld[0]-1e-8||row.distanceWorld>c.rootExtentWorld[1]+1e-8)
    ||c.frames.some(row=>row.distanceWorld<c.rootExtentWorld[0]-1e-8||row.distanceWorld>c.rootExtentWorld[1]+1e-8))fail();
  const denseAt=time=>{
    const i=leftRow(c.rootSamples,time,'atMs'),a=c.rootSamples[i],b=c.rootSamples[i+1];
    return b?a.distanceWorld+(b.distanceWorld-a.distanceWorld)*(time-a.atMs)/(b.atMs-a.atMs):a.distanceWorld;
  };
  if(c.frames.some(row=>!near(denseAt(row.atMs),row.distanceWorld)))fail();
  deepFreeze(c);
  return Object.freeze({contract:c,
    sample(elapsedMs,{cycles=1}={}) {
      if(!finite(elapsedMs)||!Number.isSafeInteger(cycles)||cycles<1
        ||!Number.isSafeInteger(cycles*c.durationMs))throw new TypeError('Finite authored stride time and safe cycle count required');
      const total=cycles*c.durationMs,t=Math.max(0,Math.min(total,elapsedMs));
      const cycle=Math.min(cycles,Math.floor(t/c.durationMs)),local=t===total?0:t-cycle*c.durationMs;
      const row=c.frames[leftRow(c.frames,local,'atMs')],offset=cycle*c.strideWorld;
      return {cycle,frameIndex:row.frameIndex,phase:row.atMs/c.durationMs,
        sampledTimeMs:cycle*c.durationMs+row.atMs,
        distanceWorld:offset+row.distanceWorld,
        continuousDistanceWorld:offset+denseAt(local),
        complete:t===total};
    },
  });
}
