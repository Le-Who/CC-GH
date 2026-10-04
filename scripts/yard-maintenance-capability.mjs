/** Image-owned declaration only. It does not approve its own release record. */
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {RECORD_PATH,parseMaintenanceRecord,sha256} from './yard-active-maintenance.mjs';
export function maintenanceCapability(base,{root=process.cwd(),read=path=>readFileSync(path),exists=path=>existsSync(path)}={}){
 const path=resolve(root,RECORD_PATH);if(!exists(path))return base;
 assert.equal(base.playerRolloutEnabled,true,'A maintenance record cannot enable CLOSED policy');assert.equal(base.format,'cc-gh-yard-release-compatibility/v1');
 const bytes=read(path),recordSha256=sha256(bytes),record=parseMaintenanceRecord(bytes,recordSha256);
 assert.deepEqual(base.requiredClosedPredecessor,{buildId:record.anchor.closedBuildId,imageDigest:record.anchor.closedImageDigest});
 // This hash reports the image's bytes. The deployment verifier separately
 // requires the externally approved hash; no authority is created here.
 return {...base,format:'cc-gh-yard-release-compatibility/v2',initialActivation:record.anchor,
  requiredActivePredecessor:{buildId:record.predecessor.commit,imageDigest:record.predecessor.imageDigest},
  maintenanceRecordSha256:recordSha256,writableStorageFormats:['yard-persistent/v1'],storageMigration:'none'};
}
