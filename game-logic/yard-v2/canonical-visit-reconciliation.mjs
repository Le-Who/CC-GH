/** Source-only, inactive durable preparation boundary. No route imports this module.
 * A selected opportunity is persisted, never rerolled. A notification is not
 * authority: re-enter the actual player manager, reconstruct its ABA-safe key,
 * and perform only synchronous cache/stock/reservation checks while locked.
 * Both source gates default off. The separately gated transaction owns the
 * qualified one-visit economic effects; preparation alone never grants them.
 */
import {withPlayerLock,afterPlayerCommit} from '../../playerManager.js';
import {createCanonicalVisitWorker} from './canonical-visit-worker.mjs';
import {VISIT_JOB_SOURCE_HASH,snapshotRequest,boundedJSON} from './canonical-visit-job-contract.mjs';
import {canonicalItemCapabilities} from './canonical-locations.mjs';
import {CANONICAL_VISIT_PRESENTATION_PROTOCOL,canonicalVisitPlacementRowsValid} from './canonical-visit-placement-contract.mjs';
import {canonicalFoodCapabilities,selectCanonicalFoodState} from './canonical-food-contract.mjs';
import {CANONICAL_FOOD_CONTRACT,canonicalFoodOverlap} from './canonical-food-protocol.mjs';
import {YARD_HOUR_MS,YARD_GOODIES,YARD_FOODS,getYardGoodieActivities} from './catalog.mjs';
import {selectOpportunity} from './opportunity-selection.mjs';
import {clone,digest,integer,compareText} from './util.mjs';
import {CANONICAL_VISIT_ADMISSION_ENABLED,CANONICAL_VISIT_WRAPPER,commitPreparedCanonicalVisit,completeReplayedCanonicalVisit,inspectReplayedCanonicalVisit} from './canonical-visit-transaction.mjs';

export const CANONICAL_RECONCILIATION_ENABLED=false;
export const CANONICAL_PENDING_FORMAT='yard-canonical-pending-preparation/v1';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const identity=v=>typeof v==='string'&&v.length>0&&v.length<=160;
const outcome=(code,extra={})=>({state:'unavailable',prepared:false,ready:false,admission:false,retryable:true,code,...extra});
const pending=extra=>({state:'pending',prepared:false,ready:false,admission:false,retryable:true,code:'RECONCILIATION_PENDING',...extra});
const sorted=rows=>clone(rows).sort((a,b)=>compareText(a.slotId,b.slotId));
const READ_ONLY_RESULT=Symbol('canonical.reconciliation.readOnly');
function withoutWrite(result,request=null){
 // The real PostgreSQL manager already owns this no-write abort seam. Its
 // test-only memory path rethrows; withReconciliationLock handles that form.
 const error=Error('EXPRESS_RESPONSE_ABORT');error.result={[READ_ONLY_RESULT]:true,result,request};throw error;
}
async function withReconciliationLock(ownerId,fn){
 try{return await withPlayerLock(ownerId,fn);}catch(error){if(error.result?.[READ_ONLY_RESULT])return error.result;throw error;}
}
const rowsValid=rows=>Array.isArray(rows)&&rows.length>0&&canonicalVisitPlacementRowsValid(rows);

function inspect(player){
 if(!object(player)||!identity(player.id)||!identity(player._version)||player.schemaVersion!==11)return outcome('OWNER_OR_VERSION_REQUIRED');
 const store=player._yardV2,runtime=store?.runtime,yard=player.yard;
 // There is deliberately no v1/v2 conversion, initialization or fallback.
 if(store?.format!=='yard-persistent/v1'||store.version!==3||!object(runtime)||runtime.version!==1||!object(yard))return outcome('CANONICAL_CONTAINER_V3_REQUIRED');
 if(!identity(runtime.seed)||!integer(runtime.cursorMs)||!integer(runtime.nextOpportunityAt)||runtime.nextOpportunityAt<=runtime.cursorMs
  ||!Array.isArray(yard.bowls)||yard.bowls.length!==1||!yard.bowls.every(object)||new Set(yard.bowls.map(b=>b.id)).size!==yard.bowls.length
  ||!rowsValid(runtime.canonicalPlacements))return outcome('CANONICAL_STATE_REQUIRES_REVIEW');
 // Conservative initial boundary: mixed or multi-visitor replay is unqualified.
 if(!Array.isArray(yard.placedGoodies)||yard.placedGoodies.length||!Array.isArray(yard.activeVisitors)
  ||!object(runtime.visits)||Object.values(runtime.visits).some(v=>!object(v)||!['completed','historical-unknown'].includes(v.status))
  ||!object(runtime.canonicalVisits)||Object.values(runtime.canonicalVisits).some(v=>!object(v)||!['active','completed'].includes(v.status)))return outcome('EXISTING_VISITS_UNQUALIFIED');
 const active=Object.values(runtime.canonicalVisits).filter(v=>v.status==='active');
 if(active.length>1||yard.activeVisitors.length!==active.length||runtime.canonicalPlacements.length!==1)return outcome('ONE_VISIT_QUALIFICATION_REQUIRED');
 return {player,store,runtime,yard};
}
export function inspectCanonicalPlayerState(player){
 try{
  const result=inspect(player);if(result.code)return result;
  const {runtime,yard}=result;
  if(!object(runtime.canonicalVisitReceipts)||!object(runtime.giftLedger)||!object(runtime.commandReceipts)
   ||!yard.bowls.every(b=>b.id===CANONICAL_FOOD_CONTRACT.bowlId&&(b.foodId===null
    ?b.servings===0&&b.placedAt===null&&b.expiresAt===null
    :Object.hasOwn(YARD_FOODS,b.foodId)&&integer(b.servings)&&b.servings>0&&b.servings<=YARD_FOODS[b.foodId].servings&&integer(b.placedAt)&&integer(b.expiresAt)&&b.expiresAt>b.placedAt)))return outcome('CANONICAL_STATE_REQUIRES_REVIEW');
  if(runtime.canonicalPending!==undefined){const current=currentRequest(player);if(current.code)return current;}
  return {valid:true};
 }catch{return outcome('CANONICAL_STATE_REQUIRES_REVIEW');}
}
function select(state,slotId,at){
 const {runtime,yard}=state;
 if(!rowsValid(runtime.canonicalPlacements)||!Array.isArray(yard.bowls)||!yard.bowls.every(object)||!integer(at))return null;
 const row=runtime.canonicalPlacements.find(r=>r.slotId===slotId);
 if(!row||runtime.nextOpportunityAt!==at||runtime.cursorMs>=at||runtime.canonicalPlacements.some(r=>r.placedAt>at))return null;
 const goodie=YARD_GOODIES[row.goodieId],available=getYardGoodieActivities(goodie,row.condition).sort((a,b)=>compareText(a.id,b.id));
 // Select from the unchanged full source pool. Do not filter unsupported media.
 const bowls=yard.bowls.filter(b=>integer(b.placedAt)&&b.placedAt<=at&&integer(b.expiresAt)&&b.expiresAt>at);
 const selection=selectOpportunity({seed:runtime.seed,at,placed:row,goodie,available,bowls,n:0});
 if(!selection)return null;
 const {visitor,activity,id,leavesAt,bowl}=selection;
 return {candidate:{visitId:id,visitorId:visitor.id,goodieId:row.goodieId,activityId:activity.id,slotId,arrivedAt:at,leavesAt},bowl:clone(bowl),rows:sorted(runtime.canonicalPlacements)};
}
function reservations(state){return digest({visits:state.runtime.visits,canonicalVisits:state.runtime.canonicalVisits??{},activeVisitors:state.yard.activeVisitors});}
function currentRequestUnchecked(player){
 const state=inspect(player);if(state.code)return state;
 const active=Object.values(state.runtime.canonicalVisits).filter(v=>v.status==='active');
 if(active.length){
  if(state.runtime.canonicalPending!==undefined)return outcome('AMBIGUOUS_UNRESOLVED_STATE');
  const wrapper=active[0],record=wrapper.proposal;
  if(wrapper.format!==CANONICAL_VISIT_WRAPPER||wrapper.sourceHash!==VISIT_JOB_SOURCE_HASH||!object(record)||!object(record.candidate)
   ||!object(record.before)||!Array.isArray(record.before.rows)||!object(record.before.bowl))return outcome('SAVED_VISIT_REQUIRES_REVIEW');
  const candidate=record.candidate;
  const selected=select({runtime:{...state.runtime,canonicalPlacements:record.before.rows,cursorMs:candidate.arrivedAt-1,nextOpportunityAt:candidate.arrivedAt},yard:{bowls:[record.before.bowl]}},candidate.slotId,candidate.arrivedAt);
  if(!selected||digest(selected.candidate)!==digest(candidate)||wrapper.eventId!==digest({ownerId:player.id,seed:state.runtime.seed,at:candidate.arrivedAt,slotId:candidate.slotId,n:0}))return outcome('SAVED_SELECTION_MISMATCH');
  const request={ownerId:player.id,operation:'restore',fence:{yardRevision:state.runtime.canonicalRevision??player._version,layoutRevision:digest(sorted(state.runtime.canonicalPlacements)),cursor:wrapper.eventId,reservationDigest:reservations(state)},
   input:{record:clone(record),rows:sorted(state.runtime.canonicalPlacements),serverNow:candidate.arrivedAt}};
  try{snapshotRequest(request,256*1024);}catch(error){return outcome(error.message);}
  return {state,wrapper,request};
 }
 const intent=state.runtime.canonicalPending;
 if(intent===undefined)return outcome('NO_UNRESOLVED_VISIT');
 if(!object(intent)||intent.format!==CANONICAL_PENDING_FORMAT||intent.ownerId!==player.id||intent.sourceHash!==VISIT_JOB_SOURCE_HASH
  ||!identity(intent.slotId)||!integer(intent.at)||!object(intent.input)||intent.eventId!==digest({ownerId:player.id,seed:state.runtime.seed,at:intent.at,slotId:intent.slotId,n:0}))return outcome('PENDING_INTENT_REQUIRES_REVIEW');
 const selected=select(state,intent.slotId,intent.at);
 // Exact current source selection, stock/lifetime and layout must still match.
 // A mutable save hash by itself never authenticates a selected candidate.
 if(!selected||digest(selected)!==digest(intent.input)||intent.reservationDigest!==reservations(state))return outcome('PENDING_STATE_OBSOLETE');
 if(selected.candidate.visitorId!=='pip_hamster'||selected.candidate.activityId!=='peek'||selected.bowl.id!==CANONICAL_FOOD_CONTRACT.bowlId
  ||!YARD_FOODS[selected.bowl.foodId]||!integer(selected.bowl.servings)||selected.bowl.servings<1)return outcome('SELECTED_CANDIDATE_UNSUPPORTED');
 const request={ownerId:player.id,operation:'prepare',fence:{yardRevision:state.runtime.canonicalRevision??player._version,layoutRevision:digest(selected.rows),cursor:intent.eventId,reservationDigest:reservations(state)},input:selected};
 try{snapshotRequest(request,256*1024);}catch(error){return outcome(error.message);}
 return {state,intent,request};
}

function currentRequest(player){try{return currentRequestUnchecked(player);}catch{return outcome('CANONICAL_STATE_REQUIRES_REVIEW');}}

/** Call only inside an actual player transaction, after its authoritative event
 * phase has expired food/refilled as needed. This bounded slice owns n=0 only.
 * No selection/no media support is reported to the future simulator owner; this
 * preparation boundary does not advance an event or create a rejection receipt.
 */
export function stageCanonicalVisitPreparation(player,{slotId,at}={}){
 if(!CANONICAL_RECONCILIATION_ENABLED)return outcome('RECONCILIATION_DISABLED');
 const checked=inspect(player);if(checked.code)return checked;
 if(checked.runtime.canonicalPending!==undefined){const current=currentRequest(player);return current.code?current:pending({eventId:current.intent?.eventId??current.wrapper?.eventId});}
 if(Object.values(checked.runtime.canonicalVisits).some(v=>v.status==='active'))return outcome('ACTIVE_VISIT_ALREADY_PRESENT');
 if(!identity(slotId)||!integer(at))return outcome('INVALID_OPPORTUNITY');
 const input=select(checked,slotId,at);if(!input)return outcome('NO_SELECTED_CANDIDATE');
 const target=input.rows.find(r=>r.slotId===slotId);
 if(target.uses+1>=YARD_GOODIES[target.goodieId].durability)return outcome('SELECTED_CANDIDATE_UNSUPPORTED');
 if(input.candidate.visitorId!=='pip_hamster'||input.candidate.activityId!=='peek'||input.bowl.id!==CANONICAL_FOOD_CONTRACT.bowlId)return outcome('SELECTED_CANDIDATE_UNSUPPORTED');
 if(input.candidate.leavesAt>=at+YARD_HOUR_MS)return outcome('CROSS_OPPORTUNITY_STAY_UNQUALIFIED');
 const intent={format:CANONICAL_PENDING_FORMAT,ownerId:player.id,sourceHash:VISIT_JOB_SOURCE_HASH,slotId,at,
  eventId:digest({ownerId:player.id,seed:checked.runtime.seed,at,slotId,n:0}),reservationDigest:reservations(checked),input};
 boundedJSON(intent,256*1024);
 checked.runtime.canonicalPending=intent;
 return pending({eventId:intent.eventId});
}

/** Fixed manager and worker imports prevent request-supplied authority callbacks.
 * onObservation is diagnostic only and runs outside the manager transaction.
 * The returned facade and its cache are process-local, not a durable scheduler.
 */
export function createCanonicalVisitReconciler({onObservation=()=>{}}={}){
 if(typeof onObservation!=='function')throw TypeError('INVALID_OBSERVER');
 const worker=createCanonicalVisitWorker({enabled:CANONICAL_RECONCILIATION_ENABLED});
 const notifications=new Set(),inflight=new Set(),validated=new Map();let closed=false;
 const observe=result=>{if(closed)return;try{onObservation(Object.freeze(result));}catch{ /* diagnostic failure cannot change state */ }};
 function queueRequest(request){
  setImmediate(()=>{
    if(closed)return;
    const handle=worker.enqueue(request);
    if(handle.completion){
     handle.completion.then(result=>{
      if(closed)return;
      if(!result.prepared&&result.state!=='refused'){observe(outcome(result.code||'WORKER_UNAVAILABLE',{ownerId:request.ownerId,key:handle.key}));return;}
      void notify(request.ownerId,handle.key);
     }).catch(()=>observe(outcome('NOTIFICATION_FAILED')));
    }else if(handle.prepared||handle.state==='refused')void notify(request.ownerId,handle.key);
    else observe(outcome(handle.code||'WORKER_UNAVAILABLE',{ownerId:request.ownerId,key:handle.key}));
   });
 }
 function register(player){
  if(closed)return outcome('RECONCILER_CLOSED');
  if(!CANONICAL_RECONCILIATION_ENABLED)return outcome('RECONCILIATION_DISABLED');
  const current=currentRequest(player);if(current.code)return current;
  // afterPlayerCommit still holds the mutex. Return undefined immediately, then
  // enqueue on the next event-loop turn, using the committed version/snapshot.
  afterPlayerCommit(player,committed=>{
   const fresh=currentRequest(committed);if(fresh.code){setImmediate(()=>observe(fresh));return;}
   const request=clone(fresh.request);
   queueRequest(request);
  });
  return pending({eventId:current.intent?.eventId??current.wrapper?.eventId});
 }
 function track(task){inflight.add(task);task.finally(()=>inflight.delete(task)).catch(()=>{});return task;}
 function notify(ownerId,key){return track(notifyOnce(ownerId,key));}
 async function notifyOnce(ownerId,key){
  if(closed)return outcome('RECONCILER_CLOSED');
  if(!CANONICAL_RECONCILIATION_ENABLED)return outcome('RECONCILIATION_DISABLED');
  if(!identity(ownerId)||typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))return outcome('INVALID_NOTIFICATION');
  const token=ownerId+':'+key;if(notifications.has(token))return pending({key});
  notifications.add(token);
  try{
   const completed=await withReconciliationLock(ownerId,player=>{
    const current=currentRequest(player);if(current.code)return withoutWrite(current);
    const evidence=worker.lookup(current.request,key);
    if(evidence.state==='refused'&&current.request.operation==='prepare'&&CANONICAL_VISIT_ADMISSION_ENABLED){
     const runtime=player._yardV2.runtime,intent=current.intent;
     runtime.canonicalVisitReceipts[intent.eventId]={eventId:intent.eventId,kind:'source-refused',at:intent.at,sourceHash:VISIT_JOB_SOURCE_HASH,sourceCode:evidence.sourceCode};
     runtime.cursorMs=intent.at;runtime.nextOpportunityAt=intent.at+YARD_HOUR_MS;player.yard.lastSimulatedAt=intent.at;delete runtime.canonicalPending;
     return {state:'refused',ready:true,prepared:false,admission:false,eventId:intent.eventId};
    }
    if(!evidence.prepared){
     // This intent is already durable. A stale notification must not write a
     // fresh account version: two processes would invalidate each other forever.
     // Release the read-only lock, then enqueue the observed committed snapshot.
     return withoutWrite(pending({ownerId,key:snapshotRequest(current.request,256*1024).key,reason:evidence.code||'CACHE_MISS'}),clone(current.request));
    }
    const record=evidence.artifact.record;
    if(current.request.operation==='restore'){
     const result=completeReplayedCanonicalVisit(player,evidence,{now:Date.now()});
     if(result.state==='active')afterPlayerCommit(player,committed=>{
      if(closed)return;
      const fresh=currentRequest(committed);
      if(!fresh.code){
       while(validated.size>=8)validated.delete(validated.keys().next().value);
       validated.set(ownerId,{version:committed._version,requestKey:snapshotRequest(fresh.request,256*1024).key,artifact:evidence.artifact,expiresAt:performance.now()+60000});
      }
     });
     if(result.state==='completed')afterPlayerCommit(player,()=>{validated.delete(ownerId);});
     return ['active','completed'].includes(result.state)?result:withoutWrite(result);
    }
    if(record.requiredContainerVersion!==3||record.authoritative!==false||record.economicIntent.committed!==false
     ||record.status!=='prepared-inactive'||digest(record.candidate)!==digest(current.request.input.candidate)
     ||digest(record.before.rows)!==digest(current.request.input.rows)||digest(record.before.bowl)!==digest(current.request.input.bowl))return withoutWrite(outcome('EVIDENCE_STATE_MISMATCH'));
    if(CANONICAL_VISIT_ADMISSION_ENABLED){
     const result=commitPreparedCanonicalVisit(player,evidence,{now:Date.now()});
     // Rehydrate the actually committed record through the worker. No captured
     // preparation result is retained as authority across the admission write.
     if(result.state==='admitted'){register(player);return result;}
     return withoutWrite(result);
    }
    // Preparation only. Keep durable intent, exact clock and every economic
    // field unchanged; retained completion artifacts never enter storage.
    return withoutWrite({state:'prepared-inactive',prepared:true,ready:false,admission:false,ownerId,key,eventId:current.intent.eventId,sourceHash:VISIT_JOB_SOURCE_HASH});
   });
   const result=completed?.[READ_ONLY_RESULT]?completed.result:completed;
   if(completed?.[READ_ONLY_RESULT]&&completed.request)queueRequest(completed.request);
   observe(result);return result;
  }catch(error){const result=outcome('RECONCILIATION_TRANSACTION_FAILED',{ownerId,key});observe(result);return result;}
  finally{notifications.delete(token);}
 }
 return Object.freeze({
  register,
  notify,
  async recover(ownerId){
   if(closed)return outcome('RECONCILER_CLOSED');
   if(!CANONICAL_RECONCILIATION_ENABLED)return outcome('RECONCILIATION_DISABLED');
   if(!identity(ownerId))return outcome('OWNER_REQUIRED');
   return track(withPlayerLock(ownerId,player=>register(player)));
  },
  /** Normal service tick. Only already replayed exact-key evidence can run
   * synchronous effects; cache misses enqueue after the winning commit. */
  advance(player,{now=Date.now()}={}){
   const current=currentRequest(player);if(current.code)return current;
   const cached=validated.get(player.id);
   if(current.wrapper&&cached&&cached.requestKey===snapshotRequest(current.request,256*1024).key&&cached.expiresAt>performance.now()){
    const result=completeReplayedCanonicalVisit(player,{state:'prepared',execution:{sourceHash:VISIT_JOB_SOURCE_HASH},artifact:cached.artifact},{now});
    if(result.state==='completed'){afterPlayerCommit(player,()=>validated.delete(player.id));return result;}
    if(result.state==='active'){
     // Expiry can change the semantic fence at commit. Reconstruct it from the
     // winning player, never from the pre-save snapshot.
     afterPlayerCommit(player,committed=>{
      const fresh=currentRequest(committed);if(closed||fresh.code||fresh.wrapper?.visitId!==current.wrapper.visitId||digest(fresh.request.input)!==digest(current.request.input))return;
      validated.set(player.id,{...cached,requestKey:snapshotRequest(fresh.request,256*1024).key});
     });
     return result;
    }
    return result;
   }
   return register(player);
  },
  /** Read-only qualified presentation. A cache miss is explicitly pending;
   * it must never be interpreted as an empty authoritative reservation set. */
  read(player,{now=Date.now()}={}){
   if(closed)return outcome('RECONCILER_CLOSED');
   const current=currentRequest(player);if(current.code)return current;
   if(!current.wrapper)return pending({eventId:current.intent.eventId});
   if(integer(now)&&(now>=current.wrapper.leavesAt||player.yard.bowls.some(b=>b.foodId&&integer(b.expiresAt)&&b.expiresAt<=now&&b.expiresAt>player._yardV2.runtime.cursorMs)))return pending({reason:'SOURCE_RECONCILIATION_DUE'});
   const cached=validated.get(player.id);
   if(!cached||cached.requestKey!==snapshotRequest(current.request,256*1024).key||cached.expiresAt<=performance.now())return pending({reason:'SOURCE_REPLAY_REQUIRED'});
   const valid=inspectReplayedCanonicalVisit(player,{state:'prepared',execution:{sourceHash:VISIT_JOB_SOURCE_HASH},artifact:cached.artifact},{now});
   if(!valid.valid)return valid;
   const {record,plan}=cached.artifact;
   if(!integer(now))return outcome('INVALID_PRESENTATION_TIME');
   const targetReserved=record.candidate.arrivedAt<=now&&now<record.releaseAt;
   const boxes=record.reservations.spatial.filter(r=>r.startMs<=now&&now<r.endMs).flatMap(r=>[clone(r.bodyEnvelope),clone(r.supportEnvelope)]);
   if(targetReserved)boxes.push(clone(record.reservations.target.rect));
   return {state:'active',prepared:true,ready:true,admission:false,visitId:current.wrapper.visitId,plan:clone(plan),targetReserved,boxes};
  },
  /** Isolated v3 serializer. Ordinary service/routes are not wired to this.
   * Mutable false keeps this qualification snapshot from authorizing commands. */
  project(player,{now=Date.now()}={}){
   const visit=this.read(player,{now});
   if(!visit.ready)return {version:1,storageVersion:3,canonicalVisitProtocol:CANONICAL_VISIT_PRESENTATION_PROTOCOL,status:'reconciliation-pending',mutable:false,error:visit.code||visit.reason||'SOURCE_REPLAY_REQUIRED'};
   const runtime={version:1,storageVersion:3,canonicalVisitProtocol:CANONICAL_VISIT_PRESENTATION_PROTOCOL,status:'ready',mutable:false,serverNow:now,
    canonicalPlacements:clone(player._yardV2.runtime.canonicalPlacements),foodLocationCapabilities:canonicalFoodCapabilities({canonicalFoodLocationEnabled:true}),
    itemPlacementCapabilities:canonicalItemCapabilities({canonicalItemPlacementEnabled:false,canonicalFoodLocationEnabled:true}),
    visits:[],canonicalVisits:[{visitId:visit.visitId,plan:visit.plan}],reservations:visit.boxes,targetReserved:visit.targetReserved};
   runtime.canonicalFoodState=selectCanonicalFoodState({yard:player.yard,yardRuntime:runtime});
   if(!runtime.canonicalFoodState.available)return {...runtime,status:'review-required',error:runtime.canonicalFoodState.reason};
   return runtime;
  },
  stats:()=>worker.stats(),
  async close(){closed=true;await worker.close();await Promise.allSettled([...inflight]);validated.clear();},
 });
}
