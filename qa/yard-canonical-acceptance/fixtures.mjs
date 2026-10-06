/** Real disposable identities and database rows. No synthetic API snapshots or store injection. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {assertCanonicalPgEnvironment} from '../../tests/helpers/yard-canonical-pg-guard.mjs';
import {assertYardPlayerFixture} from '../../tests/helpers/yard-player-api-guard.mjs';
export const ORIGIN='http://127.0.0.1:3216';
export async function fixtureOwner(){
 assertCanonicalPgEnvironment();const {initDb,ensureDbSchema,getDb,closeDb}=await import('../../db.js');
 assert(initDb());await ensureDbSchema();const db=getDb(),fixtures=[];
 const [server]=await db`SELECT current_database() AS name,current_user AS username,current_setting('server_version_num')::int AS version`;
 assert.equal(server.name,'ccgh_merge_ci');assert.equal(server.username,'ccgh_merge_ci');assert(server.version>=150000&&server.version<160000);
 async function owned(f){assertYardPlayerFixture(f.externalId,f.id);const[row]=await db`SELECT account_id FROM account_identities WHERE provider='dev' AND external_id=${f.externalId}`;assert.equal(row?.account_id,f.id);}
 return {
  async seed({treats=80,pots=2}={}){
   assert([80,140,280].includes(treats));assert([0,2].includes(pots));
   const externalId=assertYardPlayerFixture(`yard_player_api_${randomUUID()}`),{getOrCreateAccountForIdentity}=await import('../../accountManager.js');
   const id=await getOrCreateAccountForIdentity('dev',externalId,{displayName:'Canonical finite QA'}),f={id,externalId};fixtures.push(f);await owned(f);
   const {createDefaultPlayer}=await import('../../game-logic/player.js');const p=createDefaultPlayer(id,'Canonical finite QA',Date.now());
   p._onboarded=true;p._version=randomUUID();p.yard.placedGoodies=[];p.yard.goodieInventory=pots?{leaf_pot:pots}:{};p.yard.currencies.treats=treats;p.yard.pendingGifts=[];p.yard.album.photos=[];
   p.yard.bowls=p.yard.bowls.map(b=>({...b,servings:0}));await db`INSERT INTO players(id,data) VALUES(${id},${p})`;return f;
  },
  async saved(f){await owned(f);const[row]=await db`SELECT data FROM players WHERE id=${f.id}`;assert(row);return row.data;},
  async close(){try{for(const f of fixtures){await owned(f);await db`DELETE FROM players WHERE id=${f.id}`;await db`DELETE FROM accounts WHERE id=${f.id}`;}}finally{await closeDb();}},
 };
}
export async function realMutation(request,f,action,payload){
 const body={accountId:f.id,action,payload:{locationId:'pip-garden',locationVersion:1,geometryRevision:'pip-garden-t2-r1',...payload},clientActionId:`yard-v2:canonical-v1/browser-${randomUUID()}`};
 const response=await request.post(ORIGIN+'/api/player/mutate',{headers:{Authorization:`dev ${f.externalId}`},data:body});assert.equal(response.status(),200,await response.text());return response.json();
}
export const canonicalRows=p=>p._yardV2?.runtime?.canonicalPlacements??[];
export function economy(p){return{currencies:p.yard.currencies,foodInventory:p.yard.foodInventory,bowls:p.yard.bowls,pendingGifts:p.yard.pendingGifts,album:p.yard.album,placedGoodies:p.yard.placedGoodies,visits:p._yardV2?.runtime?.visits,resources:{gold:p.resources.gold,gachaTokens:p.resources.gachaTokens,energyCurrent:p.resources.energy.current,energyMax:p.resources.energy.max},merge:p.merge};}
