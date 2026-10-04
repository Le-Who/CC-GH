import assert from 'node:assert/strict';
import {assertFamilyPgGate} from './yard-family-pg-guard.mjs';
import {assertYardV2FixtureId} from './yard-v2-pg-guard.mjs';
assertFamilyPgGate();
if(process.env.YARD_V2_PG_WORKER!=='1'||!process.send)throw Error('Guarded family IPC parent required');
// No unit loader, SQL substitutes, memory store, release-policy overrides or source overlays.
const {initDb,ensureDbSchema,getDb,closeDb}=await import('../../db.js');
const {withPlayerLock}=await import('../../playerManager.js');
const {ensurePersistentPlayerYard,executePersistentYardAction}=await import('../../game-logic/yard-v2/service.mjs');
const {createEightAcceptanceOptions}=await import('../fixtures/yard-eight-canonical/acceptance.mjs');
const {applyActionWithReceipt}=await import('../../routes/player.js');
const options=createEightAcceptanceOptions(),NOW=Date.UTC(2026,9,3,12),DAY=86400000;
let release,running=false;
process.on('disconnect',()=>{if(running)process.exit(1);});
process.on('message',async message=>{
 if(message?.type==='release'&&release){release();release=null;return;}
 if(message?.type!=='execute'||running)return;
 running=true;
 try{
  assertYardV2FixtureId(message.playerId);
  if(!getDb())throw Error('Actual PostgreSQL handle required; refusing memory fallback');
  if(!Number.isSafeInteger(message.now)||message.now<NOW||message.now>NOW+12*DAY)throw Error('Only bounded family fixture timestamps');
  const advance=message.operation==='family.advance'&&Object.keys(message.payload||{}).length===0;
  const collect=message.operation==='family.collect'&&/^yard-v2:family-pg-collect:[a-f0-9-]{36}$/.test(message.clientActionId||'')
   &&message.payload&&Object.keys(message.payload).every(k=>k==='unexpected');
  const garden=message.operation==='garden.command'&&message.action==='garden.r2'
   &&['adopt','buyPlant'].includes(message.payload?.command)&&message.payload.accountId===message.playerId;
  if(!advance&&!collect&&!garden)throw Error('Only bounded family advance/collect or fixture Garden command');
  let callbackAttempts=0;
  const outcome=await withPlayerLock(message.playerId,async player=>{
   callbackAttempts++;
   if(message.barrier&&callbackAttempts===1)await new Promise(resolve=>{release=resolve;process.send({type:'loaded',pid:process.pid,version:player._version});});
   if(advance){const r=ensurePersistentPlayerYard(player,{...options,now:message.now,simulate:true});return{status:r.status,error:r.error};}
   if(collect)return executePersistentYardAction(player,'yard.collectGifts',message.payload,{...options,now:message.now,actionId:message.clientActionId});
   return applyActionWithReceipt(player,message.action,message.payload,{clientActionId:message.clientActionId,serverNow:message.now});
  });
  process.send(message.loseResponse?{type:'response-lost',pid:process.pid,callbackAttempts}:{type:'result',pid:process.pid,callbackAttempts,outcome});
 }catch(error){process.send({type:'failure',message:error.stack||error.message});process.exitCode=1;}
 finally{running=false;await closeDb();process.disconnect();}
});
try{
 assert.ok(initDb(),'Actual PostgreSQL handle required');await ensureDbSchema();
 const [db]=await getDb()`SELECT current_database() AS name,current_setting('server_version_num')::int AS version`;
 assert.equal(db.name,'ccgh_merge_ci');assert.ok(db.version>=150000&&db.version<160000,'PostgreSQL15 required');
 process.send({type:'ready',pid:process.pid});
}catch(error){process.send({type:'failure',message:error.stack||error.message});process.exitCode=1;await closeDb();process.disconnect();}
