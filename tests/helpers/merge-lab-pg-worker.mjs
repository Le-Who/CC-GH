/** Separate OS process: actual db.js + playerManager.js; no module hooks/mocks or memory fallback. */
import {assertDisposableMergeDatabase,assertFixturePlayerId} from './merge-lab-pg-guard.mjs';
assertDisposableMergeDatabase();
if(process.env.MERGE_LAB_PG_WORKER!=='1'||!process.send)throw new Error('This fixture worker must be launched by the guarded CI suite');
const {initDb,ensureDbSchema,getDb,closeDb}=await import('../../db.js');
const {withPlayerLock}=await import('../../playerManager.js');
const {executeMergeLab,MERGE_LAB_RELEASE_POLICY}=await import('../../game-logic/merge-lab-service.js');
const policy={...MERGE_LAB_RELEASE_POLICY,enabled:true};
let waitingRelease=null,running=false;
async function finish(){await closeDb();if(process.connected)process.disconnect();}
process.on('message',async message=>{
 if(message?.type==='release'&&waitingRelease){const resolve=waitingRelease;waitingRelease=null;resolve();return;}
 if(message?.type!=='execute'||running)return;
 running=true;
 try{
  assertFixturePlayerId(message.playerId);let callbackAttempts=0;
  const outcome=await withPlayerLock(message.playerId,async player=>{
   callbackAttempts++;
   if(message.barrier&&callbackAttempts===1){
    await new Promise(resolve=>{waitingRelease=resolve;process.send({type:'loaded',version:player._version});});
   }
   return executeMergeLab(player,message.payload,{now:message.now,policy});
  });
  process.send({type:'result',callbackAttempts,outcome:{ok:outcome.ok,result:outcome.result,error:outcome.error,replayed:outcome.replayed}});
 }catch(error){process.send({type:'failure',message:error.message,stack:error.stack});process.exitCode=1;}
 finally{await finish();}
});
try{
 if(!initDb())throw new Error('Actual PostgreSQL initialization failed');
 await ensureDbSchema();
 const rows=await getDb()`SELECT current_database() AS name`;
 if(rows[0]?.name!=='ccgh_merge_ci')throw new Error('Wrong disposable database');
 process.send({type:'ready'});
}catch(error){process.send({type:'failure',message:error.message});process.exitCode=1;await finish();}
