/** Explicit acceptance fixture. Never imported by any production entry/config. */
import {createHash} from 'node:crypto';
import {assertYardPlayerApiEnvironment} from './yard-player-api-guard.mjs';
export const CANDIDATE_PORT=3220;
export const CANDIDATE_DIST='dist-yard-eight-player-candidate';
export const AUTHORED_CLOCK_ORIGIN=Date.UTC(2026,9,3,14,2);
export const EIGHT_IDS=Object.freeze(['mika','mochi','pebble','pip','willow','starlit','basil','sage']);
export function assertEightCandidateBuild(env=process.env){
 if(env.YARD_EIGHT_PLAYER_CANDIDATE_TEST!=='1'||env.CI!=='true'||env.NODE_ENV!=='test'||env.NODE_OPTIONS||env.YARD_CANDIDATE_CI||env.YARD_PLAYER_WIRING_TEST)throw Error('Explicit isolated eight-actor test required; no inherited loaders');
}
export function assertEightCandidateApi(env=process.env){assertEightCandidateBuild(env);assertYardPlayerApiEnvironment(env);}
export const CANDIDATE_SOURCE_PINS=Object.freeze({
 'game-logic/yard-v2/release-policy.mjs':'dad5d515d329b4f73d8deed7ef5d48ad15541782e94db0b19f2d90362d5f9eec',
 'game-logic/yard-v2/mochi-actor-profile.mjs':'412b43826c380e3f0d3b1d37f30d3b5059bc140d589809e3e539029a06bc4313',
 'game-logic/yard-v2/pebble-actor-profile.mjs':'0af9977bbc35da9d9cc7e6120502bf431b093525ca7f1e5b3f24d90d8b562200',
 'game-logic/yard-v2/pip-actor-profile.mjs':'818796394a7c91182eebdf4a14243089edcdc90f558f68aeb29e41154f185ddc',
 'game-logic/yard-v2/family-actor-profile.mjs':'607ea60757995eb66c97261061d49c6f4db1fe2a1221c4656ec91ca0f13c1cb5',
 'game-logic/yard-v2/media/family-actor-profiles.json':'6a1bcd9b79891243e86cd2dc47e0af5e2d6f05a4798dfd99391db8184f052bd8',
});
export const CANDIDATE_MEDIA_PINS=Object.freeze({
 'assets/yard-mochi/runtime-media.json':'41dd78f72df7726393a1dca31ffe16ed67c774badf29d7fab7b514c208cbc859',
 'assets/yard-pebble/runtime-media.json':'c7828a7b760100ff972218607a245dadd0590de6d3d1cab1153ae50df71d3578',
});
export function candidateManifest(path,source){
 if(!Object.hasOwn(CANDIDATE_MEDIA_PINS,path)||createHash('sha256').update(source).digest('hex')!==CANDIDATE_MEDIA_PINS[path])throw Error(`Unreviewed candidate manifest: ${path}`);
 const manifest=JSON.parse(source);if(manifest.playbackReady!==false||manifest.runtimeActivated!==false)throw Error('Exact closed candidate manifest required');
 // Production adapters require this top-level readiness metadata to agree with
 // Mochi/Pebble server bindings. Source submanifests and every pixel stay closed.
 return JSON.stringify({...manifest,playbackReady:true,...(path.includes('yard-mochi/')?{runtimeActivated:true}:{})});
}
export function candidateSource(path,source){
 if(!Object.hasOwn(CANDIDATE_SOURCE_PINS,path))return null;
 if(createHash('sha256').update(source).digest('hex')!==CANDIDATE_SOURCE_PINS[path])throw Error(`Unreviewed candidate source: ${path}`);
 // Only six closed readiness/acceptance modules are substituted. All geometry,
 // source identities, food, wear, reservations, economy and real policies stay exact.
 return source.replace(/(\b(?:enabled|accepted|playbackReady)"?\s*:\s*)false/g,'$1true');
}
