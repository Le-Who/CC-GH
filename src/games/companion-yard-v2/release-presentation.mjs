import {YARD_PLAYER_RELEASE_POLICY} from '../../../game-logic/yard-v2/release-policy.mjs';
/** Select before any gameplay projection consumes raw, preserved save data. */
export function yardReleasePresentation(snapshot,{canonicalSavedVisitsEnabled=false}={}) {
 const runtime=snapshot?.yardRuntime;
 if(runtime?.storageVersion===3||runtime?.canonicalVisitProtocol!==undefined){
  return canonicalSavedVisitsEnabled===true&&runtime.version===1&&runtime.storageVersion===3
   &&runtime.canonicalVisitProtocol==='yard-canonical-authoritative/v1'&&!runtime.error
   &&['ready','reconciliation-pending'].includes(runtime.status)?'persistent':'read-only';
 }
 if(runtime?.storageVersion!==undefined&&![1,2].includes(runtime.storageVersion))return 'read-only';
 if(runtime && (runtime.version!==1 || runtime.mutable!==true))return 'read-only';
 return YARD_PLAYER_RELEASE_POLICY.enabled || runtime?.version===1?'persistent':'legacy';
}
