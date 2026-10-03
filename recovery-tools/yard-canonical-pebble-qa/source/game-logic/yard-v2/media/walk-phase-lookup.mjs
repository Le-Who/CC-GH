/** Explicit source-pose table. Distances and sprite selection use the same row.
 * The base24 stride spacing remains the physical ramp/cadence reference.
 * Extra poses refine samples near a stop; they do not change the20Hz clock. */
import { MIKA_ACTOR_PROFILE } from '../actor-profiles.mjs';
export const WALK_PHASE_DENOMINATOR = MIKA_ACTOR_PROFILE.locomotion.phaseDenominator;
export const WALK_PHASE_UNITS_96 = MIKA_ACTOR_PROFILE.locomotion.phaseUnits;
export const WALK_PHASES = MIKA_ACTOR_PROFILE.locomotion.phaseSamples;
export const WALK_PHASE_REVISION = MIKA_ACTOR_PROFILE.locomotion.revision;
const UNIT_EPSILON = 1e-9; // .64/96 *epsilon world; only floating-point joins.

export function lookupWalkPhase(continuousCycles,{locomotion=MIKA_ACTOR_PROFILE.locomotion}={}) {
  if(!Number.isFinite(continuousCycles))throw new TypeError('Finite walk cycle cursor required');
  const {phaseDenominator,phaseUnits,phaseSamples}=locomotion||{};
  if(!Number.isSafeInteger(phaseDenominator)||phaseDenominator<=0||!Array.isArray(phaseUnits)||!phaseUnits.length
    ||phaseUnits[0]!==0||!Array.isArray(phaseSamples)||phaseSamples.length!==phaseUnits.length
    ||phaseUnits.some((n,i)=>!Number.isInteger(n)||n<0||n>=phaseDenominator||(i&&n<=phaseUnits[i-1])||phaseSamples[i]!==n/phaseDenominator))
    throw new TypeError('Explicit ordered actor phase table required');
  let cycle=Math.floor(continuousCycles),units=(continuousCycles-cycle)*phaseDenominator;
  if(units>=phaseDenominator-UNIT_EPSILON){cycle++;units=0;}
  let lo=0,hi=phaseUnits.length;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(phaseUnits[mid]<=units+UNIT_EPSILON)lo=mid;else hi=mid;}
  const phase=phaseSamples[lo];
  return {frameIndex:lo,phase,cycle,sampledCycles:cycle+phase};
}
