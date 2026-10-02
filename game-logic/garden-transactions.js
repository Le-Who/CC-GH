import { createHash, randomUUID } from 'node:crypto';
import { getGardenLevelReward, getGardenXpRequired } from './garden-economy.js';
import { PLANT_TYPES, getUpgradeCost, getUnlockedPlantIds } from './garden-shelf-plants.js';
import { buildGardenQuestSections, normalizeGardenDailyQuestState, recordGardenDailyProgress, isGardenDailyQuestId } from './garden-quests.js';

export const GARDEN_RECEIPT_WINDOW_MS = 72 * 60 * 60 * 1000;
export const GARDEN_ACCOUNTING_ACTIONS = new Set(['garden.buyPlant','garden.upgradePlant','garden.sellPlant','garden.claimQuest','garden.unlockShelf','garden.creditEarned','garden.levelUp']);
const MAX_STREAMS = 128;
const STREAM_RETIRE_AFTER_MS = GARDEN_RECEIPT_WINDOW_MS + 5 * 60 * 1000;
const SHELF_COSTS = [0,1000,8000,45000,220000];
const integer = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const clone = value => structuredClone(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value;
export const gardenPayloadHash = (action,payload) => createHash('sha256').update(JSON.stringify(canonical({action,payload}))).digest('hex');
const error = (code,status=409) => ({error:code,status});

/** Accounting metadata is server-owned and is never accepted from garden.sync.
 * Old saves initialize at their existing cumulative earned total; no retroactive
 * credit, balance reset, or guess about historical missing credits is made. */
export function getGardenAccounting(player) {
  const raw=player.gardenAccounting;
  return raw?.version===1 ? clone(raw) : {version:1,active:false,revision:0,creditedTotal:Math.max(0,Math.floor(Number(player.garden?.totalGoldEarned)||0)),streams:{}};
}
export function gardenAccountingView(player) {
  const meta=getGardenAccounting(player);
  return {economicRevision:meta.revision,acknowledgedEarnedTotal:meta.creditedTotal};
}
export function economicPlantShape(garden) {
  return (garden.plants||[]).map(({id,type,level})=>({id,type,level})).sort((a,b)=>a.id.localeCompare(b.id));
}
export function validateGardenSync(current,incoming,accounting) {
  if ((integer(incoming.economicRevision) ?? 0)!==accounting.revision) return error('GARDEN_REVISION_CONFLICT');
  // Revision zero preserves pre-existing save import compatibility. Once a
  // server economic mutation occurs, snapshots cannot add/remove/upgrade plants
  // or erase claims/shelves. Growth, watering, name, and placement remain local.
  if(accounting.active || accounting.revision>0){
    if (Number(incoming.lastTick)<Number(current.lastTick)) return error('GARDEN_STATE_STALE');
    if(JSON.stringify(economicPlantShape(current))!==JSON.stringify(economicPlantShape(incoming)))return error('GARDEN_ECONOMIC_STATE_CONFLICT');
    if(incoming.shelvesUnlocked!==current.shelvesUnlocked)return error('GARDEN_ECONOMIC_STATE_CONFLICT');
    if(incoming.level!==current.level)return error('GARDEN_ECONOMIC_STATE_CONFLICT');
    if(JSON.stringify([...(current.claimedQuests||[])].sort())!==JSON.stringify([...(incoming.claimedQuests||[])].sort()))return error('GARDEN_ECONOMIC_STATE_CONFLICT');
    if(current.dailyQuests?.date===incoming.dailyQuests?.date&&JSON.stringify([...(current.dailyQuests?.claimed||[])].sort())!==JSON.stringify([...(incoming.dailyQuests?.claimed||[])].sort()))return error('GARDEN_ECONOMIC_STATE_CONFLICT');
  }
  return null;
}
function validateIntent(action,payload,clientActionId){
  const intent=payload?.intent;
  if(!intent||!/^[a-zA-Z0-9_-]{16,64}$/.test(intent.streamId||'')||!Number.isSafeInteger(intent.sequence)||intent.sequence<1||integer(intent.createdAt)===null)return error('GARDEN_INVALID_INTENT',400);
  if(clientActionId!==`garden:${intent.streamId}:${intent.sequence}`)return error('GARDEN_INVALID_INTENT_ID',400);
  if(!GARDEN_ACCOUNTING_ACTIONS.has(action))return error('GARDEN_UNKNOWN_COMMAND',400);
  return null;
}
export function reconcileGardenIntent(player,{action,payload,clientActionId},now=Date.now()){
  const invalid=validateIntent(action,payload,clientActionId);if(invalid)return invalid;
  if(payload.intent.accountId!==player.id)return error('GARDEN_ACCOUNT_MISMATCH',400);
  if(payload.intent.createdAt>now+2*60*1000)return error('GARDEN_CLOCK_INVALID',400);
  const meta=getGardenAccounting(player),intent=payload.intent,record=meta.streams[intent.streamId],hash=gardenPayloadHash(action,payload);
  if(record&&record.sequence===intent.sequence){
    if(record.hash!==hash||record.clientActionId!==clientActionId)return error('GARDEN_INTENT_CONFLICT');
    return {intentStatus:'applied',receiptConfirmed:true,clientActionId,...record.result};
  }
  if(record&&record.sequence>intent.sequence)return error('GARDEN_INTENT_SUPERSEDED');
  if(record&&record.sequence+1===intent.sequence)return {intentStatus:'notApplied',clientActionId};
  if(!record&&intent.sequence===1&&now-intent.createdAt<=GARDEN_RECEIPT_WINDOW_MS)return {intentStatus:'notApplied',clientActionId};
  return error('GARDEN_INTENT_AMBIGUOUS');
}

/** Pure transaction: validation finishes before replacing any player fields.
 * Caller commits returned gold/garden/metadata together under withPlayerLock. */
export function applyGardenTransaction(player,action,payload,{clientActionId,now=Date.now(),makePlantId=randomUUID,normalizeGarden=value=>clone(value)}={}) {
  const invalid=validateIntent(action,payload,clientActionId);if(invalid)return invalid;
  if(payload.intent.accountId!==player.id)return error('GARDEN_ACCOUNT_MISMATCH',400);
  if(payload.intent.createdAt>now+2*60*1000)return error('GARDEN_CLOCK_INVALID',400);
  const meta=getGardenAccounting(player),intent=payload.intent,record=meta.streams[intent.streamId],hash=gardenPayloadHash(action,payload);
  if(record&&record.sequence===intent.sequence){
    if(record.hash!==hash||record.clientActionId!==clientActionId)return error('GARDEN_INTENT_CONFLICT');
    return {duplicate:true,receiptConfirmed:true,clientActionId,...record.result,garden:clone(player.garden),gold:Number(player.resources?.gold)||0,accounting:meta};
  }
  if(record&&intent.sequence!==record.sequence+1)return error('GARDEN_INTENT_SEQUENCE_CONFLICT');
  if(!record&&(intent.sequence!==1||now-intent.createdAt>GARDEN_RECEIPT_WINDOW_MS))return error('GARDEN_INTENT_AMBIGUOUS');
  if(!record&&Object.keys(meta.streams).length>=MAX_STREAMS){
    for(const [key,stream] of Object.entries(meta.streams))if(now-Number(stream.appliedAt)>STREAM_RETIRE_AFTER_MS)delete meta.streams[key];
    if(Object.keys(meta.streams).length>=MAX_STREAMS)return error('GARDEN_ACCOUNTING_CAPACITY');
  }
  if(integer(payload.expectedRevision)!==meta.revision)return error('GARDEN_REVISION_CONFLICT');
  const garden=clone(player.garden),gold=Number(player.resources?.gold)||0;
  let delta=0,plantId=null,claimedQuest=null,reward=null;
  if(action==='garden.buyPlant'){
    const definition=PLANT_TYPES[payload.type],shelf=integer(payload.shelfIndex),spot=integer(payload.spotIndex);
    if(!definition||!getUnlockedPlantIds(garden.level).includes(payload.type))return error('GARDEN_PLANT_LOCKED',400);
    if(shelf===null||spot===null||shelf>=garden.shelvesUnlocked||spot>=3)return error('GARDEN_INVALID_SPOT',400);
    if(garden.plants.some(p=>p.shelfIndex===shelf&&p.spotIndex===spot))return error('GARDEN_SPOT_OCCUPIED');
    if(garden.plants.length>=48)return error('GARDEN_PLANT_LIMIT',400);
    delta=-definition.baseCost;plantId=makePlantId();
    garden.plants.push({id:plantId,type:definition.id,level:1,shelfIndex:shelf,spotIndex:spot,phase:0,phaseProgress:0,lastTapped:0});
    garden.dailyQuests=recordGardenDailyProgress(garden.dailyQuests,{plantsBought:1},now);
  }else if(action==='garden.upgradePlant'||action==='garden.sellPlant'){
    const plant=garden.plants.find(p=>p.id===payload.plantId);if(!plant)return error('GARDEN_PLANT_MISSING',400);
    const definition=PLANT_TYPES[plant.type];if(!definition)return error('GARDEN_PLANT_TYPE',400);
    plantId=plant.id;
    if(action==='garden.upgradePlant'){
      if(plant.phase!==3)return error('GARDEN_PLANT_NOT_MATURE',400);
      delta=-getUpgradeCost(definition.baseCost,plant.level);plant.level++;
      garden.dailyQuests=recordGardenDailyProgress(garden.dailyQuests,{upgrades:1},now);
    }else{delta=Math.floor(definition.baseCost/2);garden.plants=garden.plants.filter(p=>p.id!==plantId);}
  }else if(action==='garden.unlockShelf'){
    const cost=SHELF_COSTS[garden.shelvesUnlocked];if(cost===undefined)return error('GARDEN_SHELF_LIMIT',400);
    delta=-cost;garden.shelvesUnlocked++;
  }else if(action==='garden.claimQuest'){
    const quest=buildGardenQuestSections(garden,now).flatMap(section=>section.quests).find(q=>q.id===payload.questId);
    if(!quest||!quest.unlocked||!quest.complete)return error('GARDEN_QUEST_NOT_READY',400);
    if(quest.claimed)return error('GARDEN_QUEST_ALREADY_CLAIMED');
    delta=quest.reward;claimedQuest=quest.id;
    if(isGardenDailyQuestId(quest.id)){
      garden.dailyQuests=normalizeGardenDailyQuestState(garden.dailyQuests,now);garden.dailyQuests.claimed.push(quest.id);
    }else garden.claimedQuests=[...(garden.claimedQuests||[]),quest.id];
    garden.totalGoldEarned+=delta;meta.creditedTotal+=delta;
  }else if(action==='garden.levelUp'){
    if(!garden.levelReady&&garden.xp<getGardenXpRequired(garden.level))return error('GARDEN_LEVEL_NOT_READY',400);
    reward=getGardenLevelReward(garden.level);delta=reward;garden.level++;garden.xp=0;garden.xpRequired=getGardenXpRequired(garden.level);garden.levelReady=false;
    garden.totalGoldEarned+=reward;meta.creditedTotal+=reward;garden.dailyQuests=recordGardenDailyProgress(garden.dailyQuests,{levelUps:1},now);
  }else if(action==='garden.creditEarned'){
    const through=integer(payload.throughTotal);if(through===null)return error('GARDEN_INVALID_EARNINGS',400);
    if(!payload.state)return error('GARDEN_EARNINGS_CHECKPOINT_REQUIRED',400);
    const checkpoint=normalizeGarden(payload.state);
    const conflict=validateGardenSync(garden,checkpoint,meta);if(conflict)return conflict;
    if(checkpoint.totalGoldEarned!==through)return error('GARDEN_EARNINGS_CHECKPOINT_MISMATCH',400);
    Object.assign(garden,checkpoint);
    // The growth total remains the existing client-authored contract. The
    // independent server watermark deduplicates batches, not validates gameplay.
    delta=Math.min(1_000_000_000,Math.max(0,through-meta.creditedTotal));meta.creditedTotal+=delta;
    garden.totalGoldEarned=Math.max(player.garden.totalGoldEarned||0,garden.totalGoldEarned,through,meta.creditedTotal);
  }
  if(!Number.isSafeInteger(delta)||(action!=='garden.levelUp'&&Math.abs(delta)>1_000_000_000)||!Number.isSafeInteger(gold+delta))return error('GARDEN_INVALID_AMOUNT',400);
  if(gold+delta<0)return error('GARDEN_INSUFFICIENT_GOLD',400);
  meta.active=true;
  if(action!=='garden.creditEarned')meta.revision++;garden.economicRevision=meta.revision;garden.acknowledgedEarnedTotal=meta.creditedTotal;
  const result={goldDelta:delta,plantId,claimedQuest,...(reward===null?{}:{reward,level:garden.level}),economicRevision:meta.revision,acknowledgedEarnedTotal:meta.creditedTotal};
  meta.streams[intent.streamId]={sequence:intent.sequence,clientActionId,hash,appliedAt:now,result};
  return {garden,gold:gold+delta,accounting:meta,receiptConfirmed:true,clientActionId,...result};
}
