/** Actual Express/auth/socket/PG app, isolated static root and 1x authored clock. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {assertEightCandidateApi,candidateManifest,CANDIDATE_PORT,CANDIDATE_DIST,CANDIDATE_SOURCE_PINS,CANDIDATE_MEDIA_PINS,EIGHT_IDS,AUTHORED_CLOCK_ORIGIN} from './yard-eight-player-candidate.mjs';
assertEightCandidateApi();
if(!process.execArgv.includes('./tests/helpers/yard-eight-player-loader.mjs'))throw Error('Explicit candidate loader required');
const manifest=JSON.parse(await readFile(new URL(`../../${CANDIDATE_DIST}/EIGHT-CANDIDATE-ONLY.json`,import.meta.url),'utf8'));
if(JSON.stringify(manifest.sourcePins)!==JSON.stringify(CANDIDATE_SOURCE_PINS)||JSON.stringify(manifest.mediaPins)!==JSON.stringify(CANDIDATE_MEDIA_PINS))throw Error('Mismatched isolated client candidate');
for(const path of Object.keys(CANDIDATE_MEDIA_PINS)){
 const expected=candidateManifest(path,await readFile(new URL(`../../public/${path}`,import.meta.url),'utf8'));
 if(await readFile(new URL(`../../${CANDIDATE_DIST}/${path}`,import.meta.url),'utf8')!==expected)throw Error('Mismatched isolated manifest promotion');
}
const origin=performance.now();Date.now=()=>AUTHORED_CLOCK_ORIGIN+Math.floor(performance.now()-origin);
const {YARD_PLAYER_RELEASE_POLICY}=await import('../../game-logic/yard-v2/release-policy.mjs');
const {getYardServerOptions}=await import('../../game-logic/yard-v2/yard-media.mjs');
if(!YARD_PLAYER_RELEASE_POLICY.enabled||JSON.stringify(Object.keys(getYardServerOptions().actorProfiles))!==JSON.stringify(EIGHT_IDS))throw Error('Exact test candidate registry required');
const {initDb,ensureDbSchema,getDb}=await import('../../db.js');if(!initDb())throw Error('Real PostgreSQL required');await ensureDbSchema();
const [db]=await getDb()`SELECT current_database() AS name,current_setting('server_version_num')::int AS version`;
if(db.name!=='ccgh_merge_ci'||db.version<150000||db.version>=160000)throw Error('Exact disposable PostgreSQL15 required');
const {app}=await import('../../server.js');const {initSocket}=await import('../../socketManager.js');
const server=createServer(app);initSocket(server);await new Promise(resolve=>server.listen(CANDIDATE_PORT,'127.0.0.1',resolve));
console.log('Isolated eight-actor API ready; authored clock runs at 1x, production gates remain closed on disk');
