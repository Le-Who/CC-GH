/** Lossless action adapter, bound to the current release game-logic/yard.js catalog.
 * No production normalizer, API or storage write. The host must atomically
 * persist the returned state and its unpruned command receipt under CAS. */
import {advancePersistentYard,persistentOptions,resolvePersistentDisplay} from './orchestrator.mjs';
import {applyPrototypeAction,isReserved} from './simulation.mjs';
import {FOUNDATION_FORMAT} from './migration.mjs';
import {YARD_FOODS,YARD_GOODIES,YARD_VISITORS,YARD_REMODELS,YARD_EXPANSIONS,YARD_SPECIES,YARD_SLOT_LAYOUTS} from './catalog.mjs';
import {clone,digest,hash32,integer,assertInteger,addCount,lookup,put,deepFreeze,workingCopy} from './util.mjs';
import {hexToBase64url} from './sha256.mjs';
import {isCanonicalItemIntent,isCanonicalItemNonce,canonicalItemGate,applyCanonicalItemAction,CANONICAL_LOCATION} from './canonical-locations.mjs';

const receiptPolicy='Required stable actionId; digest(action,payload); exact old player receipt replay before simulation; new intent must use yard-v2: nonce; mismatch409; state+receipt must commit atomically';
const contract=(payload,effects,extras,guards=[],deviations=[])=>({payload,effects,extras,guards,deviations,receiptPolicy});
export const ACTION_CONTRACTS=deepFreeze({
 'yard.buyFood':contract({foodId:'source food id',qty:'Number, floor, clamp1..9; default1'},['spend source food.cost ×qty in yard.currencies only','increment foodInventory'],['foodId','qty'],['known food','sufficient Yard currency','safe integer ownership']),
 'yard.setFood':contract({foodId:'source food id',bowlId:'default bowl-1'},['consume one owned food','set source servings and duration'],['foodId','bowlId'],['known food','existing bowl','food owned'],['persistent admission/media gate replaces request-partition-dependent legacy simulation']),
 'yard.buyGoodie':contract({goodieId:'source goodie id'},['spend exact source goodie.cost','increment goodieInventory by1'],['goodieId'],['known purchasable source goodie','sufficient Yard currency']),
 'yard.placeGoodie':contract({goodieId:'source goodie id',slotId:'explicit or deterministic source free id',x:'finite coordinate; source static slot fallback',y:'finite coordinate; source static slot fallback'},['consume one owned goodie','append new placement'],['goodieId','slotId','x','y','placement'],['capacity','ownership','unique slot','footprint/exclusion/connectivity'],['invalid coordinates rejected rather than silently clamped','Merge-only ownership remains unplaced until supported']),
 'yard.moveGoodie':contract({slotId:'placed slot; source goodieId fallback',goodieId:'optional source fallback',x:'finite coordinate',y:'finite coordinate'},['update selected x/y'],['goodieId','slotId','x','y','placement'],['actual reservation release','footprint/exclusion/connectivity'],['no silent coordinate clamp']),
 'yard.pickupGoodie':contract({slotId:'placed slot; source goodieId fallback',goodieId:'optional source fallback'},['remove selected placement','return one goodie to inventory'],['goodieId','slotId'],['actual reservation release']),
 'yard.fixGoodie':contract({slotId:'placed slot; source goodieId fallback',goodieId:'optional source fallback'},['spend source goodie.fixCost','set condition new and uses0'],['goodieId','slotId'],['placed known goodie','actual reservation release','not already fresh','sufficient Yard currency']),
 'yard.collectGifts':contract({},['claim each pending gift once through giftLedger','credit Yard currencies only'],['collected','receipt'],['unambiguous gifts','legacy claim receipts must be reconciled'],['never truncate pending gifts; core gift ledger preserves exact-once claims']),
 'yard.capturePhoto':contract({visitId:'active visit; source visitorId OR fallback',visitorId:'active or discovered source visitor',caption:'String, trim, UTF16 slice48'},['append source-compatible deterministic photo'],['photo'],['source visitor active or present in petbook'],['retain every old photo; no80-photo truncation']),
 'yard.favoritePhoto':contract({photoId:'existing photo id'},['set photo.favorite flags','set album.favoritePhotoId'],['photoId'],['photo exists'],['unknown photo metadata retained']),
 'yard.setRemodel':contract({remodelId:'source remodel id'},['purchase only if not owned','select remodel'],['remodelId'],['no active reservation for a changed remodel','existing anchors valid under new mask/connectivity','sufficient Yard currency'],['reject incompatible layout before payment; never move/remove saved placements']),
 'yard.buyExpansion':contract({},['spend source expansion2 cost','set level2 and helper.unlocked','append missing bowl-2'],['expansionLevel'],['level1','sufficient Yard currency'],['preserve existing bowl objects/unknown fields; no normalizeBowls recreation','persistent legacy-slot anchors retain their imported coordinates across expansion']),
 'yard.claimDailyLetter':contract({},['claim UTC ISO date','increment stamps','credit35 treats; every5th adds1 shinyTreat and1 berry_plate'],['reward','stamps'],['one claim per UTC date','safe integer counters']),
 'yard.configureCompanion':contract({name:'String fallback current/Buddy, trim, UTF16 slice16',species:'known species or keep current',skinId:'String fallback current/species, UTF16 slice40',helperAutoRefill:'boolean applied only when unlocked',preferredFoodId:'known source food only'},['update named companion/helper fields'],['companion','helper'],['nonblank resulting name'],['preserve all unknown companion/helper fields']),
});

const RECEIPT_FORMAT='yard-action-receipt/v1';
const delegated=new Set(['yard.setFood','yard.placeGoodie','yard.moveGoodie','yard.pickupGoodie','yard.collectGifts']);
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const own=(o,k)=>Object.hasOwn(o||{},k);
const sourceString=v=>String(v||'');
const timeId=(prefix,now,seed)=>`${prefix}_${now.toString(36)}_${hash32(seed).toString(36)}`;
function safeTarget(value,label){if(!record(value))throw new TypeError(`malformed ${label}; requires review`);return value;}
function safeArray(value,label){if(!Array.isArray(value))throw new TypeError(`malformed ${label}; requires review`);return value;}
function pay(yard,cost={}) {
 safeTarget(yard.currencies,'yard currencies');
 for(const key of ['treats','shinyTreats'])assertInteger(yard.currencies[key],`currency ${key}`);
 if(['treats','shinyTreats'].some(k=>yard.currencies[k]<(cost[k]||0)))return false;
 for(const key of ['treats','shinyTreats'])yard.currencies[key]-=cost[key]||0;
 return true;
}
function credit(yard,reward){for(const key of ['treats','shinyTreats'])assertInteger(yard.currencies[key]+(reward[key]||0),`currency ${key}`);for(const key of ['treats','shinyTreats'])yard.currencies[key]+=reward[key]||0;}
function placedFor(yard,payload){const slot=sourceString(payload.slotId);return yard.placedGoodies.find(p=>p.slotId===slot||p.goodieId===payload.goodieId);}
function reserved(state,slotId,now){return Object.values(state.runtime.visits).some(r=>(slotId===undefined||r.slotId===slotId)&&isReserved(r,now));}
function legacyQuantity(value){const n=Number(value);return Math.max(1,Math.min(9,Math.floor(Number.isFinite(n)?n:1)));}

/** options.now is authoritative deterministic time; payload.now is never a clock.
 * options.advance exists for pure test bindings; normal callers use orchestrator.
 * Rejected known commands are also receipted, so retry cannot later spend money. */
export function applyYardAction(input,action,payload={},options={}) {
 const actionId=options.actionId,now=options.now;
 const rawFailure=(status,error,details)=>({status,error,...(details?{details}:{}),state:input});
 if(input?.format!==FOUNDATION_FORMAT||input.runtime?.version!==1||input.player?.schemaVersion!==11)return rawFailure(409,'UNSUPPORTED_STORED_VERSION');
 if(typeof actionId!=='string'||!actionId.trim())return rawFailure(400,'ACTION_ID_REQUIRED');
 if(!record(payload))return rawFailure(400,'INVALID_ACTION_PAYLOAD');
 if(!own(ACTION_CONTRACTS,action))return rawFailure(400,'unknown yard action');
 if(!input?.runtime||(own(input.runtime,'commandReceipts')&&!record(input.runtime.commandReceipts)))return rawFailure(409,'COMMAND_RECEIPTS_REQUIRE_REVIEW');
 let requestHash;try{requestHash=digest({action,payload});}catch{return rawFailure(400,'INVALID_ACTION_PAYLOAD');}
 const prior=lookup(input.runtime.commandReceipts,actionId);
 if(prior!==undefined){
  if(!record(prior)||prior.format!==RECEIPT_FORMAT||prior.actionId!==actionId||!integer(prior.at)||![200,400,409].includes(prior.status))return rawFailure(409,'COMMAND_RECEIPT_REQUIRES_REVIEW');
  if(prior.action!==action||prior.requestHash!==requestHash)return rawFailure(409,'ACTION_ID_PAYLOAD_CONFLICT');
  return{state:input,status:prior.status,...(prior.error?{error:prior.error}:{}),...(prior.details?{details:clone(prior.details)}:{}),
   ...(prior.extras?{extras:clone(prior.extras)}:{}),receipt:clone(prior),replayed:true};
 }
 const oldStore=input.player?._actionReceipts;
 if(oldStore!==undefined&&(!record(oldStore)||!Array.isArray(oldStore.items)))return rawFailure(409,'LEGACY_RECEIPTS_REQUIRE_REVIEW');
 const legacy=(oldStore?.items||[]).filter(r=>r?.clientActionId===actionId);
 if(legacy.length){
  const legacyHash=hexToBase64url(requestHash);
  if(legacy.some(r=>r.action!==action||r.payloadHash!==legacyHash))return rawFailure(409,'LEGACY_ACTION_ID_PAYLOAD_CONFLICT');
  return{status:200,state:input,replayed:true,legacyReplay:true,receipt:clone(legacy.at(-1)),extras:clone(legacy.at(-1).extras||{})};
 }
 if(lookup(input.runtime.actionReceipts,actionId)!==undefined)return rawFailure(409,'LEGACY_CLAIM_RECEIPT_REQUIRES_RECONCILIATION');
 const canonicalIntent=isCanonicalItemIntent(payload,actionId);
 if(canonicalIntent&&!isCanonicalItemNonce(actionId))return rawFailure(409,'CANONICAL_NONCE_REQUIRED');
 if(!canonicalIntent&&!/^yard-v2:[A-Za-z0-9_.:-]{1,112}$/.test(actionId))return rawFailure(409,'LEGACY_NONCE_REQUIRES_NEW_PROTOCOL_INTENT');
 if(!integer(now)||now<input.runtime.cursorMs||now>8640000000000000)return rawFailure(400,'INVALID_ACTION_TIME');
 if(canonicalIntent){
  const gate=canonicalItemGate(action,payload,options);
  if(gate)return rawFailure(409,gate);
  // Canonical item operations do not advance or rewrite the historical scene.
  // The existing old-yard clock catches up through its ordinary entry points.
  const state=workingCopy(input),result=applyCanonicalItemAction(state,action,payload,{now});
  const next=result.status===200?state:workingCopy(input);next.runtime.commandReceipts??={};
  const receipt={format:RECEIPT_FORMAT,actionId,action,requestHash,at:now,status:result.status,
   ...CANONICAL_LOCATION,...(result.error?{error:result.error}:{}),...(result.extras?{extras:clone(result.extras)}:{})};
  put(next.runtime.commandReceipts,actionId,receipt);
  return {...result,state:next,receipt:clone(receipt)};
 }
 // Old clients could choose arbitrary slot IDs, including "canonical:". Keep
 // existing and queued legacy intents intact, but never let their slot lookup
 // or goodie-ID fallback collide with a real canonical placement.
 if(['yard.placeGoodie','yard.moveGoodie','yard.pickupGoodie','yard.fixGoodie'].includes(action)
  && input.runtime.canonicalPlacements?.some(row=>row.slotId===sourceString(payload.slotId)))
  return rawFailure(409,'CANONICAL_LOCATION_REQUIRED');
 if(options.actionPolicy){
  const availability=options.actionPolicy({action,payload:clone(payload),player:input.player});
  if(availability?.ok!==true){
   const state=workingCopy(input);state.runtime.commandReceipts??={};
   const receipt={format:RECEIPT_FORMAT,actionId,action,requestHash,at:now,status:409,
    error:availability?.code||'YARD_BINDING_REQUIRED',details:{reason:availability?.reason||'ACTION_POLICY_REJECTED'}};
   put(state.runtime.commandReceipts,actionId,receipt);
   return{status:409,error:receipt.error,details:clone(receipt.details),state,receipt:clone(receipt)};
  }
 }

 let advanced;
 try{
  advanced=(options.advance||advancePersistentYard)(input,now,options);
  if(advanced.runtime.cursorMs!==now)throw new Error('orchestrator must finish at requested authoritative time');
 }catch(error){return rawFailure(400,'STATE_REQUIRES_REVIEW',String(error.message));}
 const state=workingCopy(advanced),yard=state.player.yard;
 const fail=(error,details)=>({status:400,error,...(details?{details}:{}),state:advanced});
 const ok=(extras={})=>({status:200,state,extras});
 let result;
 try{
  if(delegated.has(action)){
   let forwarded={...payload},extra={};
   if(action==='yard.setFood'){
    const foodId=sourceString(payload.foodId),bowlId=String(payload.bowlId||'bowl-1');
    if(!lookup(YARD_FOODS,foodId))result=fail('unknown food');
    else if(!yard.bowls.some(b=>b.id===bowlId))result=fail('unknown bowl');
    else if(!(lookup(yard.foodInventory,foodId)>0))result=fail('food not owned');
    forwarded={...payload,foodId,bowlId};extra={foodId,bowlId};
   }else if(['yard.moveGoodie','yard.pickupGoodie'].includes(action)){
    const placed=placedFor(yard,payload);
    if(!placed)result=fail('goodie not placed');
    else if(reserved(state,placed.slotId,now))result=fail('visitor is using this goodie');
    else{forwarded.slotId=placed.slotId;extra={goodieId:placed.goodieId,slotId:placed.slotId};}
   }else if(action==='yard.placeGoodie'){
    const goodieId=sourceString(payload.goodieId),goodie=lookup(YARD_GOODIES,goodieId);
    if(!goodie)result=fail('unknown goodie');
    else{
     const slotId=sourceString(payload.slotId),slot=(YARD_SLOT_LAYOUTS[yard.expansion.level>=2?2:1]||[]).find(s=>s.id===slotId);
     const hasCoordinates=Number.isFinite(Number(payload.x))&&Number.isFinite(Number(payload.y));
     if(!hasCoordinates&&slot){if(goodie.size==='large'&&slot.size!=='large')result=fail('invalid placement');else forwarded={...payload,x:slot.x,y:slot.y};}
     else if(!hasCoordinates)result=fail('invalid placement');
     forwarded.goodieId=goodieId;forwarded.slotId=slotId||timeId('free',now,`${goodie.id}:${payload.x}:${payload.y}:${yard.placedGoodies.length}`);
    }
   }
   if(!result){
    if(['yard.placeGoodie','yard.moveGoodie'].includes(action)){forwarded.x=Number(forwarded.x);forwarded.y=Number(forwarded.y);}
    // Same completed cursor + same options: the core's repeated advance has no
    // interval to process and cannot admit a visitor outside the media gate.
    result=applyPrototypeAction(advanced,action,forwarded,{...persistentOptions(options,advanced),now,actionId});
    if(result.status===200){
     result.extras={...result.extras,...extra};
     if(result.extras.placement)Object.assign(result.extras,{goodieId:result.extras.placement.goodieId,slotId:result.extras.placement.slotId,x:result.extras.placement.x,y:result.extras.placement.y});
     if(action==='yard.collectGifts')result.extras.collected=clone(result.extras.receipt.collected);
    }
   }
  }else switch(action){
   case'yard.buyFood':{
    const foodId=sourceString(payload.foodId),food=lookup(YARD_FOODS,foodId),qty=legacyQuantity(payload.qty);
    if(!food){result=fail('unknown food');break;}
    const cost={treats:(food.cost.treats||0)*qty,shinyTreats:(food.cost.shinyTreats||0)*qty};
    safeTarget(yard.foodInventory,'food inventory');assertInteger((lookup(yard.foodInventory,foodId)||0)+qty,'food count');
    if(!pay(yard,cost)){result=fail('not enough yard currency');break;}
    addCount(yard.foodInventory,foodId,qty);result=ok({foodId,qty});break;
   }
   case'yard.buyGoodie':{
    const goodieId=sourceString(payload.goodieId),goodie=lookup(YARD_GOODIES,goodieId);
    if(!goodie){result=fail('unknown goodie');break;}
    safeTarget(yard.goodieInventory,'goodie inventory');assertInteger((lookup(yard.goodieInventory,goodieId)||0)+1,'goodie count');
    if(!pay(yard,goodie.cost)){result=fail('not enough yard currency');break;}
    addCount(yard.goodieInventory,goodieId,1);result=ok({goodieId});break;
   }
   case'yard.fixGoodie':{
    const placed=placedFor(yard,payload);if(!placed){result=fail('goodie not placed');break;}
    if(reserved(state,placed.slotId,now)){result=fail('visitor is using this goodie');break;}
    if(placed.condition==='new'){result=fail('goodie is already fresh');break;}
    const goodie=lookup(YARD_GOODIES,placed.goodieId);if(!goodie){result=fail('unknown goodie requires review');break;}
    if(!pay(yard,goodie.fixCost)){result=fail('not enough yard currency');break;}
    placed.condition='new';placed.uses=0;result=ok({goodieId:placed.goodieId,slotId:placed.slotId});break;
   }
   case'yard.capturePhoto':{
    safeTarget(yard.album,'album');safeArray(yard.album.photos,'album photos');
    const visitId=sourceString(payload.visitId),visitorId=sourceString(payload.visitorId);
    const visit=yard.activeVisitors.find(v=>v.visitId===visitId||v.visitorId===visitorId);
    const finalVisitorId=visit?.visitorId||(visitorId&&lookup(yard.petbook,visitorId)?visitorId:null);
    if(!finalVisitorId||!lookup(YARD_VISITORS,finalVisitorId)){result=fail('visitor not available');break;}
    const photo={id:timeId('photo',now,`${finalVisitorId}:${visit?.visitId||'portrait'}:${yard.album.photos.length}`),visitorId:finalVisitorId,
     goodieId:visit?.goodieId||null,pose:visit?.pose||'portrait',remodel:yard.remodel,capturedAt:now,caption:String(payload.caption||'').trim().slice(0,48),favorite:false};
    if(yard.album.photos.some(p=>p?.id===photo.id)){result=fail('photo id conflict requires review');break;}
    yard.album.photos.push(photo);result=ok({photo});break;
   }
   case'yard.favoritePhoto':{
    safeTarget(yard.album,'album');safeArray(yard.album.photos,'album photos');const photoId=sourceString(payload.photoId);
    if(!yard.album.photos.some(p=>p?.id===photoId)){result=fail('photo not found');break;}
    for(const photo of yard.album.photos)if(record(photo))photo.favorite=photo.id===photoId;
    yard.album.favoritePhotoId=photoId;result=ok({photoId});break;
   }
   case'yard.setRemodel':{
    const remodelId=sourceString(payload.remodelId),remodel=lookup(YARD_REMODELS,remodelId);
    if(!remodel){result=fail('unknown remodel');break;}
    safeArray(yard.ownedRemodels,'owned remodels');
    if(remodelId!==yard.remodel&&Object.values(state.runtime.visits).some(r=>isReserved(r,now)||r.status==='active'&&now<r.leavesAt)){result=fail('visitor is using this yard');break;}
    const layout=resolvePersistentDisplay(state,{scene:options.scene,yardOverride:{...yard,remodel:remodelId}}).geometry;
    if(!layout.ok){result=fail('remodel would invalidate placements',layout.errors);break;}
    if(!yard.ownedRemodels.includes(remodelId)){
     if(!pay(yard,remodel.cost)){result=fail('not enough yard currency');break;}
     yard.ownedRemodels.push(remodelId);
    }
    yard.remodel=remodelId;result=ok({remodelId});break;
   }
   case'yard.buyExpansion':{
    safeTarget(yard.expansion,'expansion');safeTarget(yard.helper,'helper');safeArray(yard.bowls,'bowls');
    if(yard.expansion.level>=2){result=fail('yard already expanded');break;}
    if(yard.expansion.level!==1||!yard.bowls.some(b=>b.id==='bowl-1')){result=fail('expansion state requires review');break;}
    if(!pay(yard,YARD_EXPANSIONS[2].cost)){result=fail('not enough yard currency');break;}
    yard.expansion.level=2;yard.helper.unlocked=true;
    if(!yard.bowls.some(b=>b.id==='bowl-2'))yard.bowls.push({id:'bowl-2',foodId:null,servings:0,placedAt:null,expiresAt:null});
    result=ok({expansionLevel:2});break;
   }
   case'yard.claimDailyLetter':{
    safeTarget(yard.dailyLetter,'daily letter');const date=new Date(now).toISOString().slice(0,10);
    if(yard.dailyLetter.lastClaimedDate===date){result=fail('daily letter already claimed');break;}
    const stamps=assertInteger(yard.dailyLetter.stamps+1,'daily stamps'),reward={treats:35,shinyTreats:stamps%5===0?1:0};
    if(stamps%5===0)assertInteger((lookup(yard.foodInventory,'berry_plate')||0)+1,'berry_plate count');
    credit(yard,reward);if(stamps%5===0)addCount(yard.foodInventory,'berry_plate',1);
    yard.dailyLetter.lastClaimedDate=date;yard.dailyLetter.stamps=stamps;result=ok({reward,stamps});break;
   }
   case'yard.configureCompanion':{
    safeTarget(yard.companion,'companion');safeTarget(yard.helper,'helper');
    const name=String(payload.name||yard.companion.name||'Buddy').trim().slice(0,16);
    if(!name){result=fail('invalid companion name');break;}
    const species=YARD_SPECIES.includes(payload.species)?payload.species:yard.companion.species;
    Object.assign(yard.companion,{name,species,skinId:String(payload.skinId||yard.companion.skinId||species).slice(0,40)});
    if(yard.helper.unlocked&&typeof payload.helperAutoRefill==='boolean')yard.helper.autoRefill=payload.helperAutoRefill;
    if(lookup(YARD_FOODS,payload.preferredFoodId))yard.helper.preferredFoodId=payload.preferredFoodId;
    result=ok({companion:clone(yard.companion),helper:clone(yard.helper)});break;
   }
  }
 }catch(error){result=fail('ACTION_STATE_REQUIRES_REVIEW',String(error.message));}
 const next=workingCopy(result.state);next.runtime.commandReceipts??={};
 const receipt={format:RECEIPT_FORMAT,actionId,action,requestHash,at:now,status:result.status,
  ...(result.error?{error:result.error}:{}),...(result.details?{details:clone(result.details)}:{}),...(result.extras?{extras:clone(result.extras)}:{})};
 put(next.runtime.commandReceipts,actionId,receipt);
 return{...result,state:next,receipt:clone(receipt)};
}
