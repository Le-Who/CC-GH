/** Trusted test fixture only. No production module imports this file. */
import {createMochiMedia} from '../../../game-logic/yard-v2/mochi-media.mjs';
import {createYardMedia} from '../../../game-logic/yard-v2/yard-media.mjs';
import {MOCHI_ACTOR_PROFILE} from '../../../game-logic/yard-v2/mochi-actor-profile.mjs';
export function createMochiAcceptanceOptions(){
 const mochi=createMochiMedia();
 return createYardMedia({mochi:{...mochi,preflight:mochi.preflightCandidate,
  actorProfiles:{mochi:{...structuredClone(MOCHI_ACTOR_PROFILE),playbackReady:true}},
  mediaRegistry:{...structuredClone(mochi.mediaRegistry),bindings:mochi.mediaRegistry.bindings.map(b=>({...structuredClone(b),playbackReady:true}))}}});
}
