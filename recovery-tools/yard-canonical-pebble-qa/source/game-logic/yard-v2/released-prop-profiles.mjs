/** Shared prop geometry is source-owned and released only with its actor gate. */
import {MIKA_SCENE} from './mika-media.mjs';
import {PEBBLE_RELEASE_GATE} from './pebble-actor-profile.mjs';
import combined from './media/pebble/combined-binding.json' with {type:'json'};
import {deepFreeze} from './util.mjs';
const pb=combined.propBounds,pr=combined.propRoot;
export const PEBBLE_PROP_PROFILE=deepFreeze({goodieId:'leaf_pot',stillId:'pebble:leaf-pot',conditions:['new'],rotationZ:0,
 footprint:{width:2*(Math.max(Math.abs(pb.min[0]-pr[0]),Math.abs(pb.max[0]-pr[0]))+.025)*8,height:2*(Math.max(Math.abs(pb.min[1]-pr[1]),Math.abs(pb.max[1]-pr[1]))+.025)*8}});
export const YARD_PROP_PROFILES=deepFreeze({yarn_mouse:{goodieId:'yarn_mouse',footprint:MIKA_SCENE.footprints.yarn_mouse},sun_cushion:{goodieId:'sun_cushion',footprint:MIKA_SCENE.footprints.sun_cushion},...(PEBBLE_RELEASE_GATE.accepted?{leaf_pot:PEBBLE_PROP_PROFILE}:{})});
export const YARD_RELEASED_SCENE=PEBBLE_RELEASE_GATE.accepted?deepFreeze({...MIKA_SCENE,footprints:{...MIKA_SCENE.footprints,leaf_pot:PEBBLE_PROP_PROFILE.footprint}}):MIKA_SCENE;
