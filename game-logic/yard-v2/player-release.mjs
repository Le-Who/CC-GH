/** Rollout boundary. A previously migrated save must never enter the legacy
 * normalizer/simulator after a rollback. Closed rollout leaves it read-only. */
import {YARD_PLAYER_RELEASE_POLICY,hasPersistentYardStorage,usesPersistentYard} from './release-policy.mjs';
import {ensurePersistentPlayerYard,executePersistentYardAction,publicPersistentYard,inspectPlayerYard,inspectYardGrantTarget} from './service.mjs';
import {yardDevelopmentOptions,yardDevelopmentSnapshot} from './development-release-policy.mjs';
export {usesPersistentYard} from './release-policy.mjs';
const held=()=>({status:409,error:'YARD_ROLLOUT_PAUSED',mutable:false});
export function initializeReleasedPlayerYard(player,options={}) {
  if(!usesPersistentYard(player))return {status:200,yard:player?.yard,mutable:true};
  if(!YARD_PLAYER_RELEASE_POLICY.enabled)return {...held(),yard:player?.yard};
  return ensurePersistentPlayerYard(player,yardDevelopmentOptions(options));
}
export function executeReleasedYardAction(player,action,payload,options) {
  if(!YARD_PLAYER_RELEASE_POLICY.enabled)return held();
  return executePersistentYardAction(player,action,payload,yardDevelopmentOptions(options));
}
export function inspectReleasedYardTarget(player,options={}) {
  if(!usesPersistentYard(player))return {status:200,mutable:true};
  if(!YARD_PLAYER_RELEASE_POLICY.enabled)return held();
  return inspectPlayerYard(player,options);
}
export function inspectReleasedYardGrantTarget(player,options={}) {
  if(!YARD_PLAYER_RELEASE_POLICY.enabled && hasPersistentYardStorage(player))return held();
  return YARD_PLAYER_RELEASE_POLICY.enabled?inspectYardGrantTarget(player,options):{status:200,mutable:true};
}
export function requireReleasedPlayerYard(player,options={}) {
  const result=initializeReleasedPlayerYard(player,options);
  if(result.status!==200){const error=Error(result.error);Object.assign(error,{code:result.error,status:result.status});throw error;}
  if(player?._yardV2?.version===3 && result.mutable===false){
    const code=result.error||'YARD_RECONCILIATION_PENDING',error=Error(code);
    Object.assign(error,{code,status:409});throw error;
  }
  return result.yard;
}
export function releasedYardSnapshot(player,options={}) {
  if(!usesPersistentYard(player))return {};
  const runtime=yardDevelopmentSnapshot(publicPersistentYard(player,yardDevelopmentOptions(options)));
  return {yardRuntime:YARD_PLAYER_RELEASE_POLICY.enabled?runtime:{...runtime,status:'rollout-paused',mutable:false,error:'YARD_ROLLOUT_PAUSED'}};
}
