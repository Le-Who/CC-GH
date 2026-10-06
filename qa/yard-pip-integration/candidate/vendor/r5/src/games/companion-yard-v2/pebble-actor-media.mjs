import {createCompositeVisitorMediaEntry} from './composite-visitor-media.mjs';
import {createPebbleMedia} from '../../../game-logic/yard-v2/pebble-media.mjs';
import {PEBBLE_ACTOR_REFERENCE,PEBBLE_ACTOR_PROFILE,PEBBLE_MEDIA_REVISION} from '../../../game-logic/yard-v2/pebble-actor-profile.mjs';
import {YARD_ACTOR_PROFILES} from '../../../game-logic/yard-v2/released-actor-profiles.mjs';
export function createPebbleActorMediaEntry(manifest,{assetBaseURL,profiles=YARD_ACTOR_PROFILES}={}){
 return createCompositeVisitorMediaEntry(manifest,{sourceServer:createPebbleMedia(),expectedProfile:PEBBLE_ACTOR_PROFILE,reference:PEBBLE_ACTOR_REFERENCE,assetBaseURL,profiles,mediaRevision:PEBBLE_MEDIA_REVISION,stillId:'pebble:leaf-pot'});
}
