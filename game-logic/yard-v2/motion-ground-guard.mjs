import footprintContract from './media/ground-footprints.json' with {type:'json'};
import { groundCoverageAllowed,paddedConvexPolygon } from './ground-coverage.mjs';
import { STRIDE_WORLD } from './media/stride-routes.mjs';
import { footprint } from './geometry.mjs';

const direction={0:[1,0],2:[0,1],4:[-1,0],6:[0,-1]};
const compiled=new Map();
function coverage(kind,key){
  const id=`${kind}:${key}`;
  if(compiled.has(id))return compiled.get(id);
  const source=footprintContract[kind]?.[key];
  const value=source?.validated?source.footprints.map(f=>paddedConvexPolygon(f.polygon,footprintContract.derivation.requiredPaddingWorld)):null;
  compiled.set(id,value);return value;
}
export const MIKA_GROUND_FOOTPRINT_REVISION='mika-ground-footprints/v1:b8ea668b73ae90441442af4d4bfe90115d01b4d694add7f0b2e26c690802dcc6';

/** Exact rendered support coverage supplements, never reduces, the coarse root gate.
 * The obstacle rectangles and full-body turn checks remain separate constraints. */
export function createMotionGroundGuard(yard,{scene,unitsPerWorld=8}={}) {
  const obstacles=yard.placedGoodies.map(p=>footprint(p,scene)).filter(Boolean).concat(scene.exclusions||[]);
  const allowed=(kind,key,origin)=>{
    const polygons=coverage(kind,key);
    return !!polygons&&groundCoverageAllowed(polygons,origin,yard.remodel,{unitsPerWorld,obstacles});
  };
  return {
    walkSegment(a,b,facing,phaseStart=0){
      if(![a?.x,a?.y,b?.x,b?.y,unitsPerWorld].every(Number.isFinite)||unitsPerWorld<=0)return false;
      const d=direction[facing];if(!d||![0,.5].includes(phaseStart))return false;
      const length=(b.x-a.x)*d[0]+(b.y-a.y)*d[1],side=(b.x-a.x)*d[1]-(b.y-a.y)*d[0];
      if(length<0||Math.abs(side)>1e-7)return false;
      if(length<1e-8)return phaseStart===0;
      const stride=STRIDE_WORLD*unitsPerWorld,partial=phaseStart===.5?stride/2:0;
      const count=Math.round((length-partial)/stride);
      if(count<0||Math.abs(length-partial-count*stride)>1e-6)return false;
      if(partial&&!allowed('runways',facing,a))return false;
      for(let i=0;i<count;i++){
        const offset=partial+i*stride;
        if(!allowed('walk',facing,{x:a.x+d[0]*offset,y:a.y+d[1]*offset}))return false;
      }
      return true;
    },
    canTurn(position,fromFacing,sign,steps){return allowed('turns',`${fromFacing}:${sign}:${steps}`,position);},
  };
}
