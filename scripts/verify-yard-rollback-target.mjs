/** Read-only pre-switch verification. Inputs are local image metadata, image-owned
 * capability commands, health, and an aggregate marker count. No player rows. */
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyMaintenanceRollback} from './yard-active-maintenance.mjs';
// Audited prior release: its live routes/playerManager do not write _yardV2.
export const KNOWN_LEGACY_YARD_BUILD='84d252d4bee6ed75fe8d32c07ebdef4c9270c629';
const fullSha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const imageDigest=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
const fail=message=>{throw Error(message);};
function capability(value,buildId){
 if(!value||value.format!=='cc-gh-yard-release-compatibility/v1'||value.buildId!==buildId||typeof value.playerRolloutEnabled!=='boolean'||!Array.isArray(value.readableStorageFormats)||!value.readableStorageFormats.includes('yard-persistent/v1'))fail('Invalid image-owned Yard compatibility declaration');
 if(value.playerRolloutEnabled===false&&value.closedQuarantineVerified!==true)fail('Closed image quarantine proof is missing');
 return value;
}
function identity(image,repository,digest,buildId){
 if(!image||!imageDigest(image.Id)||!imageDigest(digest)||!Array.isArray(image.RepoDigests)||!image.RepoDigests.includes(`ghcr.io/${repository}@${digest}`))fail('Pinned repository image digest is not present');
 if(image.Config?.Labels?.['org.opencontainers.image.revision']!==buildId)fail('Image source revision does not match the release build');
}
export function verifyYardRollbackTarget(input){
 if(input?.candidate?.format==='cc-gh-yard-release-compatibility/v2'){
  if(!input.maintenance)fail('Maintenance requires independently approved preflight evidence');
  const {recordBytes,approvedRecordSha256,previousCompatibilityBytes,acceptedPredecessorReceiptBytes}=input.maintenance;
  return verifyMaintenanceRollback({...input,recordBytes,approvedRecordSha256,previousCompatibilityBytes,acceptedPredecessorReceiptBytes});
 }
 const {candidate,previous,previousHealth,candidateImage,previousImage,repository,candidateDigest,candidateBuildId,previousImageId,previousBuildId,persistentYardRows}=input||{};
 if(typeof repository!=='string'||!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(repository)||!fullSha(candidateBuildId)||!fullSha(previousBuildId)||!imageDigest(previousImageId))fail('Exact release and rollback identities are required');
 if(!Number.isSafeInteger(persistentYardRows)||persistentYardRows<0)fail('Valid read-only Yard marker count required');
 const target=capability(candidate,candidateBuildId);identity(candidateImage,repository,candidateDigest,candidateBuildId);
 if(previousImage?.Id!==previousImageId)fail('Running prior image identity changed');
 if(!previousHealth||previousHealth.status!=='ok'||previousHealth.buildId!==previousBuildId)fail('Exact prior application must be healthy before switching');
 const prior=previous===null?null:capability(previous,previousBuildId);
 if(!prior){
  if(persistentYardRows>0)fail('Existing persistent Yard markers forbid rollback to an unaware image');
  const expected=target.requiredLegacyPredecessor;
  if(!expected||expected.buildId!==KNOWN_LEGACY_YARD_BUILD||previousBuildId!==KNOWN_LEGACY_YARD_BUILD||!imageDigest(expected.imageDigest))fail('Unaware rollback target must pin the known non-v2-writing legacy release');
  identity(previousImage,repository,expected.imageDigest,expected.buildId);
 }
 if(target.playerRolloutEnabled){
  const expected=target.requiredClosedPredecessor;
  if(!expected||!fullSha(expected.buildId)||!imageDigest(expected.imageDigest))fail('Activation requires a code-owned exact closed predecessor');
  if(!prior||prior.playerRolloutEnabled!==false||prior.closedQuarantineVerified!==true)fail('Activation rollback target must be proven closed and quarantine-aware');
  if(previousBuildId!==expected.buildId)fail('Prior build is not the reviewed closed predecessor');
  identity(previousImage,repository,expected.imageDigest,expected.buildId);
 }
 return {status:'ready',phase:target.playerRolloutEnabled?'activation':'closed-compatible',persistentYardRows};
}
export function readYardPreflightDirectory(directory){
 const text=name=>readFileSync(join(directory,name),'utf8').trim(),json=name=>JSON.parse(text(name));
 const count=text('persistent-yard-count.txt');if(!/^(0|[1-9]\d*)$/.test(count))fail('Invalid PostgreSQL aggregate count');
 const maintenance=existsSync(join(directory,'maintenance-approved-sha256.txt'))?{approvedRecordSha256:text('maintenance-approved-sha256.txt'),recordBytes:readFileSync(join(directory,'maintenance-record.json')),previousCompatibilityBytes:readFileSync(join(directory,'previous.json')),acceptedPredecessorReceiptBytes:readFileSync(join(directory,'maintenance-predecessor-receipt.json'))}:undefined;
 return {candidate:json('candidate.json'),previous:json('previous.json'),previousHealth:json('previous-health.json'),candidateImage:json('candidate-image.json'),previousImage:json('previous-image.json'),repository:text('repository.txt'),candidateDigest:text('candidate-digest.txt'),candidateBuildId:text('candidate-build.txt'),previousImageId:text('previous-image-id.txt'),previousBuildId:text('previous-build.txt'),persistentYardRows:Number(count),...(maintenance?{maintenance}:{})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{if(process.argv.length!==3)fail('One bounded preflight directory required');process.stdout.write(JSON.stringify(verifyYardRollbackTarget(readYardPreflightDirectory(process.argv[2])))+'\n');}
 catch(error){process.stderr.write('Yard pre-switch guard blocked release: '+error.message+'\n');process.exitCode=1;}
}
