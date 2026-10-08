/** Authoritative Yard adapter. Call mutations only with a fresh player inside withPlayerLock.
 * The player remains the sole owner of Yard balances/inventory. _yardV2 stores the
 * clock, visit/gift/command receipts and ONE original Yard-input archive, never a
 * second player or wallet. Unknown versions are preserved, never normalized.
 */
import {releaseActionPolicy,supportedYardBindings} from './availability.mjs';
import {MIKA_NATIVE_CHECKPOINT_ACTION,publicMikaNativeCheckpoint} from './mika-native-checkpoint.mjs';
import { getYardServerOptions } from './yard-media.mjs';
import { presentationCompatibility } from './presentation-compatibility.mjs';
import { FOUNDATION_FORMAT } from './migration.mjs';
import { dispatchInput } from './dispatch.mjs';
import { applyYardAction, ACTION_CONTRACTS } from './actions.mjs';
import { advancePersistentYard, resolvePersistentDisplay } from './orchestrator.mjs';
import { visitPhase, isReserved } from './simulation.mjs';
import { clone, digest, integer, lookup, put } from './util.mjs';
import {canonicalStorageValid,canonicalItemCapabilities} from './canonical-locations.mjs';

import {canonicalFoodCapabilities,selectCanonicalFoodState} from './canonical-food-contract.mjs';
import {CANONICAL_RUNTIME_ENABLED,ensureCanonicalPlayerYard,publicCanonicalPlayerYard,executeCanonicalYardAction} from './canonical-runtime.mjs';

export const YARD_STORAGE_FORMAT = 'yard-persistent/v1';
export const YARD_SERVER_REVISION = 'persistent-mika/r1';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (o,k) => Object.hasOwn(o,k);
const failure = (error, details) => ({ status:409, error, ...(details ? {details} : {}), mutable:false });
const epoch = value => integer(value) && value <= 8640000000000000;
// Server-only development gate; HTTP payloads never become these options.
const checkpointOptions=options=>({nativeMikaCheckpointEnabled:globalThis.process?.env?.YARD_NATIVE_MIKA_CHECKPOINT_QA==='true',...options});
// Only an explicit current v3 container can enter the new source-owned runtime.
// No option, request field or saved capability can upgrade an old container.
const canonicalRuntimeOwns = (player,now) => CANONICAL_RUNTIME_ENABLED === true
  && object(player) && player.schemaVersion === 11 && epoch(now)
  && object(player._yardV2) && player._yardV2.format === YARD_STORAGE_FORMAT && player._yardV2.version === 3;

/** Select only inputs that belong to Yard. No Garden, Merge, shared wallet or player-wide backup. */
function yardInputs(player, retained=[]) {
  const selected = {schemaVersion:player.schemaVersion};
  for (const key of ['id','username','yard','pet','room']) if (has(player,key)) selected[key]=clone(player[key]);
  const store=player._actionReceipts;
  if (store !== undefined && (!object(store)||!Array.isArray(store.items))) selected._actionReceipts=clone(store);
  else {
    const rows=[...retained,...(store?.items||[])];
    // Keep all current nonce hashes for conflict detection; only Yard receipts retain outcome data.
    selected._actionReceipts={items:rows.map(row=>row?.action?.startsWith?.('yard.')?clone(row):{
      clientActionId:row?.clientActionId,action:row?.action,payloadHash:row?.payloadHash})};
  }
  return selected;
}
function archiveInputs(player) {
  const raw=yardInputs(player);
  if (object(raw._actionReceipts)&&Array.isArray(raw._actionReceipts.items))
    raw._actionReceipts.items=raw._actionReceipts.items.filter(row=>row?.action?.startsWith?.('yard.'));
  return raw;
}
function inspectStored(player,now) {
  if (!object(player)||!epoch(now)) return failure('INVALID_YARD_SERVER_INPUT');
  if (player.schemaVersion!==11) return failure('UNSUPPORTED_PLAYER_VERSION');
  const stored=player._yardV2;
  if (has(player,'_yardV2')) {
    if (!object(stored)||stored.format!==YARD_STORAGE_FORMAT||![1,2].includes(stored.version))
      return failure('UNSUPPORTED_YARD_STORAGE_VERSION');
    if (!object(stored.runtime)||!object(stored.migration)||!object(stored.migration.receipt)
      ||!object(stored.migration.rawBackup)||!Array.isArray(stored.legacyReceipts))
      return failure('MALFORMED_YARD_STORAGE');
    if (stored.version===1&&has(stored.runtime,'canonicalPlacements')
      ||stored.version===2&&!canonicalStorageValid(stored.runtime.canonicalPlacements,player.yard?.placedGoodies||[]))
      return failure('MALFORMED_CANONICAL_YARD_STORAGE');
    const state={format:FOUNDATION_FORMAT,player:yardInputs(player,stored.legacyReceipts),runtime:stored.runtime,migration:stored.migration};
    const result=dispatchInput(state,{now});
    return result.status===200?{status:200,state,stored,mutable:true}:failure(result.reason,result.issues);
  }
  // Missing and explicitly malformed are different. Never turn null/future Yard into a fresh grant.
  if (has(player,'yard')&&(!object(player.yard)||has(player.yard,'schemaVersion')))
    return failure('MALFORMED_OR_UNSUPPORTED_YARD_VERSION');
  const scoped=archiveInputs(player),result=dispatchInput(scoped,{now,seed:player.id||player.username||'yard'});
  if (result.status!==200) return failure(result.reason,result.issues||result.detail);
  return {status:200,state:result.state,stored:null,mutable:true};
}
function commitYard(player,state,previous) {
  player.yard=state.player.yard;
  player._yardV2={...(previous||{}),format:YARD_STORAGE_FORMAT,version:previous?.version===2||has(state.runtime,'canonicalPlacements')?2:1,
    revision:YARD_SERVER_REVISION,runtime:state.runtime,migration:state.migration,
    legacyReceipts:previous?.legacyReceipts||clone(state.migration.rawBackup?._actionReceipts?.items||[])};
}
/** Pure inspection/rehydration; does not normalize, advance, write or manufacture a backup per read. */
export function inspectPlayerYard(player,{now=Date.now()}={}) { return inspectStored(player,now); }

/** Initialize without advancing on load/snapshot projection. simulate=true owns server-time catch-up.
 * Invalid data stays on the player and is exposed as read-only by publicPersistentYard.
 */
export function ensurePersistentPlayerYard(player,{now=Date.now(),simulate=false,...options}={}) {
  if (canonicalRuntimeOwns(player,now)) return {...ensureCanonicalPlayerYard(player,{now,simulate}),yard:player.yard};
  const checked=inspectStored(player,now);
  if (checked.status!==200) return {...checked,yard:player?.yard};
  try {
    // A zero-interval advance captures legacy slot anchors once, with no economic tick.
    const at=simulate?Math.max(now,checked.state.runtime.cursorMs):checked.state.runtime.cursorMs;
    const state=advancePersistentYard(checked.state,at,{...getYardServerOptions(),...options});
    commitYard(player,state,checked.stored);
    return {status:200,mutable:true,yard:player.yard,state};
  } catch(error) { return {...failure('YARD_STATE_REQUIRES_REVIEW',String(error.message)),yard:player.yard}; }
}

/** All Yard mutations share one durable compound action-id namespace. Replay is read-only and
 * precedes clock advancement; results commit only yard/_yardV2, never a stale account clone.
 */
export function executePersistentYardAction(player,action,payload={}, {now=Date.now(),actionId,...options}={}) {
  if (action===MIKA_NATIVE_CHECKPOINT_ACTION&&player?._yardV2?.version===3) return failure('NATIVE_MIKA_STORAGE_VERSION_UNSUPPORTED');
  if (canonicalRuntimeOwns(player,now)) return executeCanonicalYardAction(player,action,payload,{...options,now,actionId});
  const checked=inspectStored(player,now);
  if (checked.status!==200) return checked;
  const effectiveNow=Math.max(now,checked.state.runtime.cursorMs);
  const configuration={...getYardServerOptions(),...checkpointOptions(options)};
  const actionPolicy=typeof options.actionPolicy==='function'?options.actionPolicy:
    candidate=>releaseActionPolicy({...candidate,mediaRegistry:configuration.mediaRegistry});
  const result=applyYardAction(checked.state,action,payload,{...configuration,actionPolicy,now:effectiveNow,actionId});
  if (!result.replayed && result.receipt) commitYard(player,result.state,checked.stored);
  return {status:result.status,error:result.error,details:result.details,extras:result.extras||{},
    replayed:result.replayed===true,legacyReplay:result.legacyReplay===true,
    ...(result.receipt?{receipt:result.receipt}: {})};
}

/** A generic action may not reuse an already committed Yard nonce. */
export function yardCommandConflict(player,action,actionId) {
  if (typeof actionId!=='string'||!has(player,'_yardV2')) return null;
  const stored=player._yardV2;
  if (!object(stored)||stored.format!==YARD_STORAGE_FORMAT
    || !([1,2].includes(stored.version) || CANONICAL_RUNTIME_ENABLED === true && stored.version === 3)) return null;
  if (lookup(stored.runtime?.commandReceipts,actionId)!==undefined
    ||lookup(stored.runtime?.actionReceipts,actionId)!==undefined
    ||stored.legacyReceipts?.some(r=>r?.clientActionId===actionId)) return 'ACTION_ID_PAYLOAD_CONFLICT';
  return null;
}

/** Legacy Merge grants historically accept partial Yard objects. Keep their additive
 * contract; only an existing v2/version marker invokes the full runtime guard.
 * The Merge domain still validates currency/count maps before any debit. */
export function inspectYardGrantTarget(player,{now=Date.now()}={}) {
  if (!object(player)) return failure('INVALID_YARD_GRANT_TARGET');
  if (has(player,'_yardV2')) return inspectStored(player,now);
  if (has(player,'schemaVersion')&&player.schemaVersion!==11) return failure('UNSUPPORTED_PLAYER_VERSION');
  if (has(player,'yard')&&(!object(player.yard)||has(player.yard,'schemaVersion')))
    return failure('MALFORMED_OR_UNSUPPORTED_YARD_VERSION');
  return {status:200,mutable:true};
}

/** Guard for external grants. Caller still owns its own receipt/epoch and atomic commit. */
export function requireMutablePlayerYard(player,options={}) {
  const result=ensurePersistentPlayerYard(player,options);
  if (result.status!==200 || result.mutable===false) {
    const code=result.error||'YARD_RUNTIME_READ_ONLY',error=new Error(code);
    error.code=code;error.status=result.status===200?409:result.status;throw error;
  }
  return result.yard;
}

/** Sanitized presentation. Receipts, raw backups and completed history never leave the server. */
export function publicPersistentYard(player,{now=Date.now(),scene,...options}={}) {
  if (canonicalRuntimeOwns(player,now)) return publicCanonicalPlayerYard(player,{now});
  const checked=inspectStored(player,now);
  if (checked.status!==200) return {version:1,revision:YARD_SERVER_REVISION,serverNow:now,status:'review-required',mutable:false,
    error:checked.error,issues:clone(checked.details||[]),visits:[],reservations:[],placementReadiness:[],
    canonicalPlacements:[],foodLocationCapabilities:canonicalFoodCapabilities(),itemPlacementCapabilities:canonicalItemCapabilities({canonicalItemPlacementEnabled:false})};
  const defaults=getYardServerOptions();
  const state=checked.state,display=resolvePersistentDisplay(state,{scene:scene||defaults.scene});
  const readiness=options.placementReadiness||defaults.placementReadiness;
  const registry=options.mediaRegistry||defaults.mediaRegistry,registryHash=digest(registry);
  const nativeCheckpoint=publicMikaNativeCheckpoint(state,checkpointOptions(options));
  const visits=Object.values(state.runtime.visits).filter(record=>['active','unsupported-legacy'].includes(record.status)).map(record=>({
    visitId:record.visitId,visitorId:record.original?.visitorId,slotId:record.slotId,activityId:record.activityId,
    original:clone(record.original),source:record.source,status:record.status,
    arrivedAt:record.arrivedAt,leavesAt:record.leavesAt,releaseAt:record.releaseAt,
    phase:visitPhase(record,now),reserved:isReserved(record,now),
    ...presentationCompatibility(record,registry,registryHash,options.actorProfiles||defaults.actorProfiles),
    placement:clone(record.placement),timeline:clone(record.timeline),route:clone(record.route),mediaAdmission:clone(record.mediaAdmission),
  }));
  return {version:1,revision:YARD_SERVER_REVISION,serverNow:now,cursorMs:state.runtime.cursorMs,status:'ready',mutable:true,
    visits,reservations:visits.filter(v=>v.reserved).map(v=>({visitId:v.visitId,slotId:v.slotId,releaseAt:v.releaseAt,
      boxes:clone(v.mediaAdmission?.plan?.reservationBoxes||[])})),
    display:{placements:display.placements,ok:display.ok,issues:display.issues},
    placementReadiness:typeof readiness==='function'?clone(readiness(display.yard)):[],
    actionProtocol:'yard-v2:', supportedActions:Object.keys(ACTION_CONTRACTS).filter(action=>action!==MIKA_NATIVE_CHECKPOINT_ACTION||nativeCheckpoint.capabilities.enabled),
    nativeMikaCheckpointCapabilities:nativeCheckpoint.capabilities,nativeMikaCheckpoint:nativeCheckpoint.checkpoint,
    canonicalPlacements:clone(state.runtime.canonicalPlacements||[]),itemPlacementCapabilities:canonicalItemCapabilities(options),
    foodLocationCapabilities:canonicalFoodCapabilities(options),
    canonicalFoodState:selectCanonicalFoodState({yard:state.player.yard,yardRuntime:{version:1,status:'ready',canonicalPlacements:state.runtime.canonicalPlacements||[],foodLocationCapabilities:canonicalFoodCapabilities(options)}}),
    supportedBindings:supportedYardBindings(registry)};
}
