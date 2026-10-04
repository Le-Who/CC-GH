/** Production boundary candidate. All calls that mutate a player MUST run inside withPlayerLock.
 * This module does not access storage, authenticate users, or claim distributed atomicity.
 * Recovered preview economics live in merge-lab-domain.js without release-policy changes.
 */
import {randomUUID} from 'node:crypto';
import { inspectReleasedYardGrantTarget as inspectYardGrantTarget } from './yard-v2/player-release.mjs';
import {MERGE_LAB_CATALOG} from './merge-lab-catalog.js';
import {MergeLabError, MERGE_LAB_ACTION_FIELDS, compileMergeLabCatalog, createMergeLabState,
  validateMergeLabPlayer, createMergeLabQuote, applyMergeLabAction, hashCanonical} from './merge-lab-domain.js';
import {migrateMergeLabPlayer} from './merge-lab-migration.js';

export const MERGE_LAB_INITIAL_PROJECT_ID = 'night_beacon';
export const MERGE_LAB_RELEASE_POLICY = Object.freeze({
  version: 'merge-v3-staging-1',
  enabled: true, // Release composition: V3 enabled with preserved legacy archive and balances.
  migrationMode: 'clean-start', // Approved release: archive pre-V3 Merge and start fresh.
  yardV3ProjectsEnabled: false,
});
// Kept private: callers cannot mutate the shared validated Map indexes.
// Custom catalogs are still compiled and validated on every call.
const releaseCatalogIndex = compileMergeLabCatalog(MERGE_LAB_CATALOG);

const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const own = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
const assert = (condition,code,message,status=409) => {if(!condition)throw new MergeLabError(code,message,status);};
const cleanClone = value => structuredClone(value);
const validEpoch = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{16,120}$/.test(value);

export function labReleasePolicy(policy = MERGE_LAB_RELEASE_POLICY) {
  assert(isObject(policy),'INVALID_RELEASE_POLICY','Missing release policy',500);
  assert(['preserve','clean-start'].includes(policy.migrationMode),'INVALID_RELEASE_POLICY','Invalid migration choice',500);
  return {version:String(policy.version),enabled:policy.enabled===true,migrationMode:policy.migrationMode,yardV3ProjectsEnabled:policy.yardV3ProjectsEnabled===true};
}

function captureLegacy(player) {
  const archive = {merge: cleanClone(player.merge)};
  for(const key of ['mergeBoard','mergeInventory'])if(own(player,key))archive[key]=cleanClone(player[key]);
  if(isObject(player.inventory))for(const key of ['mergeItems','mergeInventory']){
    if(own(player.inventory,key)){
      archive.inventory ??= {};
      archive.inventory[key]=cleanClone(player.inventory[key]);
    }
  }
  return archive;
}

/** Additive to the saved player. Never delete legacy board, progress, aliases or unknown fields.
 * The frozen legacy sources are inaccessible to old Merge mutation endpoints after activation.
 * Full-account restore/reset procedures must preserve or rotate _mergeLabFence in their transaction.
 */
export function ensureMergeLabState(player, {now=Date.now(),policy=MERGE_LAB_RELEASE_POLICY,catalog=MERGE_LAB_CATALOG,newEpoch=randomUUID}={}) {
  const release=labReleasePolicy(policy);
  assert(release.enabled,'MERGE_LAB_DISABLED','The new workshop is not enabled for this release',503);
  assert(isObject(player),'INVALID_PLAYER','Player data is missing',500);
  const compiled=catalog===MERGE_LAB_CATALOG?releaseCatalogIndex:compileMergeLabCatalog(catalog);
  const fence=player._mergeLabFence;
  if(fence){
    assert(isObject(fence)&&validEpoch(fence.epoch)&&Number.isSafeInteger(fence.highWaterRevision)&&fence.highWaterRevision>=0,'INVALID_RESET_FENCE','Merge reset fence is invalid');
    assert(player.merge?.schemaVersion===3 && player.merge.serverEpoch===fence.epoch,'MERGE_RESET_FENCED','Merge reset needs an approved archive and a new server epoch');
    assert(player.merge.mergeRevision>=fence.highWaterRevision,'MERGE_RESET_FENCED','Merge revision moved backwards');
    validateMergeLabPlayer(player,compiled);
    return {migrated:false,policy:release};
  }
  assert(!player.merge?.serverEpoch,'MISSING_RESET_FENCE','Existing Merge epoch is missing its persistent fence');
  const trial=cleanClone(player);
  const previous=isObject(player.merge)?player.merge:{};
  assert(previous.schemaVersion===undefined || Number.isSafeInteger(previous.schemaVersion)&&previous.schemaVersion>=0&&previous.schemaVersion<=3,'MERGE_SCHEMA_REVIEW_REQUIRED','A malformed or newer Merge schema requires an explicit migration review');
  let report;
  if(previous.schemaVersion===3){
    report={alreadyMigrated:true};
  }else if(release.migrationMode==='clean-start'){
    const initial=createMergeLabState(catalog,{now:0}); // Same first free-charge claim as a fresh account.
    // Explicit option only: archive old progression and balances; keep legacy fields frozen.
    trial.merge={...previous,...initial,migration:{
      mode:'clean-start',completedAt:now,legacyStateFrozen:true,
      archive:captureLegacy(player),report:{cleanStart:true,convertedUnits:0},
    }};
    report=trial.merge.migration.report;
  }else{
    const recovered=migrateMergeLabPlayer(player,catalog,{now});
    // The recovered migration replaces merge/deletes aliases. Our boundary deliberately retains them.
    trial.merge={...previous,...recovered.player.merge};
    trial.merge.migration={...trial.merge.migration,mode:'preserve',legacyStateFrozen:true};
    report=recovered.report;
  }
  if(previous.schemaVersion!==3){
    // Keep extension metadata in recognized namespaces; authored domain fields still win.
    // Invalid/unknown inventory entries remain losslessly archived/quarantined, never spendable.
    for(const key of ['knowledge','projects','supply','rewards','ui']){
      if(isObject(previous[key])&&isObject(trial.merge[key]))trial.merge[key]={...previous[key],...trial.merge[key]};
    }
    const savedGoal=previous.projects?.selectedId;
    const keepSavedGoal=release.migrationMode!=='clean-start' && typeof savedGoal==='string' && compiled.projects.has(savedGoal);
    trial.merge.projects.selectedId=keepSavedGoal?savedGoal:MERGE_LAB_INITIAL_PROJECT_ID;
  }
  const epoch=newEpoch();
  assert(validEpoch(epoch),'INVALID_EPOCH','Server must provide a fresh stable epoch',500);
  trial.merge.serverEpoch=epoch;
  trial._mergeLabFence={epoch,highWaterRevision:trial.merge.mergeRevision,createdAt:now};
  validateMergeLabPlayer(trial,compiled); // No partial migration if preserved balances are malformed.
  player.merge=trial.merge;
  player._mergeLabFence=trial._mergeLabFence;
  return {migrated:previous.schemaVersion!==3,report:cleanClone(report),policy:release};
}

function checkYardGrantTarget(player,type,now) {
  const short=type?.startsWith('merge.')?type.slice(6):type;
  if (!['craftProject','exchange'].includes(short)) return;
  const checked=inspectYardGrantTarget(player,{now});
  assert(checked.status===200,checked.error||'YARD_STATE_REQUIRES_REVIEW','Yard save requires review before another grant');
}
function checkProjectPolicy(type,payload,catalog,policy){
  const short=type?.startsWith('merge.')?type.slice(6):type;
  assert(own(MERGE_LAB_ACTION_FIELDS,short),'INVALID_ACTION','Unsupported Merge action',400);
  if(short==='craftProject'){
    const project=catalog.projects.find(item=>item.id===payload?.projectId);
    if(project?.requiresYardV3===true)assert(policy.yardV3ProjectsEnabled,'YARD_UPDATE_REQUIRED','This project unlocks with the Yard update');
  }
  return short;
}

export function quoteMergeLab(player, type, parameters, {expectedMergeEpoch,now=Date.now(),policy=MERGE_LAB_RELEASE_POLICY,catalog=MERGE_LAB_CATALOG,...rest}={}) {
  const state=ensureMergeLabState(player,{now,policy,catalog,...rest});
  assert(expectedMergeEpoch===player.merge.serverEpoch,'MERGE_EPOCH_CONFLICT','Merge save changed; reload before a quote');
  const short=checkProjectPolicy(type,parameters,catalog,state.policy);
  checkYardGrantTarget(player,short,now);
  const quote=createMergeLabQuote(player,short,parameters,catalog,{now});
  // The original quote ID still commits to exact catalog/revision/terms. Epoch is a transport fence.
  return {...quote,serverEpoch:player.merge.serverEpoch,releasePolicyVersion:state.policy.version};
}

/** Mutates only a successful cloned domain outcome. Required command + epoch; generic TTL receipts are bypassed. */
export function executeMergeLab(player, payload, {now=Date.now(),policy=MERGE_LAB_RELEASE_POLICY,catalog=MERGE_LAB_CATALOG,...rest}={}) {
  try{
    const state=ensureMergeLabState(player,{now,policy,catalog,...rest});
    assert(isObject(payload),'INVALID_PAYLOAD','Merge payload must be an object',400);
    assert(Object.keys(payload).every(key=>['command','expectedMergeEpoch'].includes(key)),'INVALID_PAYLOAD','Unexpected Merge transport field',400);
    assert(payload.expectedMergeEpoch===player.merge.serverEpoch,'MERGE_EPOCH_CONFLICT','Merge save changed; reload before another transaction');
    const command=payload.command;
    assert(isObject(command),'INVALID_PAYLOAD','A versioned Merge command is required',400);
    // Policy can stop NEW crafts without hiding a previously committed outcome. The domain
    // still validates the exact payload hash/receipt, so an ID collision cannot gain a new grant.
    const savedReceipt=player.merge.actionLedger.some(receipt=>receipt.actionId===command.actionId);
    if(!savedReceipt){
      checkProjectPolicy(command.type,command.payload,catalog,state.policy);
      checkYardGrantTarget(player,command.type,now);
    }
    const outcome=applyMergeLabAction(player,command,catalog,{now});
    if(!outcome.ok)return outcome;
    const next=outcome.player;
    next._mergeLabFence={...next._mergeLabFence,highWaterRevision:next.merge.mergeRevision};
    // Only fields the domain owns/can grant are written; unrelated account properties are preserved.
    player.merge=next.merge;
    player._mergeLabFence=next._mergeLabFence;
    if(next.resources)player.resources=next.resources;
    if(next.farm)player.farm=next.farm;
    if(next.yard)player.yard=next.yard;
    return {ok:true,result:outcome.result,replayed:outcome.replayed};
  }catch(error){
    if(!(error instanceof MergeLabError))throw error;
    return {ok:false,error:{code:error.code,message:error.message,status:error.status}};
  }
}

export function publicMergeLabState(merge,policy=MERGE_LAB_RELEASE_POLICY){
  if(merge?.schemaVersion!==3)return merge;
  const {actionLedger,migration,...safe}=merge;
  return {...safe,migration:migration?{mode:migration.mode,report:migration.report,legacyStateFrozen:true}:undefined,releasePolicy:labReleasePolicy(policy)};
}

/** Non-mutating release-review plan only. No account/reset endpoint is added. */
export function planMergeCleanStart(player,catalog=MERGE_LAB_CATALOG){
  const archive=captureLegacy(player);
  // Hash only serializable persisted JSON, with undefined fields omitted as persistence would do.
  const archiveHash=hashCanonical(JSON.parse(JSON.stringify(archive)));
  const initialMerge=createMergeLabState(catalog,{now:0});
  initialMerge.projects.selectedId=MERGE_LAB_INITIAL_PROJECT_ID;
  return {mode:'clean-start',approvalRequired:true,archiveHash,archive,
    resets:['Merge knowledge and recipes','Merge physical stock','Merge projects and selected goal','Merge essence and supply timers/charges','Merge receipts and revision with a NEW epoch'],
    preserves:['All non-Merge account fields','resources including gold and gachaTokens','farm harvest','Yard treats and shinyTreats','Yard inventory including previously granted items','purchases'],
    initialMerge};
}
