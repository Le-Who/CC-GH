/** Genuine production Express app, auth, routes, Socket.IO and PostgreSQL.
 * Only the active child receives the existing explicit test-process policy loader. */
import {createServer} from 'node:http';
import {access} from 'node:fs/promises';
import {YARD_API_PORTS,assertYardPlayerApiEnvironment} from './yard-player-api-guard.mjs';
// The coordinator sets this sole loader opt-in only on the active subprocess.
const mode=process.argv[2];
assertYardPlayerApiEnvironment({...process.env,YARD_PLAYER_WIRING_TEST:''});
if(!Object.hasOwn(YARD_API_PORTS,mode)||((process.env.YARD_PLAYER_WIRING_TEST||'')!==(mode!=='closed'?'1':'')))throw Error('Exact isolated server mode required');
await access(new URL('../../dist/index.html',import.meta.url));
const {YARD_PLAYER_RELEASE_POLICY}=await import('../../game-logic/yard-v2/release-policy.mjs');
if(YARD_PLAYER_RELEASE_POLICY.enabled!==(mode!=='closed'))throw Error('Server policy does not match explicit test subprocess');
for(const [file,name] of [['mochi-actor-profile.mjs','MOCHI_RELEASE_GATE'],['pebble-actor-profile.mjs','PEBBLE_RELEASE_GATE'],['pip-actor-profile.mjs','PIP_RELEASE_GATE'],['family-actor-profile.mjs','FAMILY_RELEASE_GATE']]){
  if((await import(`../../game-logic/yard-v2/${file}`))[name].accepted!==false)throw Error('All additional actor acceptance gates must remain false');
}
const {getYardServerOptions}=await import('../../game-logic/yard-v2/yard-media.mjs');
if(JSON.stringify(Object.keys(getYardServerOptions().actorProfiles))!==JSON.stringify(['mika']))throw Error('Actor acceptance must remain closed');
const {initDb,ensureDbSchema,getDb}=await import('../../db.js');
if(!initDb())throw Error('Real PostgreSQL required; no memory fallback');await ensureDbSchema();
const [db]=await getDb()`SELECT current_database() AS name,current_setting('server_version_num')::int AS version`;
if(db.name!=='ccgh_merge_ci'||db.version<150000||db.version>=160000)throw Error('Exact disposable PostgreSQL15 required');
const {app}=await import('../../server.js');
const {initSocket}=await import('../../socketManager.js');
const server=createServer(app);initSocket(server);
await new Promise(resolve=>server.listen(YARD_API_PORTS[mode],'127.0.0.1',resolve));
console.log(`Yard ${mode} real API ready on loopback:${YARD_API_PORTS[mode]}`);
