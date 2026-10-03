/** Trusted acceptance fixture only, never imported by production or HTTP. */
import {createPipMedia} from '../../../game-logic/yard-v2/pip-media.mjs';
import {createYardMedia} from '../../../game-logic/yard-v2/yard-media.mjs';
import {PIP_ACTOR_PROFILE} from '../../../game-logic/yard-v2/pip-actor-profile.mjs';
export function createPipAcceptanceOptions(){
 const pip=createPipMedia();return createYardMedia({pip:{...pip,preflight:pip.preflightCandidate,
 actorProfiles:{pip:{...structuredClone(PIP_ACTOR_PROFILE),playbackReady:true}},
 mediaRegistry:{...structuredClone(pip.mediaRegistry),bindings:pip.mediaRegistry.bindings.map(b=>({...structuredClone(b),playbackReady:true}))}}});
}
