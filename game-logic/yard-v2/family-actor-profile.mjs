/** Small immutable identity inventory; importing it does not load source art. */
import input from './media/family-actor-profiles.json' with {type:'json'};
import {deepFreeze} from './util.mjs';
export const FAMILY_ACTOR_PROFILES=deepFreeze(input);
export const FAMILY_ACTOR_REFERENCES=deepFreeze(Object.fromEntries(Object.entries(input).map(([id,p])=>[id,{id,revision:p.revision}])));
export const FAMILY_RELEASE_GATE=deepFreeze({accepted:false,pending:['actual-media-roster-admission','global-decoded-byte-budget','canonical-browser-and-1x-review','persisted-condition-replay','release-review']});
