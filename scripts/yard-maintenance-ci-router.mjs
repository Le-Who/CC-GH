/** Explicit CI routing; the existing initial-activation dispatcher stays intact. */
import assert from 'node:assert/strict';
import {existsSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {RECORD_PATH} from './yard-active-maintenance.mjs';
import {verifyMaintenanceSourceInputs} from './yard-maintenance-cli.mjs';
import {loadMaintenanceInputs} from '../tests/helpers/yard-maintenance-guard.mjs';
export async function routeMaintenanceCi({root=process.cwd(),env=process.env}={}){
 if(!existsSync(resolve(root,RECORD_PATH))){const result=spawnSync(process.execPath,['scripts/yard-ci-dispatch.mjs','--plan'],{cwd:root,env,stdio:'inherit'});assert.equal(result.status,0,'Original CLOSED/activation dispatcher blocked');return {mode:'original'};}
 assert.ok(env.YARD_MAINTENANCE_REQUEST_JSON&&env.YARD_MAINTENANCE_REQUEST_SHA256,'Maintenance CI requires independently approved workflow inputs');
 const inputs=loadMaintenanceInputs({...env,YARD_MAINTENANCE_ACCEPTANCE:'1'},root);verifyMaintenanceSourceInputs(root,inputs);const r=inputs.record;
 const output={mode:'MAINTENANCE',closed_ref:r.anchor.closedBuildId,active_ref:inputs.activeCommit,closed_digest:r.anchor.closedImageDigest,contract_hash:r.anchor.contractSha256,reuse_closed:'true'};
 assert.ok(env.GITHUB_OUTPUT);for(const [key,value]of Object.entries(output))appendFileSync(env.GITHUB_OUTPUT,`${key}=${value}\n`);return output;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){try{await routeMaintenanceCi();}catch(error){console.error('Maintenance CI blocked: '+error.message);process.exitCode=1;}}
