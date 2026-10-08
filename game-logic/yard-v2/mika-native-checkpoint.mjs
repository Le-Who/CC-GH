/** One server-validated native settled pose, outside the visit/economy runtime.
 * Mutations use the ordinary command receipt transaction. No clock advancement,
 * visitor admission, inventory, food, reward or client-authored pose is allowed. */
import {bindMikaPersistedItems} from '../../src/games/companion-yard-v2/mika-qa/mika-item-approach.mjs';
import {resolveYardDisplay} from './legacy-presentation.mjs';
import {MIKA_ITEM_FOOTPRINTS,MIKA_SCENE_ENTRY} from './mika-item-geometry.mjs';
import {foodVesselExclusion} from './food-media.mjs';
import {MIKA_NATIVE_SETTLED_SOURCE_HASH,MIKA_NATIVE_RECIPE_MAX_CHARS,
  validateMikaNativeAction,reconstructMikaNativeSettled} from './mika-native-settled-recipe.mjs';
import {nativeMikaCheckpointCapability} from './availability.mjs';
import {clone,digest,integer} from './util.mjs';

export const MIKA_NATIVE_CHECKPOINT_ACTION='yard.saveNativeMikaCheckpoint';
export const MIKA_NATIVE_CHECKPOINT_FORMAT='native-mika-settled-checkpoint/v1';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const owns=(value,key)=>Object.hasOwn(value||{},key);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>owns(value,key));
const text=value=>typeof value==='string'&&value.length>0&&value.length<=128&&!/[\u0000-\u001f]/u.test(value);
const hash=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const boundedJson=value=>typeof value==='string'&&value.length>0&&value.length<=MIKA_NATIVE_RECIPE_MAX_CHARS;
const fail=reason=>({ok:false,reason});
const scene=Object.freeze({entry:MIKA_SCENE_ENTRY,footprints:MIKA_ITEM_FOOTPRINTS,exclusions:[foodVesselExclusion()]});
const recordFields=['format','version','revision','accountId','layoutHash','sourceHash','checkpointJson','actionId','savedAt'];
const payloadFields=['version','accountId','layoutHash','sourceHash','priorRevision','recipeJson'];

/** Build the same strict native binding from authoritative saved fields. The
 * display validator first refuses bad/legacy anchors; the shared binding then
 * checks exact source footprints and all real visitors/canonical placements. */
export function bindAuthoritativeMikaCheckpoint(state) {
  const yard=state?.player?.yard,runtime=state?.runtime;
  if(!object(yard)||!object(runtime)||!text(state.player?.id)||!Array.isArray(yard.activeVisitors)
    ||yard.activeVisitors.length||!object(runtime.visits))return fail('NATIVE_ITEM_RUNTIME_UNSUPPORTED');
  if(Object.values(runtime.visits).some(row=>!object(row)||['active','unsupported-legacy'].includes(row.status)))
    return fail('NATIVE_ITEM_RUNTIME_UNSUPPORTED');
  const display=resolveYardDisplay(yard,{scene,legacyAnchors:runtime.legacyPlacementAnchors});
  const snapshot={player:{id:state.player.id},yard,yardRuntime:{version:1,revision:'persistent-mika/r1',
    status:'ready',mutable:true,canonicalPlacements:runtime.canonicalPlacements||[],visits:[],reservations:[],
    display:{ok:display.ok,issues:display.issues}}};
  const view={yard,props:(yard.placedGoodies||[]).map(row=>({...row,supported:true,drawStandalone:true,
    reserved:false,transform:{x:row.x,y:row.y,rotationZ:row.rotationZ??0}})),pets:[],legacy:[]};
  const bound=bindMikaPersistedItems(snapshot,view);
  return bound.ok&&!bound.binding.items.length?fail('NATIVE_ITEM_TARGET_UNAVAILABLE'):bound;
}

function inspectRecord(value,bound) {
  if(!exact(value,recordFields)||value.format!==MIKA_NATIVE_CHECKPOINT_FORMAT||value.version!==1
    ||!integer(value.revision)||value.revision<1||!text(value.accountId)||!hash(value.layoutHash)
    ||!hash(value.sourceHash)||!boundedJson(value.checkpointJson)
    ||typeof value.actionId!=='string'||!/^yard-v2:[A-Za-z0-9_.:-]{1,112}$/.test(value.actionId)||!integer(value.savedAt)
    ||value.savedAt>8640000000000000)return fail('NATIVE_MIKA_CHECKPOINT_REQUIRES_REVIEW');
  if(value.accountId!==bound.binding.accountId)return fail('NATIVE_MIKA_ACCOUNT_CHANGED');
  if(value.sourceHash!==MIKA_NATIVE_SETTLED_SOURCE_HASH)return fail('NATIVE_MIKA_SOURCE_CHANGED');
  if(value.layoutHash!==digest(bound.key))return fail('NATIVE_MIKA_LAYOUT_CHANGED');
  const rebuilt=reconstructMikaNativeSettled(value.checkpointJson,bound);
  return rebuilt.ok?{ok:true,record:value}:fail(rebuilt.reason||'NATIVE_MIKA_CHECKPOINT_REQUIRES_REVIEW');
}

/** No raw malformed/future checkpoint is exposed, deleted or treated as absent.
 * Reconstruct only the compact endpoint, never a route sweep or history chain. */
export function publicMikaNativeCheckpoint(state,options={}) {
  const capability=nativeMikaCheckpointCapability(options),present=owns(state?.runtime,'nativeMikaCheckpoint');
  const base={...capability,sourceHash:MIKA_NATIVE_SETTLED_SOURCE_HASH,layoutHash:null,priorRevision:null,
    status:'blocked',hasCheckpoint:present};
  if(!capability.enabled)return{capabilities:base,checkpoint:null};
  let bound;
  try{bound=bindAuthoritativeMikaCheckpoint(state);}catch{return{capabilities:{...base,blockedReason:'NATIVE_ITEM_RUNTIME_UNSUPPORTED'},checkpoint:null};}
  if(!bound.ok)return{capabilities:{...base,blockedReason:bound.reason},checkpoint:null};
  base.layoutHash=digest(bound.key);
  if(!present)return{capabilities:{...base,status:'absent',priorRevision:0},checkpoint:null};
  let inspected;
  try{inspected=inspectRecord(state.runtime.nativeMikaCheckpoint,bound);}catch{inspected=fail('NATIVE_MIKA_CHECKPOINT_REQUIRES_REVIEW');}
  if(!inspected.ok)return{capabilities:{...base,blockedReason:inspected.reason},checkpoint:null};
  return{capabilities:{...base,status:'ready',priorRevision:inspected.record.revision},checkpoint:clone(inspected.record)};
}

/** Receipting/cloning belongs to applyYardAction, and committing both the record
 * and receipt belongs to the fresh locked player service. This mutates only the
 * supplied private working copy after every fence and recipe has passed. */
export function applyMikaNativeCheckpoint(state,payload,{now,actionId,...options}={}) {
  const reject=error=>({status:409,error});
  if(!nativeMikaCheckpointCapability(options).enabled)return reject('NATIVE_MIKA_CHECKPOINT_DISABLED');
  if(!exact(payload,payloadFields)||payload.version!==1||!text(payload.accountId)||!hash(payload.layoutHash)
    ||!hash(payload.sourceHash)||!integer(payload.priorRevision)||!boundedJson(payload.recipeJson))
    return{status:400,error:'INVALID_NATIVE_MIKA_CHECKPOINT_PAYLOAD'};
  let bound;
  try{bound=bindAuthoritativeMikaCheckpoint(state);}catch{return reject('NATIVE_ITEM_RUNTIME_UNSUPPORTED');}
  if(!bound.ok)return reject(bound.reason);
  if(payload.accountId!==bound.binding.accountId)return reject('NATIVE_MIKA_ACCOUNT_CHANGED');
  if(payload.sourceHash!==MIKA_NATIVE_SETTLED_SOURCE_HASH)return reject('NATIVE_MIKA_SOURCE_CHANGED');
  if(payload.layoutHash!==digest(bound.key))return reject('NATIVE_MIKA_LAYOUT_CHANGED');
  let previous=null;
  if(owns(state.runtime,'nativeMikaCheckpoint')) {
    let inspected;
    try{inspected=inspectRecord(state.runtime.nativeMikaCheckpoint,bound);}catch{inspected=fail('NATIVE_MIKA_CHECKPOINT_REQUIRES_REVIEW');}
    if(!inspected.ok)return reject(inspected.reason);
    previous=inspected.record;
  }
  if(payload.priorRevision!==(previous?.revision??0))return reject('NATIVE_MIKA_CHECKPOINT_REVISION_CONFLICT');
  if(payload.priorRevision>=Number.MAX_SAFE_INTEGER)return reject('NATIVE_MIKA_CHECKPOINT_REVISION_EXHAUSTED');
  let validated;
  try{validated=validateMikaNativeAction(payload.recipeJson,bound,previous?.checkpointJson??null);}
  catch{return{status:400,error:'INVALID_NATIVE_MIKA_ACTION_RECIPE'};}
  if(!validated.ok)return{status:400,error:validated.reason||'INVALID_NATIVE_MIKA_ACTION_RECIPE'};
  if(!boundedJson(validated.checkpointJson))return reject('NATIVE_MIKA_CHECKPOINT_BUDGET');
  const checkpoint={format:MIKA_NATIVE_CHECKPOINT_FORMAT,version:1,revision:payload.priorRevision+1,
    accountId:bound.binding.accountId,layoutHash:payload.layoutHash,sourceHash:MIKA_NATIVE_SETTLED_SOURCE_HASH,
    checkpointJson:validated.checkpointJson,actionId,savedAt:now};
  state.runtime.nativeMikaCheckpoint=checkpoint;
  return{status:200,extras:{nativeMikaCheckpoint:clone(checkpoint)}};
}
