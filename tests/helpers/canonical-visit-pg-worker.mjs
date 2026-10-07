import {guard,ownerGuard,verify} from './canonical-visit-pg-guard.mjs';
guard();
const {initDb,ensureDbSchema,closeDb}=await import('../../db.js');
const sql=initDb();await ensureDbSchema();await verify(sql);
const {withPlayerLock,afterPlayerCommit}=await import('../../playerManager.js');
const {stageCanonicalVisitPreparation,createCanonicalVisitReconciler}=await import('../../game-logic/yard-v2/canonical-visit-reconciliation.mjs');
let now=1001;Date.now=()=>now;let releases=new Map();
const send=value=>process.send?.(value);
const service=createCanonicalVisitReconciler({onObservation:value=>send({type:'observation',value})});
const warn=console.warn;console.warn=(...args)=>{if(String(args[0]).startsWith('[OCC] Retry'))send({type:'occ-retry',text:String(args[0])});warn(...args);};
process.on('message',async m=>{
 if(m.type==='release'){releases.get(m.id)?.();releases.delete(m.id);return;}
 try{
  if(m.type==='close'){await service.close();await closeDb();send({type:'reply',id:m.id,value:'closed'});process.disconnect();return;}
  ownerGuard(m.owner);if(!Number.isSafeInteger(m.now)||m.now<0)throw Error('TIME_REQUIRED');now=m.now;
  let value;
  if(m.type==='stage'){
   let attempts=0;
   value=await withPlayerLock(m.owner,async p=>{
    attempts++;
    if(attempts===1){send({type:'barrier',id:m.id,version:p._version});await new Promise(resolve=>releases.set(m.id,resolve));}
    const staged=stageCanonicalVisitPreparation(p,{slotId:'canonical:a',at:1000});
    if(staged.state==='pending')service.register(p);
    afterPlayerCommit(p,()=>{send({type:'winning-hook',id:m.id,attempts});});
    return staged;
   });
  }else if(m.type==='recover')value=await service.recover(m.owner);
  else throw Error('UNKNOWN_COMMAND');
  send({type:'reply',id:m.id,value});
 }catch(e){send({type:'reply',id:m.id,error:String(e.stack)});}
});
send({type:'ready'});
