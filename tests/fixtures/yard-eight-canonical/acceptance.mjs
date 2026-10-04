/** Trusted local acceptance only. This module is never loaded by production. */
import {createMochiMedia} from '../../../game-logic/yard-v2/mochi-media.mjs';
import {createPebbleMedia} from '../../../game-logic/yard-v2/pebble-media.mjs';
import {createPipMedia} from '../../../game-logic/yard-v2/pip-media.mjs';
import {createFamilyMedia} from '../../../game-logic/yard-v2/family-media.mjs';
import {createYardMedia} from '../../../game-logic/yard-v2/yard-media.mjs';
const accept=source=>({...source,preflight:source.preflightCandidate,
 actorProfiles:{[source.candidateProfile.id]:{...structuredClone(source.candidateProfile),playbackReady:true}},
 mediaRegistry:{...structuredClone(source.mediaRegistry),bindings:source.mediaRegistry.bindings.map(b=>({...structuredClone(b),playbackReady:true}))}});
let options;
export function createEightAcceptanceOptions(){return options??=createYardMedia({
 mochi:accept(createMochiMedia()),pebble:accept(createPebbleMedia()),pip:accept(createPipMedia()),
 ...Object.fromEntries(['willow','starlit','basil','sage'].map(id=>[id,accept(createFamilyMedia(id))]))});}
