/** A receipt is confirmed only by the current authoritative parked record.
 * The renderer owns preparation/restoration; this controller owns one nonce and
 * explicit retries. Nothing is persisted locally and no retry timer is started. */
const ACTION='yard.saveNativeMikaCheckpoint';
const FORMAT='native-mika-settled-checkpoint/v1';
const payloadFields=['version','accountId','layoutHash','sourceHash','priorRevision','recipeJson'];
const recordFields=['format','version','revision','accountId','layoutHash','sourceHash','checkpointJson','savedAt','actionId'];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const nonce=value=>typeof value==='string'&&/^yard-v2:[A-Za-z0-9_.:-]{1,112}$/.test(value);
const revision=value=>Number.isSafeInteger(value)&&value>=0;
function json(value){
 if(typeof value!=='string'||!value.length||value.length>16384)return false;
 try{return object(JSON.parse(value));}catch{return false;}
}
function authority(context){
 const runtime=context?.snapshot?.yardRuntime,cap=runtime?.nativeMikaCheckpointCapabilities;
 if(cap?.enabled!==true)return{enabled:false};
 const fail=reason=>({enabled:true,reason:reason||'NATIVE_MIKA_CHECKPOINT_REQUIRES_REVIEW'});
 if(cap.status==='blocked')return fail(cap.blockedReason);
 if(cap.version!==1||cap.action!==ACTION||cap.actionNoncePrefix!=='yard-v2:'
  ||!hash(cap.layoutHash)||!hash(cap.sourceHash)||!revision(cap.priorRevision)
  ||!context.accountId||context.snapshot?.player?.id!==context.accountId)return fail();
 const record=runtime.nativeMikaCheckpoint;
 if(cap.status==='absent')return record==null&&cap.priorRevision===0?{enabled:true,cap,record:null}:fail();
 if(cap.status!=='ready'||!exact(record,recordFields)||record.format!==FORMAT||record.version!==1
  ||!revision(record.revision)||record.revision<1||record.revision!==cap.priorRevision
  ||record.accountId!==context.accountId||record.layoutHash!==cap.layoutHash||record.sourceHash!==cap.sourceHash
  ||!nonce(record.actionId)||!revision(record.savedAt)||record.savedAt>8640000000000000||!json(record.checkpointJson))return fail();
 return{enabled:true,cap,record};
}
const same=(a,b)=>!!a&&!!b&&a.renderer===b.renderer&&a.accountId===b.accountId
 &&a.accountSession===b.accountSession&&a.ownerId===b.ownerId&&a.layoutKey===b.layoutKey;
const scopeOf=context=>context?{renderer:context.renderer,accountId:context.accountId,
 accountSession:context.accountSession,ownerId:context.ownerId,layoutKey:context.layoutKey}:null;
const ownsNative=(context,native)=>!!native&&native.available===true&&native.ownerId===context?.ownerId
 &&(native.accountId==null||native.accountId===context.accountId);
const terminal=native=>native.phase==='parked'&&revision(native.actionsStarted)
 &&native.presentedAction===native.actionsStarted&&Number.isFinite(native.duration)&&native.duration>=0
 &&Number.isFinite(native.presentedTime)&&native.presentedTime>=native.duration;

export function createNativeCheckpointCommand({readContext,send,publish=()=>{},createNonce=()=>globalThis.crypto.randomUUID()}){
 let scope=null,observed=false,pending=null,saved=null,fault=null,disposed=false;
 let state={phase:'idle',enabled:false,blocksMove:false,retryable:false};
 function emit(value){
  if(disposed)return;
  if(scope?.ownerId!=null)value={...value,ownerId:scope.ownerId};
  if(Object.keys(state).length===Object.keys(value).length&&Object.keys(value).every(key=>state[key]===value[key]))return;
  state=value;publish({...state});
 }
 const current=command=>!disposed&&pending===command&&same(command,readContext());
 const details=command=>({clientActionId:command.clientActionId,actionId:command.actionId,revision:command.priorRevision+1});
 function show(command,phase,reason){
  emit({phase,enabled:true,blocksMove:phase!=='saved'||command.inFlight,retryable:phase==='unconfirmed',
   ...details(command),...(reason?{reason}:{}),...(phase==='saved'?{restored:false}:{})});
 }
 function sync(){
  if(disposed)return{...state};
  const context=readContext();
  if(!observed||!same(scope,context)){
   observed=true;scope=scopeOf(context);pending=null;saved=null;fault=null;
   emit({phase:'idle',enabled:false,blocksMove:false,retryable:false});
  }
  const auth=authority(context);
  if(!auth.enabled){
   pending=null;saved=null;fault=null;emit({phase:'idle',enabled:false,blocksMove:false,retryable:false});return{...state};
  }
  if(auth.reason){
   emit({phase:'blocked',enabled:true,blocksMove:true,retryable:false,reason:auth.reason});return{...state};
  }
  if(fault){emit({phase:'blocked',enabled:true,blocksMove:true,retryable:false,reason:fault});return{...state};}
  if(pending){
   const command=pending;
   if(!ownsNative(context,context?.native)||context.native.actionsStarted!==command.actionId){
    pending=null;saved=null;fault='NATIVE_MIKA_OWNER_CHANGED';
    emit({phase:'blocked',enabled:true,blocksMove:true,retryable:false,reason:fault});return{...state};
   }
   const record=auth.record;
   if(command.payload&&record?.actionId===command.clientActionId&&record.revision===command.priorRevision+1
    &&record.accountId===command.accountId&&record.layoutHash===command.payload.layoutHash&&record.sourceHash===command.payload.sourceHash){
    command.acknowledged=true;saved=command;show(command,'saved');
    if(!command.inFlight)pending=null;
   }else if(auth.cap.layoutHash!==command.layoutHash||auth.cap.sourceHash!==command.sourceHash||auth.cap.priorRevision!==command.priorRevision){
    show(command,'blocked','NATIVE_MIKA_CHECKPOINT_REVISION_CONFLICT');
   }else if(!command.inFlight)show(command,'unconfirmed',command.reason||'NATIVE_MIKA_CHECKPOINT_UNCONFIRMED');
  }else if(state.phase==='saved'&&(auth.record?.actionId!==state.clientActionId||auth.record.revision!==state.revision)){
   fault='NATIVE_MIKA_CHECKPOINT_REPLACED';saved=null;
   emit({phase:'blocked',enabled:true,blocksMove:true,retryable:false,reason:fault});
  }else if(state.phase==='idle'||state.phase==='blocked'){
   emit({phase:'idle',enabled:true,blocksMove:false,retryable:false});
  }
  return{...state};
 }
 function live(command){
  if(!current(command))return false;
  sync();return current(command)&&state.phase!=='blocked'&&state.enabled;
 }
 async function attempt(command){
  if(!live(command))return{ok:false,reason:'NATIVE_MIKA_CHECKPOINT_CANCELLED'};
  if(command.inFlight)return{ok:false,reason:'NATIVE_MIKA_CHECKPOINT_PENDING'};
  command.inFlight=true;show(command,'saving');
  let result;
  try{
   if(!command.payload){
    const context=readContext();
    command.renderer.update?.(context.snapshot,{accountSession:command.accountSession});
    const prepared=await command.renderer.prepareMikaCheckpoint({ownerId:command.ownerId,accountId:command.accountId,
     accountSession:command.accountSession,clientActionId:command.clientActionId,actionId:command.actionId});
    if(!live(command))return{ok:false,reason:'NATIVE_MIKA_CHECKPOINT_CANCELLED'};
    if(!prepared?.ok)result={error:prepared?.reason||'NATIVE_MIKA_CHECKPOINT_UNAVAILABLE'};
    else if(prepared.actionId!=null&&prepared.actionId!==command.actionId||!exact(prepared.payload,payloadFields)
     ||prepared.payload.version!==1||prepared.payload.accountId!==command.accountId
     ||prepared.payload.layoutHash!==command.layoutHash||prepared.payload.sourceHash!==command.sourceHash
     ||prepared.payload.priorRevision!==command.priorRevision||!json(prepared.payload.recipeJson))result={error:'INVALID_NATIVE_MIKA_CHECKPOINT_PAYLOAD'};
    else command.payload=Object.freeze({...prepared.payload});
   }
   if(command.payload&&!result&&live(command))result=await send(ACTION,command.payload,command.options);
  }catch(error){result={error:typeof error?.code==='string'?error.code:'NATIVE_MIKA_CHECKPOINT_UNCONFIRMED'};}
  finally{
   command.inFlight=false;
   if(current(command)){
    command.reason=result?.error||'NATIVE_MIKA_CHECKPOINT_UNCONFIRMED';sync();
   }
  }
  if(disposed||!same(command,readContext())||pending!==command&&saved!==command)return{ok:false,reason:'NATIVE_MIKA_CHECKPOINT_CANCELLED'};
  return saved===command&&command.acknowledged?{ok:true,revision:command.priorRevision+1}
   :{ok:false,reason:command.reason||'NATIVE_MIKA_CHECKPOINT_UNCONFIRMED'};
 }
 function observe(native=readContext()?.native){
  sync();if(disposed||!state.enabled||state.phase==='blocked')return Promise.resolve({ok:false,reason:'NATIVE_MIKA_CHECKPOINT_UNAVAILABLE'});
  const context=readContext();
  if(!ownsNative(context,native)||!ownsNative(context,context?.native)||!terminal(native)||!terminal(context.native)
   ||native.actionsStarted!==context.native.actionsStarted)return Promise.resolve({ok:false,reason:'NATIVE_ACTOR_NOT_SETTLED'});
  if(pending)return Promise.resolve({ok:false,reason:'NATIVE_MIKA_CHECKPOINT_PENDING'});
  if(saved?.actionId===native.actionsStarted)return Promise.resolve({ok:true,revision:saved.priorRevision+1});
  const auth=authority(context),checkpoint=native.checkpoint;
  if(auth.record&&checkpoint?.savedAction===native.actionsStarted&&checkpoint.revision===auth.record.revision){
   emit({phase:'saved',enabled:true,blocksMove:false,retryable:false,actionId:native.actionsStarted,
    revision:auth.record.revision,clientActionId:auth.record.actionId,restored:checkpoint.restored===true});
   return Promise.resolve({ok:true,revision:auth.record.revision});
  }
  let clientActionId;
  try{const value=createNonce();if(typeof value==='string'&&value.length)clientActionId=value.startsWith('yard-v2:')?value:`yard-v2:${value}`;}catch{}
  if(!nonce(clientActionId)){
   fault='NATIVE_MIKA_CHECKPOINT_NONCE_UNAVAILABLE';
   emit({phase:'blocked',enabled:true,blocksMove:true,retryable:false,reason:fault});
   return Promise.resolve({ok:false,reason:'NATIVE_MIKA_CHECKPOINT_NONCE_UNAVAILABLE'});
  }
  const command=pending={...scopeOf(context),actionId:native.actionsStarted,clientActionId,
   priorRevision:auth.cap.priorRevision,layoutHash:auth.cap.layoutHash,sourceHash:auth.cap.sourceHash,
   payload:null,inFlight:false,acknowledged:false,
   options:Object.freeze({durability:'receipt',clientActionId,feedback:false,silent:true})};
  return attempt(command);
 }
 function retry(){
  sync();if(disposed||!pending||state.phase!=='unconfirmed')return Promise.resolve({ok:false,reason:'NATIVE_MIKA_CHECKPOINT_RETRY_UNAVAILABLE'});
  return attempt(pending);
 }
 return{sync,observe,retry,busy:()=>!disposed&&state.blocksMove,state:()=>({...state}),dispose(){disposed=true;pending=null;saved=null;scope=null;}};
}
