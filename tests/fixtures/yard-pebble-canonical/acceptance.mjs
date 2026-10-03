/** Synthetic test-only acceptance. Never imported by production. */
import {createPebbleMedia} from '../../../game-logic/yard-v2/pebble-media.mjs';
import {createYardMedia} from '../../../game-logic/yard-v2/yard-media.mjs';
import {PEBBLE_ACTOR_PROFILE} from '../../../game-logic/yard-v2/pebble-actor-profile.mjs';
export function createPebbleAcceptanceOptions(){const pebble=createPebbleMedia();return createYardMedia({pebble:{...pebble,
 preflight:pebble.preflightCandidate,actorProfiles:{pebble:{...structuredClone(PEBBLE_ACTOR_PROFILE),playbackReady:true}},
 mediaRegistry:{...structuredClone(pebble.mediaRegistry),bindings:pebble.mediaRegistry.bindings.map(b=>({...structuredClone(b),playbackReady:true}))}}});}
