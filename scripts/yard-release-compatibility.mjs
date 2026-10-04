/** Image-owned compatibility command. No database, filesystem writes or network.
 * Its closed quarantine check mutates only an ephemeral in-process sentinel. */
import {pathToFileURL} from 'node:url';
import {YARD_PLAYER_RELEASE_POLICY} from '../game-logic/yard-v2/release-policy.mjs';
import {initializeReleasedPlayerYard,executeReleasedYardAction,releasedYardSnapshot} from '../game-logic/yard-v2/player-release.mjs';
import {maintenanceCapability} from './yard-maintenance-capability.mjs';
export function yardReleaseCompatibility(buildId){
 if(typeof buildId!=='string'||!/^[a-f0-9]{40}$/.test(buildId))throw Error('Exact image build identity required');
 let closedQuarantineVerified=false;
 if(!YARD_PLAYER_RELEASE_POLICY.enabled){
  for(const marker of [null,{format:'yard-persistent/v1',version:1},{format:'future',version:99}]){
   const player={schemaVersion:11,id:'image-compatibility-sentinel',yard:{placedGoodies:{opaque:'retain'},currencies:{treats:'preserve-invalid-evidence'}},_yardV2:marker};
   const original=JSON.stringify(player),loaded=initializeReleasedPlayerYard(player,{now:0,simulate:true});
   const action=executeReleasedYardAction(player,'yard.collectGifts',{}, {now:0,actionId:'yard-v2:image-proof'}),snapshot=releasedYardSnapshot(player,{now:0});
   if(loaded.status!==409||action.status!==409||snapshot.yardRuntime?.mutable!==false||JSON.stringify(player)!==original)throw Error('Image failed its closed quarantine boundary proof');
  }
  closedQuarantineVerified=true;
 }
 return maintenanceCapability({format:'cc-gh-yard-release-compatibility/v1',buildId,policyRevision:YARD_PLAYER_RELEASE_POLICY.revision,
  playerRolloutEnabled:YARD_PLAYER_RELEASE_POLICY.enabled,readableStorageFormats:['yard-persistent/v1'],
  closedQuarantineVerified,requiredClosedPredecessor:YARD_PLAYER_RELEASE_POLICY.requiredClosedPredecessor,requiredLegacyPredecessor:YARD_PLAYER_RELEASE_POLICY.requiredLegacyPredecessor});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{process.stdout.write(JSON.stringify(yardReleaseCompatibility(process.env.APP_BUILD_ID))+'\n');}
 catch(error){process.stderr.write('Yard image compatibility check failed: '+error.message+'\n');process.exitCode=1;}
}
