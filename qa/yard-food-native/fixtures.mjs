/** Generated disposable identities only. Food capability is a trusted option, not saved game data. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {assertCanonicalPgEnvironment} from '../../tests/helpers/yard-canonical-pg-guard.mjs';
import {assertYardPlayerFixture} from '../../tests/helpers/yard-player-api-guard.mjs';
export {ORIGIN,canonicalRows,economy} from '../yard-canonical-acceptance/fixtures.mjs';
const enrollment=new URL('../yard-canonical-acceptance/work/food-fixtures.json',import.meta.url);
export async function foodFixtureOwner(){
 assertCanonicalPgEnvironment();const {initDb,ensureDbSchema,getDb,closeDb}=await import('../../db.js');assert(initDb());await ensureDbSchema();const db=getDb(),fixtures=[];
 async function owned(f){assertYardPlayerFixture(f.externalId,f.id);const[row]=await db`SELECT account_id FROM account_identities WHERE provider='dev' AND external_id=${f.externalId}`;assert.equal(row?.account_id,f.id);}
 async function mode(f,food){await owned(f);assert.equal(typeof food,'boolean');const entries=JSON.parse(await fs.readFile(enrollment,'utf8'));const next=entries.filter(e=>e.id!==f.id);next.push({id:f.id,food});assert(next.length<=8);await fs.writeFile(new URL('food-fixtures.next.json',enrollment),JSON.stringify(next));await fs.rename(new URL('food-fixtures.next.json',enrollment),enrollment);}
 return{
  async seed({food=true}={}){
   const externalId=assertYardPlayerFixture(`yard_player_api_${randomUUID()}`),{getOrCreateAccountForIdentity}=await import('../../accountManager.js');
   const id=await getOrCreateAccountForIdentity('dev',externalId,{displayName:'Canonical food finite QA'}),f={id,externalId};fixtures.push(f);await owned(f);
   const{createDefaultPlayer}=await import('../../game-logic/player.js'),p=createDefaultPlayer(id,'Canonical food finite QA',Date.now());
   p._onboarded=true;p._version=randomUUID();p.yard.placedGoodies=[];p.yard.activeVisitors=[];p.yard.goodieInventory={leaf_pot:2};p.yard.currencies={...p.yard.currencies,treats:280,shinyTreats:2};p.yard.foodInventory={};p.yard.pendingGifts=[];p.yard.album.photos=[];
   p.yard.bowls=p.yard.bowls.map(b=>({...b,foodId:null,servings:0}));assert.equal(p.yard.bowls.length,1);assert.equal(p.yard.bowls[0].id,'bowl-1');await db`INSERT INTO players(id,data) VALUES(${id},${p})`;await mode(f,food);return f;
  },mode,
  async saved(f){await owned(f);const[row]=await db`SELECT data FROM players WHERE id=${f.id}`;assert(row);return row.data;},
  async close(){try{for(const f of fixtures){await owned(f);await db`DELETE FROM players WHERE id=${f.id}`;await db`DELETE FROM accounts WHERE id=${f.id}`;}}finally{await closeDb();}}
 };
}
