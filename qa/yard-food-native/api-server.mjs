/** One actual Express/auth/socket/PostgreSQL bridge; no fake responses or product writes. */
import './fixture-loader.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {access} from 'node:fs/promises';
await access(new URL('../../dist/index.html',import.meta.url));
const {YARD_PLAYER_RELEASE_POLICY}=await import('../../game-logic/yard-v2/release-policy.mjs');assert.equal(YARD_PLAYER_RELEASE_POLICY.enabled,true);
const {CANONICAL_ITEM_PLACEMENT_ENABLED}=await import('../../game-logic/yard-v2/canonical-locations.mjs');
const {CANONICAL_FOOD_LOCATION_ENABLED}=await import('../../game-logic/yard-v2/canonical-food-protocol.mjs');
assert.equal(CANONICAL_ITEM_PLACEMENT_ENABLED,false);assert.equal(CANONICAL_FOOD_LOCATION_ENABLED,false);
const expiry=setTimeout(()=>process.exit(1),240000);expiry.unref();
const {initDb,ensureDbSchema,getDb,closeDb}=await import('../../db.js');assert(initDb());await ensureDbSchema();
const [db]=await getDb()`SELECT current_database() AS name,current_user AS username,current_setting('server_version_num')::int AS version`;
assert.equal(db.name,'ccgh_merge_ci');assert.equal(db.username,'ccgh_merge_ci');assert(db.version>=150000&&db.version<160000);
const {app}=await import('../../server.js'),{initSocket}=await import('../../socketManager.js');const server=createServer(app),io=initSocket(server);
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3216,'127.0.0.1',resolve);});
let stopping=false;async function stop(){if(stopping)return;stopping=true;clearTimeout(expiry);await new Promise(resolve=>io.close(resolve));await closeDb();}
process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());console.log('Food finite actual API ready on loopback3216; lifetime240seconds');
