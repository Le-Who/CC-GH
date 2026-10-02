/** Actual withPlayerLock retry loop with a deterministic SQL-shaped in-memory transport.
 * This verifies fresh-read/commit ownership, not a live PostgreSQL deployment. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const modules={
 db:`let row, race=null; export const calls={select:0,update:0};
 export function seed(value){row=structuredClone(value);calls.select=0;calls.update=0;race=null;}
 export function onConflict(fn){race=fn;} export function saved(){return structuredClone(row);}
 export function getDb(){return async function sql(strings,...v){const text=strings.join('?');
  if(text.includes('INSERT INTO players')){row??=structuredClone(v[1]);return [];}
  if(text.includes('SELECT data FROM players')){calls.select++;return [{data:structuredClone(row)}];}
  if(text.includes('UPDATE players')){calls.update++;if(race){const fn=race;race=null;fn(row);return [];}
   if((row._version||'0')!==v[2])return [];row=structuredClone(v[0]);return[{id:row.id}];}
  throw Error('Unexpected SQL in bounded test');};}`,
 socket:`export function getIO(){return null;}`,
 redis:`export function isRedisEnabled(){return false;} export async function redisSetPlayer(){throw Error('no network');} export async function redisGetOrLoadPlayer(){throw Error('no network');}`,
};
registerHooks({resolve(s,c,next){const key=s==='yard-occ:db'?'db':/(^|\/)db\.js$/.test(s)?'db':/(^|\/)socketManager\.js$/.test(s)?'socket':/(^|\/)redisAdapter\.js$/.test(s)?'redis':null;return key?{shortCircuit:true,url:`yard-occ:${key}`}:next(s,c);},
 load(url,c,next){const key=url.startsWith('yard-occ:')?url.slice(9):null;return key?{shortCircuit:true,format:'module',source:modules[key]}:next(url,c);}});
const {withPlayerLock}=await import('../playerManager.js');
const {createDefaultPlayer}=await import('../game-logic/player.js');
const {sourceCatalogActionPolicy}=await import('../game-logic/yard-v2/availability.mjs');
const {ensurePersistentPlayerYard,executePersistentYardAction}=await import('../game-logic/yard-v2/service.mjs');
const db=await import('yard-occ:db');
const NOW=Date.UTC(2026,9,2,12);
function fixture(){const p=createDefaultPlayer('yard-occ-test','Fixture',NOW);p.yard.currencies.treats=1000;p._version='v0';ensurePersistentPlayerYard(p,{now:NOW});return p;}
const buy=p=>executePersistentYardAction(p,'yard.buyFood',{foodId:'berry_plate'},{now:NOW,actionId:'yard-v2:retry-purchase',actionPolicy:sourceCatalogActionPolicy});

test('actual OCC collision reloads the later Garden wallet and applies Yard purchase once to fresh state',async t=>{
 t.mock.method(Date,'now',()=>NOW);db.seed(fixture());db.onConflict(p=>{p.resources.gold=765432;p.garden.totalGoldEarned=444;p.gardenAccounting={version:1,active:true,revision:18,retained:'concurrent'};p._version='v-other-game';});
 let runs=0;const result=await withPlayerLock('yard-occ-test',p=>{runs++;return buy(p);});assert.equal(result.status,200);assert.equal(runs,2);assert.equal(db.calls.select,2);
 const final=db.saved();assert.equal(final.resources.gold,765432);assert.equal(final.garden.totalGoldEarned,444);assert.equal(final.gardenAccounting.revision,18);
 assert.equal(final.yard.currencies.treats,880);assert.equal(final.yard.foodInventory.berry_plate,1);assert.equal(Object.keys(final._yardV2.runtime.commandReceipts).length,1);
});

test('winning concurrent Yard receipt is replayed on actual OCC retry without second debit',async t=>{
 t.mock.method(Date,'now',()=>NOW);db.seed(fixture());db.onConflict(p=>{assert.equal(buy(p).status,200);p._version='v-winner';});
 let runs=0;const result=await withPlayerLock('yard-occ-test',p=>{runs++;return buy(p);});assert.equal(runs,2);assert.equal(result.replayed,true);
 const final=db.saved();assert.equal(final.yard.currencies.treats,880);assert.equal(final.yard.foodInventory.berry_plate,1);assert.equal(Object.keys(final._yardV2.runtime.commandReceipts).length,1);
});
