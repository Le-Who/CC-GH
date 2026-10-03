/** Own dog calibration; source availability never grants release admission. */
import {deepFreeze,digest} from './util.mjs';
import ground from './media/pebble/ground-motion.json' with {type:'json'};
export const PEBBLE_ACTOR_REFERENCE=Object.freeze({id:'pebble',revision:'pebble-actor/r1'});
export const PEBBLE_MEDIA_REVISION='pebble-leaf-pot-runtime/r1';
export const PEBBLE_RELEASE_GATE=deepFreeze({accepted:false,pending:['cardinal-pixel-review','canonical-browser-QA','multi-actor-cache-and-depth-QA','release-review']});
export const PEBBLE_ACTOR_PROFILE=deepFreeze({...PEBBLE_ACTOR_REFERENCE,visitorId:'pebble_pup',playbackReady:PEBBLE_RELEASE_GATE.accepted,unitsPerWorld:8,sourceSampleMs:50,
 locomotion:{revision:'pebble-four-beat-walk/r1',sampling:'authored-root-rows',strideWorld:.4,cycleMs:1000,phaseSamples:Array.from({length:20},(_,i)=>i/20),facings:[0,2,4,6],canonicalPhase:0,rampDistanceQuanta:0,rampReferenceSamples:20,turnRoutePreferenceMs:250},
 turns:{durations:{2:2400,4:4800},entryPhase:0,exitPhase:0,variants:[0,2,4,6].flatMap(f=>[`${f}:-1:2`,`${f}:1:2`,`${f}:1:4`])},
 ground:{revision:`pebble-ground-motion/r1:${digest(ground)}`,phaseStarts:[0]},
 interactions:{'pebble-leaf-pot-r1':{goodieId:'leaf_pot',restMode:'anchored-composite',restClipId:'pebble-leaf-pot-r1',loop:{startMs:9000,endMs:10600,fps:20,frames:32}}}});
