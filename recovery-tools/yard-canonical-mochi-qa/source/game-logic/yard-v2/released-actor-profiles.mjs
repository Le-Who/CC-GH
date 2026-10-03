/** Static code-owned release gate; never derived from a save or action payload. */
import {ACTOR_PROFILES} from './actor-profiles.mjs';
import {MOCHI_ACTOR_PROFILE,MOCHI_RELEASE_GATE} from './mochi-actor-profile.mjs';
export const YARD_ACTOR_PROFILES=MOCHI_RELEASE_GATE.accepted&&MOCHI_ACTOR_PROFILE.playbackReady
 ?Object.freeze({...ACTOR_PROFILES,mochi:MOCHI_ACTOR_PROFILE}):ACTOR_PROFILES;
