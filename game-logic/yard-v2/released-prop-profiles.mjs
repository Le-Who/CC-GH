/** Shared prop geometry is source-owned and released only with its actor gate. */
import {MIKA_SCENE} from './mika-media.mjs';
import {PEBBLE_RELEASE_GATE} from './pebble-actor-profile.mjs';
import combined from './media/pebble/combined-binding.json' with {type:'json'};
import {PIP_RELEASE_GATE,PIP_ACTOR_PROFILE} from './pip-actor-profile.mjs';
import {PIP_PROP_PROFILE} from './pip-prop-profile.mjs';
import {deepFreeze} from './util.mjs';
const pb=combined.propBounds,pr=combined.propRoot;
export const PEBBLE_PROP_PROFILE=deepFreeze({goodieId:'leaf_pot',stillId:'pebble:leaf-pot',conditions:['new'],rotationZ:0,
 footprint:{width:2*(Math.max(Math.abs(pb.min[0]-pr[0]),Math.abs(pb.max[0]-pr[0]))+.025)*8,height:2*(Math.max(Math.abs(pb.min[1]-pr[1]),Math.abs(pb.max[1]-pr[1]))+.025)*8}});
const pipReady=PIP_RELEASE_GATE.accepted&&PIP_ACTOR_PROFILE.playbackReady;
export const YARD_PROP_PROFILES=deepFreeze({yarn_mouse:{goodieId:'yarn_mouse',footprint:MIKA_SCENE.footprints.yarn_mouse},sun_cushion:{goodieId:'sun_cushion',footprint:MIKA_SCENE.footprints.sun_cushion},...(PEBBLE_RELEASE_GATE.accepted?{leaf_pot:PEBBLE_PROP_PROFILE}:{}),...(pipReady?{snack_table:PIP_PROP_PROFILE}:{})});
export const YARD_RELEASED_SCENE=(PEBBLE_RELEASE_GATE.accepted||pipReady)?deepFreeze({...MIKA_SCENE,footprints:{...MIKA_SCENE.footprints,...(PEBBLE_RELEASE_GATE.accepted?{leaf_pot:PEBBLE_PROP_PROFILE.footprint}:{}),...(pipReady?{snack_table:PIP_PROP_PROFILE.footprint}:{})}}):MIKA_SCENE;
