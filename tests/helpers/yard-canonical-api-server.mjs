/** One finite browser bridge to the actual Express/auth/socket/PostgreSQL app.
 * No fixture endpoint, state setter, policy overlay, or substitute transport. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {access} from 'node:fs/promises';
import {assertCanonicalPgEnvironment} from './yard-canonical-pg-guard.mjs';
import {YARD_API_PORTS} from './yard-player-api-guard.mjs';
assertCanonicalPgEnvironment(process.env,{api:true});
await import('./yard-canonical-pg-loader.mjs');
await access(new URL('../../dist/index.html',import.meta.url));
const {YARD_PLAYER_RELEASE_POLICY}=await import('../../game-logic/yard-v2/release-policy.mjs');
const {getYardServerOptions}=await import('../../game-logic/yard-v2/yard-media.mjs');
assert.equal(YARD_PLAYER_RELEASE_POLICY.enabled,true,'Existing admitted player policy must remain unchanged');
assert.deepEqual(Object.keys(getYardServerOptions().actorProfiles).sort(),['basil','mika','mochi','pebble','pip','sage','starlit','willow']);
// Bound this single acceptance listener even if the browser runner disappears.
const expiry=setTimeout(()=>{console.error('Canonical API bridge exceeded its 240-second acceptance window');process.exit(1);},240000);expiry.unref();
const {initDb,ensureDbSchema,getDb,closeDb}=await import('../../db.js');
assert.ok(initDb(),'Real PostgreSQL required; no memory fallback');await ensureDbSchema();
const [db]=await getDb()`SELECT current_database() AS name,current_user AS username,current_setting('server_version_num')::int AS version`;
assert.equal(db.name,'ccgh_merge_ci');assert.equal(db.username,'ccgh_merge_ci');assert.ok(db.version>=150000&&db.version<160000,'PostgreSQL15 required');
const {app}=await import('../../server.js');
const {initSocket}=await import('../../socketManager.js');
const server=createServer(app),io=initSocket(server);
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(YARD_API_PORTS.active,'127.0.0.1',resolve);});
let stopping=false;
async function stop(){if(stopping)return;stopping=true;clearTimeout(expiry);await new Promise(resolve=>io.close(resolve));await closeDb();}
process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
console.log(`Canonical real API ready on 127.0.0.1:${YARD_API_PORTS.active}; maximum lifetime 240 seconds`);
