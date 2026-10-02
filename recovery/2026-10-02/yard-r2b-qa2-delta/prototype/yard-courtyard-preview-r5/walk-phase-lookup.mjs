/** Explicit source-pose table. Distances and sprite selection use the same row.
 * The base24 stride spacing remains the physical ramp/cadence reference.
 * Extra poses refine samples near a stop; they do not change the20Hz clock. */
export const WALK_PHASE_DENOMINATOR = 96;
export const WALK_PHASE_UNITS_96 = Object.freeze([0,1,2,...Array.from({length:23},(_,i)=>(i+1)*4),94,95]);
export const WALK_PHASES = Object.freeze(WALK_PHASE_UNITS_96.map(n=>n/WALK_PHASE_DENOMINATOR));
export const WALK_PHASE_REVISION = 'cardinal-28-explicit-phase-r5';
const UNIT_EPSILON = 1e-9; // .64/96 *epsilon world; only floating-point joins.

export function lookupWalkPhase(continuousCycles) {
  if(!Number.isFinite(continuousCycles))throw new TypeError('Finite walk cycle cursor required');
  let cycle=Math.floor(continuousCycles),units=(continuousCycles-cycle)*WALK_PHASE_DENOMINATOR;
  if(units>=WALK_PHASE_DENOMINATOR-UNIT_EPSILON){cycle++;units=0;}
  let lo=0,hi=WALK_PHASE_UNITS_96.length;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(WALK_PHASE_UNITS_96[mid]<=units+UNIT_EPSILON)lo=mid;else hi=mid;}
  const phase=WALK_PHASES[lo];
  return {frameIndex:lo,phase,cycle,sampledCycles:cycle+phase};
}
