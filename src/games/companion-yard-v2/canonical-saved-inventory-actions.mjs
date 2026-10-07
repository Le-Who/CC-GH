import {canonicalSavedFoodReady} from './canonical-saved-food-actions.mjs';
import {canonicalSavedActionReplayAllowed} from '../../game-state/canonicalSavedActionProtocol.mjs';
import {YARD_GOODIES} from '../../../game-logic/yard-catalog.js';
export function canonicalSavedInventoryCommandAllowed(snapshot,current,action,payload={},sceneState=current?.visualPrototype){
 if(!canonicalSavedFoodReady(snapshot,current,sceneState)||!['yard.buyGoodie','yard.collectGifts','yard.claimDailyLetter'].includes(action)
  ||!canonicalSavedActionReplayAllowed({accountId:snapshot.player.id,clientActionId:'yard-v2:capability-check',action,payload},snapshot))return false;
 if(action==='yard.buyGoodie'){
  const goodie=Object.hasOwn(YARD_GOODIES,payload.goodieId)?YARD_GOODIES[payload.goodieId]:null;
  return !!goodie&&['treats','shinyTreats'].every(k=>Number.isSafeInteger(goodie.cost?.[k]??0)&&(goodie.cost?.[k]??0)>=0&&snapshot.yard.currencies[k]>=(goodie.cost?.[k]??0));
 }
 if(action==='yard.collectGifts')return Array.isArray(snapshot.yard.pendingGifts)&&snapshot.yard.pendingGifts.length>0;
 return snapshot.yardRuntime.serverNow<=8640000000000000&&snapshot.yard.dailyLetter?.lastClaimedDate!==new Date(snapshot.yardRuntime.serverNow).toISOString().slice(0,10);
}
