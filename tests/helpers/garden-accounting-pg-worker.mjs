import {assertDisposableGardenDatabase,assertGardenFixtureId} from './garden-accounting-pg-guard.mjs';
assertDisposableGardenDatabase();if(process.env.GARDEN_ACCOUNTING_PG_WORKER!=='1'||!process.send)throw Error('Guarded parent required');
const {initDb,ensureDbSchema,closeDb}=await import('../../db.js');
const {withPlayerLock}=await import('../../playerManager.js');
const {applyActionWithReceipt}=await import('../../routes/player.js');
let release,running=false;
process.on('message',async message=>{
 if(message?.type==='release'&&release){release();release=null;return;}
 if(message?.type!=='execute'||running)return;running=true;
 try{
  assertGardenFixtureId(message.playerId);let callbackAttempts=0;
  const outcome=await withPlayerLock(message.playerId,async player=>{
   callbackAttempts++;
   if(message.barrier&&callbackAttempts===1)await new Promise(resolve=>{release=resolve;process.send({type:'loaded',version:player._version});});
   return applyActionWithReceipt(player,message.action,message.payload,{clientActionId:message.clientActionId,serverNow:message.now});
  });process.send({type:'result',callbackAttempts,outcome});
 }catch(error){process.send({type:'failure',message:error.message});process.exitCode=1;}
 finally{await closeDb();process.disconnect();}
});
try{if(!initDb())throw Error('PG unavailable; no memory fallback');await ensureDbSchema();process.send({type:'ready'});}catch(error){process.send({type:'failure',message:error.message});process.exitCode=1;await closeDb();process.disconnect();}
