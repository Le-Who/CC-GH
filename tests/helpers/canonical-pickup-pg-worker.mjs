import {guard,ownerGuard,verify} from './canonical-visit-pg-guard.mjs';
import {setTimeout as delay} from 'node:timers/promises';
guard();
const {initDb,ensureDbSchema,closeDb}=await import('../../db.js');
const sql=initDb();await ensureDbSchema();await verify(sql);
const {withPlayerLock,afterPlayerCommit}=await import('../../playerManager.js');
const {ensureCanonicalPlayerYard,executeCanonicalYardAction,publicCanonicalPlayerYard,closeCanonicalRuntime}=await import('../../game-logic/yard-v2/canonical-runtime.mjs');
const {CANONICAL_FOOD_LOCATION,CANONICAL_FOOD_NONCE_PREFIX}=await import('../../game-logic/yard-v2/canonical-food-protocol.mjs');
let now=1001;Date.now=()=>now;
const releases=new Map(),send=value=>process.send?.(value);
const warn=console.warn;console.warn=(...args)=>{if(String(args[0]).startsWith('[OCC] Retry'))send({type:'occ-retry',text:String(args[0])});warn(...args);};
const payload={...CANONICAL_FOOD_LOCATION,slotId:'canonical:a'},actionId=CANONICAL_FOOD_NONCE_PREFIX+'pg-pickup-once';
process.on('message',async message=>{
 if(message.type==='release'){releases.get(message.id)?.();releases.delete(message.id);return;}
 try{
  if(message.type==='close'){await closeCanonicalRuntime();await closeDb();send({type:'reply',id:message.id,value:'closed'});process.disconnect();return;}
  ownerGuard(message.owner);if(!Number.isSafeInteger(message.now)||message.now<0)throw Error('TIME_REQUIRED');now=message.now;
  let value;
  if(message.type==='warm'){
   const end=performance.now()+60000;
   while(performance.now()<end){await withPlayerLock(message.owner,p=>{ensureCanonicalPlayerYard(p,{now,simulate:true});value=publicCanonicalPlayerYard(p,{now});});if(value.status==='ready'&&value.canonicalVisits?.length)break;await delay(20);}
   if(value.status!=='ready'||!value.canonicalVisits?.length)throw Error('PICKUP_WARM_TIMEOUT');
   value={status:value.status,rows:value.canonicalPlacements.length,visitId:value.canonicalVisits[0].visitId,leavesAt:value.canonicalVisits[0].plan.leavesAt};
  }else if(message.type==='pickup'||message.type==='replay'){
   let attempts=0;
   value=await withPlayerLock(message.owner,async p=>{
    attempts++;
    if(message.type==='pickup'&&attempts===1){send({type:'barrier',id:message.id,version:p._version});await new Promise(resolve=>releases.set(message.id,resolve));}
    const result=executeCanonicalYardAction(p,'yard.pickupGoodie',payload,{now,actionId});
    afterPlayerCommit(p,committed=>{const view=publicCanonicalPlayerYard(committed,{now});send({type:'winning-projection',id:message.id,attempts,replayed:result.replayed===true,status:view.status,rows:view.canonicalPlacements?.length,visitId:view.canonicalVisits?.[0]?.visitId});},{beforeSync:true});
    return result;
   });
  }else if(message.type==='tick')value=await withPlayerLock(message.owner,p=>ensureCanonicalPlayerYard(p,{now,simulate:true}));
  else throw Error('UNKNOWN_COMMAND');
  send({type:'reply',id:message.id,value});
 }catch(error){send({type:'reply',id:message.id,error:String(error.stack)});}
});
send({type:'ready'});
