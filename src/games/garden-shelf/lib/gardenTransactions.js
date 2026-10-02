export const GARDEN_RECEIPT_WINDOW_MS = 72 * 60 * 60 * 1000;
const coordinators = new Map();
const transient = result => ['NETWORK_ERROR','TIMEOUT','GARDEN_REQUEST_UNCONFIRMED'].includes(result?.error) || Number(result?._httpStatus)>=500;
const definite = result => result?.error && !transient(result) && !['GARDEN_INTENT_AMBIGUOUS','GARDEN_INTENT_CONFLICT','GARDEN_INTENT_SUPERSEDED','GARDEN_ACCOUNT_CHANGED','GARDEN_ACCOUNT_MISMATCH'].includes(result.error);
const problem = error => ({error,success:false});

/** Caller owns retry identity. Payload and ID are persisted before transport.
 * Pending/queued results are never treated as a server acknowledgment. */
export function createGardenTransactionCoordinator({accountId,storage,transport,reconcile,now=Date.now,uuid=()=>globalThis.crypto.randomUUID(),withLock=fn=>fn(),isCurrentAccount=()=>true}) {
  if(!accountId)throw Error('Garden transactions require a verified account');
  const key=`game_hub_garden_intents_v1:${encodeURIComponent(accountId)}`;
  let tail=Promise.resolve();
  const read=()=>{
    const raw=storage.getItem(key);if(!raw)return {version:1,accountId,streamId:uuid(),nextSequence:1,pending:null};
    const record=JSON.parse(raw);
    if(record.version!==1||record.accountId!==accountId||!Number.isSafeInteger(record.nextSequence))throw Error('Garden intent storage is invalid');
    return record;
  };
  const save=record=>storage.setItem(key,JSON.stringify(record));
  const serial=fn=>{
    const job=tail.catch(()=>{}).then(()=>withLock(fn)).catch(()=>problem('GARDEN_STORAGE_UNAVAILABLE'));tail=job.catch(()=>{});return job;
  };
  const acknowledge=(record,pending,result)=>{
    if(result?.error||result?.pending||result?.receiptConfirmed!==true||result.clientActionId!==pending.clientActionId)return false;
    record.pending=null;record.nextSequence=pending.payload.intent.sequence+1;record.lastAcknowledgedAt=now();save(record);return true;
  };
  async function send(record) {
    if (!isCurrentAccount()) return problem('GARDEN_ACCOUNT_CHANGED');
    const pending=record.pending;if(!pending)return {success:true,noPending:true};
    if(now()-pending.payload.intent.createdAt>GARDEN_RECEIPT_WINDOW_MS){
      let status;try{status=await reconcile(pending);}catch{return problem('NETWORK_ERROR');}
      if(status?.intentStatus==='applied'){
        const confirmed={...status,receiptConfirmed:true};acknowledge(record,pending,confirmed);return confirmed;
      }
      if(status?.intentStatus!=='notApplied')return status?.error?status:problem('GARDEN_INTENT_AMBIGUOUS');
    }
    let result;try{result=await transport(pending.action,pending.payload,{clientActionId:pending.clientActionId,durability:'receipt',outbox:false,key:pending.clientActionId});}catch{return problem('NETWORK_ERROR');}
    if(acknowledge(record,pending,result))return result;
    if(result?.pending||!result?.error)return problem('GARDEN_REQUEST_UNCONFIRMED');
    if(definite(result)){
      // A rejected mutation has no receipt and no economic effect. Retain the
      // stream sequence but clear the rejected payload before a new intent.
      record.pending=null;save(record);
    }
    return result;
  }
  return {
    key,
    recover:()=>serial(async()=>{try{return await send(read());}catch{return problem('GARDEN_STORAGE_UNAVAILABLE');}}),
    execute:(action,payload)=>serial(async()=>{
      if (!isCurrentAccount()) return problem('GARDEN_ACCOUNT_CHANGED');
      let record;try{record=read();}catch{return problem('GARDEN_STORAGE_UNAVAILABLE');}
      if(record.pending){
        const previous=record.pending;const result=await send(record);
        // Return the original acknowledged operation; never silently enqueue a
        // second purchase after recovering an ambiguous first purchase.
        return {...result,recoveredIntent:true,recoveredAction:previous.action};
      }
      if(record.lastAcknowledgedAt && now()-record.lastAcknowledgedAt>GARDEN_RECEIPT_WINDOW_MS){record.streamId=uuid();record.nextSequence=1;record.lastAcknowledgedAt=null;}
      const intent={accountId,streamId:record.streamId,sequence:record.nextSequence,createdAt:Math.floor(now())};
      record.pending={action,payload:structuredClone({...payload,intent}),clientActionId:`garden:${intent.streamId}:${intent.sequence}`};
      try{save(record);}catch{return problem('GARDEN_STORAGE_UNAVAILABLE');}
      try { return await send(record); } catch { return problem('GARDEN_STORAGE_UNAVAILABLE'); }
    }),
    abandonPending:({confirmed=false,expectedClientActionId=null}={})=>serial(async()=>{
      if(!confirmed)return problem('GARDEN_CONFIRMATION_REQUIRED');
      if(!isCurrentAccount())return problem('GARDEN_ACCOUNT_CHANGED');
      const record=read();
      if((record.pending?.clientActionId || null)!==expectedClientActionId)return problem('GARDEN_INTENT_CHANGED');
      if(record.pending)storage.setItem(`${key}:archive:${record.pending.clientActionId}`,JSON.stringify({accountId,archivedAt:now(),pending:record.pending}));
      record.pending=null;record.streamId=uuid();record.nextSequence=1;record.lastAcknowledgedAt=null;save(record);
      return {success:true,noPending:true};
    }),
    inspect:()=>read(),
  };
}

/** Reuse one account stream. Web Locks prevents a second browser tab overwriting
 * an unresolved payload in shared localStorage. Unsupported clients fail closed
 * for mutations rather than silently weakening cross-tab durability. */
export function getGardenTransactionCoordinator(accountId,transport,reconcile,isCurrentAccount=()=>true,readServerTime=()=>Date.now()) {
  if(!accountId)return null;
  if(coordinators.has(accountId))return coordinators.get(accountId);
  const locks=globalThis.navigator?.locks;
  const storage={getItem:key=>globalThis.localStorage.getItem(key),setItem:(key,value)=>globalThis.localStorage.setItem(key,value)};
  const withLock=locks?.request ? fn=>locks.request(`garden-accounting:${accountId}`,fn) : async()=>problem('GARDEN_CROSS_TAB_LOCK_UNAVAILABLE');
  let serverAnchor=Number(readServerTime())||Date.now(),localAnchor=performance.now();
  const now=()=>{const value=Number(readServerTime());if(Number.isFinite(value)&&value!==serverAnchor){serverAnchor=value;localAnchor=performance.now();}return Math.floor(serverAnchor+Math.max(0,performance.now()-localAnchor));};
  const coordinator=createGardenTransactionCoordinator({accountId,storage,transport,reconcile,withLock,isCurrentAccount,now});
  coordinators.set(accountId,coordinator);return coordinator;
}

/** Server economic fields win. Preserve monotonic local growth on the same
 * surviving plant and level; never resurrect sold plants or erase new claims. */
export function reconcileGardenCheckpoint(local,server) {
  const plants=new Map((local.plants||[]).map(plant=>[plant.id,plant]));
  const next={...server,plants:(server.plants||[]).map(plant=>{
    const previous=plants.get(plant.id);if(!previous||previous.type!==plant.type)return {...plant};
    const later=previous.phase>plant.phase||previous.phase===plant.phase&&previous.phaseProgress>plant.phaseProgress;
    return {...plant,...(later?{phase:previous.phase,phaseProgress:previous.phaseProgress}:{}),lastTapped:Math.max(previous.lastTapped||0,plant.lastTapped||0),lastWatered:Math.max(previous.lastWatered||0,plant.lastWatered||0)};
  })};
  next.totalGoldEarned=Math.max(local.totalGoldEarned||0,server.totalGoldEarned||0);
  if(local.level===server.level){next.xp=Math.max(local.xp||0,server.xp||0);next.levelReady=next.xp>=next.xpRequired;}
  next.lastTick=Math.max(local.lastTick||0,server.lastTick||0);
  return next;
}
