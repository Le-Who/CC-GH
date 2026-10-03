/** Small immutable motion contracts. Asset bytes and economic rules are separate.
 * A profile reference is not permission to admit or render an unvalidated actor. */
import { deepFreeze } from './util.mjs';

export const MIKA_ACTOR_REFERENCE = Object.freeze({ id:'mika', revision:'mika-actor/r1' });
const phaseUnits = [0,1,2,...Array.from({length:23},(_,i)=>(i+1)*4),94,95];
export const MIKA_ACTOR_PROFILE = deepFreeze({
  ...MIKA_ACTOR_REFERENCE, visitorId:'mika_cat', playbackReady:true,
  unitsPerWorld:8, sourceSampleMs:50,
  locomotion:{ revision:'cardinal-28-explicit-phase-r5', strideWorld:.64, cycleMs:1200,
    phaseDenominator:96, phaseUnits, phaseSamples:phaseUnits.map(n=>n/96),
    facings:[0,2,4,6], canonicalPhase:0, rampDistanceQuanta:2, rampReferenceSamples:24,
    turnRoutePreferenceMs:600 },
  turns:{ durations:{2:2800,4:4400}, entryPhase:0, exitPhase:0,
    variants:[0,2,4,6].flatMap(f=>[`${f}:-1:2`,`${f}:1:2`,`${f}:1:4`]) },
  ground:{ revision:'mika-ground-footprints/v1:b8ea668b73ae90441442af4d4bfe90115d01b4d694add7f0b2e26c690802dcc6',
    phaseStarts:[0,.5] },
  interactions:{
    'mika-mouse-r1':{goodieId:'yarn_mouse',restMode:'separate-ground',restClipId:'mika-ground-rest-r1'},
    'mika-mouse-settled-r1':{goodieId:'yarn_mouse',restMode:'separate-ground',restClipId:'mika-ground-rest-r1'},
    'mika-cushion-r1':{goodieId:'sun_cushion',restMode:'on-prop',restClipId:'mika-cushion-r1',
      loop:{startMs:9500,endMs:10700,fps:20,frames:24}},
  },
});
export const ACTOR_PROFILES = Object.freeze({mika:MIKA_ACTOR_PROFILE});
const own=(o,k)=>Object.hasOwn(o||{},k);
const reference=ref=>ref&&typeof ref==='object'&&!Array.isArray(ref)
  &&typeof ref.id==='string'&&!!ref.id&&typeof ref.revision==='string'&&!!ref.revision;
export const actorProfileReference=profile=>({id:profile.id,revision:profile.revision});
export function getBindingCalibrationHash(binding,registry) {
  const value=own(binding,'calibrationHash')?binding.calibrationHash:registry?.calibrationHash;
  return typeof value==='string'&&value.length>0?value:null;
}
export function resolveActorProfile(ref,profiles=ACTOR_PROFILES) {
  if(!reference(ref)||!own(profiles,ref.id))return null;
  const profile=profiles[ref.id];
  return profile?.id===ref.id&&profile.revision===ref.revision&&profile.playbackReady===true?profile:null;
}
function knownMikaReference(binding) {
  const expected={'mika-mouse-r1':'yarn_mouse','mika-cushion-r1':'sun_cushion'};
  return binding?.visitorId==='mika_cat'&&own(expected,binding.id)&&expected[binding.id]===binding.goodieId
    ?MIKA_ACTOR_REFERENCE:null;
}
export function resolveBindingActorProfile(binding,profiles=ACTOR_PROFILES) {
  const ref=own(binding,'actorProfile')?binding.actorProfile:knownMikaReference(binding);
  const profile=resolveActorProfile(ref,profiles);
  return profile?.visitorId===binding?.visitorId?profile:null;
}
/** Absent metadata has one explicit legacy branch, never a default for another visitor. */
export function resolveVisitActorProfile(record,binding,profiles=ACTOR_PROFILES) {
  const media=record?.mediaAdmission,expected=resolveBindingActorProfile(binding,profiles);
  const ref=own(media,'actorProfile')?media.actorProfile:knownMikaReference(binding);
  const profile=resolveActorProfile(ref,profiles);
  return profile&&expected&&profile.id===expected.id&&profile.revision===expected.revision
    &&profile.visitorId===record?.original?.visitorId?profile:null;
}
