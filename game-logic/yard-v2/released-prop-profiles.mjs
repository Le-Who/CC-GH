/** Shared prop geometry is source-owned and released only with its actor gate. */
import {MIKA_SCENE} from './mika-media.mjs';
import {PEBBLE_RELEASE_GATE} from './pebble-actor-profile.mjs';
import combined from './media/pebble/combined-binding.json' with {type:'json'};
import {PIP_RELEASE_GATE,PIP_ACTOR_PROFILE} from './pip-actor-profile.mjs';
import {PIP_PROP_PROFILE} from './pip-prop-profile.mjs';
import {deepFreeze} from './util.mjs';
import {FAMILY_RELEASE_GATE,FAMILY_ACTOR_PROFILES} from './family-actor-profile.mjs';
import moon from './media/shared-props/r2-evidence/moon-source-identities.json' with {type:'json'};
import fountain from './media/shared-props/r2-evidence/fountain-source-contract.json' with {type:'json'};
/** Geometry derives from immutable source bounds, not a test fixture placement. */
const familyProp=(source,prefix)=>({goodieId:source.goodieId,stillId:`${prefix}-new-r2`,conditions:['new','worn','broken'],rotationZ:0,footprint:{width:2*(Math.max(Math.abs(source.bounds.min[0]),Math.abs(source.bounds.max[0]))+source.paddingWorld)*source.unitsPerWorld,height:2*(Math.max(Math.abs(source.bounds.min[1]),Math.abs(source.bounds.max[1]))+source.paddingWorld)*source.unitsPerWorld}});
export const FAMILY_SOURCE_PROP_PROFILES=deepFreeze({moon_lamp:familyProp(moon,'moon-lamp'),fountain_bowl:familyProp(fountain,'fountain-bowl')});
const familyReady=FAMILY_RELEASE_GATE.accepted && Object.values(FAMILY_ACTOR_PROFILES).every(p=>p.playbackReady);
const familyProps=familyReady?FAMILY_SOURCE_PROP_PROFILES:{};
const familyFootprints=Object.fromEntries(Object.entries(familyProps).map(([id,p])=>[id,p.footprint]));
const pb=combined.propBounds,pr=combined.propRoot;
export const PEBBLE_PROP_PROFILE=deepFreeze({goodieId:'leaf_pot',stillId:'pebble:leaf-pot',conditions:['new'],rotationZ:0,
 footprint:{width:2*(Math.max(Math.abs(pb.min[0]-pr[0]),Math.abs(pb.max[0]-pr[0]))+.025)*8,height:2*(Math.max(Math.abs(pb.min[1]-pr[1]),Math.abs(pb.max[1]-pr[1]))+.025)*8}});
const pipReady=PIP_RELEASE_GATE.accepted&&PIP_ACTOR_PROFILE.playbackReady;
export const YARD_PROP_PROFILES=deepFreeze({yarn_mouse:{goodieId:'yarn_mouse',footprint:MIKA_SCENE.footprints.yarn_mouse},sun_cushion:{goodieId:'sun_cushion',footprint:MIKA_SCENE.footprints.sun_cushion},...(PEBBLE_RELEASE_GATE.accepted?{leaf_pot:PEBBLE_PROP_PROFILE}:{}),...(pipReady?{snack_table:PIP_PROP_PROFILE}:{}),...familyProps});
export const YARD_RELEASED_SCENE=(PEBBLE_RELEASE_GATE.accepted||pipReady||familyReady)?deepFreeze({...MIKA_SCENE,footprints:{...MIKA_SCENE.footprints,...(PEBBLE_RELEASE_GATE.accepted?{leaf_pot:PEBBLE_PROP_PROFILE.footprint}:{}),...(pipReady?{snack_table:PIP_PROP_PROFILE.footprint}:{}),...familyFootprints}}):MIKA_SCENE;
