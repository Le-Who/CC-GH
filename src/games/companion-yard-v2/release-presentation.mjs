import {YARD_PLAYER_RELEASE_POLICY} from '../../../game-logic/yard-v2/release-policy.mjs';
/** Select before any gameplay projection consumes raw, preserved save data. */
export function yardReleasePresentation(snapshot) {
 const runtime=snapshot?.yardRuntime;
 if(runtime && (runtime.version!==1 || runtime.mutable!==true))return 'read-only';
 return YARD_PLAYER_RELEASE_POLICY.enabled || runtime?.version===1?'persistent':'legacy';
}
