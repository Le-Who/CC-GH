/** Static code-owned release gate; never derived from a save or action payload. */
import {ACTOR_PROFILES} from './actor-profiles.mjs';
import {MOCHI_ACTOR_PROFILE,MOCHI_RELEASE_GATE} from './mochi-actor-profile.mjs';
import {PEBBLE_ACTOR_PROFILE,PEBBLE_RELEASE_GATE} from './pebble-actor-profile.mjs';
import {PIP_ACTOR_PROFILE,PIP_RELEASE_GATE} from './pip-actor-profile.mjs';
import {FAMILY_RELEASE_GATE,FAMILY_ACTOR_PROFILES} from './family-actor-profile.mjs';
const candidates=[MOCHI_RELEASE_GATE.accepted&&MOCHI_ACTOR_PROFILE.playbackReady?MOCHI_ACTOR_PROFILE:null,
 PEBBLE_RELEASE_GATE.accepted&&PEBBLE_ACTOR_PROFILE.playbackReady?PEBBLE_ACTOR_PROFILE:null,
 PIP_RELEASE_GATE.accepted&&PIP_ACTOR_PROFILE.playbackReady?PIP_ACTOR_PROFILE:null,
 ...Object.values(FAMILY_ACTOR_PROFILES).filter(p=>FAMILY_RELEASE_GATE.accepted&&p.playbackReady)].filter(Boolean);
export const YARD_ACTOR_PROFILES=candidates.length?Object.freeze({...ACTOR_PROFILES,...Object.fromEntries(candidates.map(p=>[p.id,p]))}):ACTOR_PROFILES;
