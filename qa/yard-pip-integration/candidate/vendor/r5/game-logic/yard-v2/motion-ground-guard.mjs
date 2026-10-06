import { MIKA_ACTOR_ASSETS } from './media/mika-actor-assets.mjs';
import { MIKA_ACTOR_PROFILE } from './actor-profiles.mjs';
import { groundCoverageAllowed,paddedConvexPolygon } from './ground-coverage.mjs';
import { footprint } from './geometry.mjs';

const direction={0:[1,0],2:[0,1],4:[-1,0],6:[0,-1]};
const compiled=new WeakMap();
function coverage(contract,namespace,kind,key){
  if(!contract||typeof contract!=='object')return null;
  let cache=compiled.get(contract);if(!cache){cache=new Map();compiled.set(contract,cache);}
  const id=`${namespace}:${kind}:${key}`;
  if(cache.has(id))return cache.get(id);
  const source=contract[kind]?.[key];
  const value=contract.validated===true&&source?.validated?source.footprints.map(f=>paddedConvexPolygon(f.polygon,contract.derivation.requiredPaddingWorld)):null;
  // Bounded across immutable actor/calibration revisions, not account layouts.
  if(cache.size>=256)cache.delete(cache.keys().next().value);
  cache.set(id,value);return value;
}
export const MIKA_GROUND_FOOTPRINT_REVISION=MIKA_ACTOR_PROFILE.ground.revision;

/** Exact rendered support coverage supplements, never reduces, the coarse root gate.
 * The obstacle rectangles and full-body turn checks remain separate constraints. */
export function createMotionGroundGuard(yard,{scene,actorProfile=MIKA_ACTOR_PROFILE,
  groundFootprints=MIKA_ACTOR_ASSETS.groundFootprints,calibrationHash='',unitsPerWorld=actorProfile.unitsPerWorld}={}) {
  const compatible=groundFootprints?.revision===actorProfile.ground.revision;
  const namespace=JSON.stringify([actorProfile.id,actorProfile.revision,actorProfile.ground.revision,calibrationHash]);
  const obstacles=yard.placedGoodies.map(p=>footprint(p,scene)).filter(Boolean).concat(scene.exclusions||[]);
  const allowed=(kind,key,origin)=>{
    const polygons=compatible?coverage(groundFootprints.contract,namespace,kind,key):null;
    return !!polygons&&groundCoverageAllowed(polygons,origin,yard.remodel,{unitsPerWorld,obstacles});
  };
  return {
    walkSegment(a,b,facing,phaseStart=0){
      if(![a?.x,a?.y,b?.x,b?.y,unitsPerWorld].every(Number.isFinite)||unitsPerWorld<=0)return false;
      const d=direction[facing];if(!compatible||!d||!actorProfile.locomotion.facings.includes(facing)||!actorProfile.ground.phaseStarts.includes(phaseStart))return false;
      const stride=actorProfile.locomotion.strideWorld*unitsPerWorld;
      if(!Number.isFinite(stride)||stride<=0||!Number.isFinite(phaseStart)||phaseStart<0||phaseStart>=1)return false;
      const length=(b.x-a.x)*d[0]+(b.y-a.y)*d[1],side=(b.x-a.x)*d[1]-(b.y-a.y)*d[0];
      if(length<0||Math.abs(side)>1e-7)return false;
      if(length<1e-8)return phaseStart===0;
      const partial=phaseStart===0?0:stride*(1-phaseStart);
      const count=Math.round((length-partial)/stride);
      if(count<0||Math.abs(length-partial-count*stride)>1e-6)return false;
      // Existing Mika data uses facing keys for its sole phase.5 runway. Additional
      // profiles must provide a phase-keyed table for any other partial join.
      if(partial&&!allowed('runways',phaseStart===.5?facing:`${facing}:${phaseStart}`,a))return false;
      for(let i=0;i<count;i++){
        const offset=partial+i*stride;
        if(!allowed('walk',facing,{x:a.x+d[0]*offset,y:a.y+d[1]*offset}))return false;
      }
      return true;
    },
    canTurn(position,fromFacing,sign,steps){const key=`${fromFacing}:${sign}:${steps}`;return actorProfile.turns.variants.includes(key)&&allowed('turns',key,position);},
  };
}
