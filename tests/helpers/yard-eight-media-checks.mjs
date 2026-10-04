/** Real production adapters validate candidate metadata; no renderer substitutes. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {YARD_ACTOR_PROFILES} from '../../game-logic/yard-v2/released-actor-profiles.mjs';
import {createActorMediaEntry} from '../../src/games/companion-yard-v2/actor-media.mjs';
import {createMochiActorMediaEntry} from '../../src/games/companion-yard-v2/mochi-actor-media.mjs';
import {createPebbleActorMediaEntry} from '../../src/games/companion-yard-v2/pebble-actor-media.mjs';
import {createPipActorMediaEntry} from '../../src/games/companion-yard-v2/pip-actor-media.mjs';
import {createFamilyActorMediaEntry} from '../../src/games/companion-yard-v2/family-actor-media.mjs';
import {MIKA_CLIPS} from '../../game-logic/yard-v2/media/mika-clips.mjs';
import {MIKA_ACTOR_REFERENCE} from '../../game-logic/yard-v2/actor-profiles.mjs';
import {EIGHT_IDS,candidateManifest,assertEightCandidateBuild} from './yard-eight-player-candidate.mjs';
import {actorAtlasPages} from './yard-eight-atlas-attribution.mjs';
assertEightCandidateBuild();
for(const id of EIGHT_IDS){
 const family=['willow','starlit','basil','sage'].includes(id),path=family?`assets/yard-family/${id}/runtime-media.json`:`assets/yard-${id}/runtime-media.json`;
 const text=readFileSync(new URL(`../../${family?'recovery-tools/yard-family-frozen':'public'}/${path}`,import.meta.url),'utf8'),raw=JSON.parse(text),promoted=['mochi','pebble'].includes(id)?JSON.parse(candidateManifest(path,text)):raw;
 const assetBaseURL=new URL(path.replace('runtime-media.json',''),'http://127.0.0.1').href,options={assetBaseURL,profiles:YARD_ACTOR_PROFILES};
 const construct=manifest=>id==='mika'?createActorMediaEntry(manifest,{...options,reference:MIKA_ACTOR_REFERENCE,clips:MIKA_CLIPS}):id==='mochi'?createMochiActorMediaEntry(manifest,options):id==='pebble'?createPebbleActorMediaEntry(manifest,options):id==='pip'?createPipActorMediaEntry(manifest,options):createFamilyActorMediaEntry(id,manifest,options);
 if(['mochi','pebble'].includes(id)){assert.throws(()=>construct(raw),/mismatch/);assert.deepEqual({...promoted,playbackReady:false,runtimeActivated:false},raw);assert.equal(promoted.runtimeActivated,id==='mochi');}
 const entry=construct(promoted),expected=actorAtlasPages(entry.manifest,assetBaseURL),actual=actorAtlasPages(promoted,assetBaseURL);
 assert.deepEqual(actual,expected,`${id}: raw attribution must match actual validated adapter descriptors`);
 console.log('Production adapter and exact atlas mapping verified:',id,Object.keys(actual).length);
}
