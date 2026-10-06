/** Canonical Mochi contract, held outside the released actor registry. */
import {deepFreeze} from './util.mjs';
export const MOCHI_ACTOR_REFERENCE=Object.freeze({id:'mochi',revision:'mochi-actor/r1'});
export const MOCHI_RUNTIME_MEDIA_REVISION='mochi-canonical-source/r1';
export const MOCHI_RELEASE_GATE=deepFreeze({accepted:true,
 completed:['own-source-rig','own-stride-root-rows','cardinal-turns','ground-contact-and-clearance','combined-prop-rest-cycle','standalone-browser-fixture'],
 standaloneBrowserEvidence:{commit:'b6e0d70e85b527c02577e9254a1f95ac0cdbb3fa',run:37091634591,job:111113032492,passed:10,retries:0,screenshotsReviewed:40},
 pending:['canonical-server-and-shared-scene-browser-QA','multi-actor-cache-and-depth-QA','release-review']});

export const MOCHI_ACTOR_PROFILE=deepFreeze({
 ...MOCHI_ACTOR_REFERENCE,visitorId:'mochi_bunny',playbackReady:MOCHI_RELEASE_GATE.accepted,unitsPerWorld:8,sourceSampleMs:50,
 locomotion:{revision:'mochi-authored-root/r1',sampling:'authored-root-rows',strideWorld:.48,cycleMs:1000,
  phaseSamples:Array.from({length:20},(_,i)=>i/20),facings:[0,2,4,6],canonicalPhase:0,
  rampDistanceQuanta:0,rampReferenceSamples:20,turnRoutePreferenceMs:250},
 turns:{durations:{2:2000,4:4000},entryPhase:0,exitPhase:0,
  variants:[0,2,4,6].flatMap(f=>[`${f}:-1:2`,`${f}:1:2`,`${f}:1:4`])},
 ground:{revision:'mochi-ground-motion/r2:e5099ce966168b70c19416f28e492dcff8fc9b67600cf001d39b8017da9185c1',phaseStarts:[0]},
 interactions:{'mochi-mouse-combined-r1':{goodieId:'yarn_mouse',restMode:'anchored-composite',restClipId:'mochi-mouse-combined-r1',
  loop:{startMs:10000,endMs:11200,fps:20,frames:24}}},
});
