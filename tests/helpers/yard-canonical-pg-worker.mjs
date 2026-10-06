/** Real PostgreSQL/OCC and API functions in separate OS processes. */
import assert from 'node:assert/strict';
import {assertCanonicalPgEnvironment,assertCanonicalPgCommand} from './yard-canonical-pg-guard.mjs';
import {assertYardV2FixtureId} from './yard-v2-pg-guard.mjs';
assertCanonicalPgEnvironment();
if(process.env.YARD_V2_PG_WORKER!=='1'||!process.send)throw Error('Guarded canonical IPC parent required');
await import('./yard-canonical-pg-loader.mjs');
const {initDb,ensureDbSchema,getDb,closeDb}=await import('../../db.js');
const {withPlayerLock}=await import('../../playerManager.js');
const {applyActionWithReceipt}=await import('../../routes/player.js');
const {ensurePersistentPlayerYard}=await import('../../game-logic/yard-v2/service.mjs');
let release,running=false;
process.on('disconnect',()=>{if(running)process.exit(1);});
process.on('message',async message=>{
  if(message?.type==='release'&&release){release();release=null;return;}
  if(message?.type!=='execute'||running)return;
  running=true;
  const clock=Date.now;
  try{
    assertYardV2FixtureId(message.playerId);assertCanonicalPgCommand(message);
    if(!getDb())throw Error('Real PostgreSQL required; no memory fallback');
    Date.now=()=>message.now; // Deterministic finite fixture clock only; real SQL/locks unchanged.
    let callbackAttempts=0;
    const outcome=await withPlayerLock(message.playerId,async player=>{
      callbackAttempts++;
      if(message.barrier&&callbackAttempts===1)await new Promise(resolve=>{release=resolve;process.send({type:'loaded',pid:process.pid,version:player._version});});
      if(message.operation==='canonical.advance'){
        const result=ensurePersistentPlayerYard(player,{now:message.now,simulate:true});
        return {status:result.status,body:{error:result.error}};
      }
      return applyActionWithReceipt(player,message.action,message.payload,{clientActionId:message.clientActionId,serverNow:message.now});
    });
    process.send(message.loseResponse?{type:'response-lost',pid:process.pid,callbackAttempts}:{type:'result',pid:process.pid,callbackAttempts,outcome});
  }catch(error){process.send({type:'failure',message:error.stack||error.message});process.exitCode=1;}
  finally{Date.now=clock;running=false;await closeDb();process.disconnect();}
});
try{
  assert.ok(initDb(),'Real PostgreSQL required');await ensureDbSchema();
  const [db]=await getDb()`SELECT current_database() AS name,current_user AS username,current_setting('server_version_num')::int AS version`;
  assert.equal(db.name,'ccgh_merge_ci');assert.equal(db.username,'ccgh_merge_ci');assert.ok(db.version>=150000&&db.version<160000,'PostgreSQL15 required');
  process.send({type:'ready',pid:process.pid});
}catch(error){process.send({type:'failure',message:error.stack||error.message});process.exitCode=1;await closeDb();process.disconnect();}
