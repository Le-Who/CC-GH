/** Maintenance acceptance inputs are explicit reviewed data, never rollout flags. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {RECORD_PATH,sha256,parseMaintenanceRecord} from '../../scripts/yard-active-maintenance.mjs';
const full=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
function parseRequest(bytes,approvedRequestSha256,buildOnly){
 assert.match(approvedRequestSha256||'',/^[a-f0-9]{64}$/,'Explicit approved request hash required');assert.equal(sha256(bytes),approvedRequestSha256,'Unapproved maintenance invocation');
 const value=JSON.parse(bytes);assert.ok(value&&typeof value==='object'&&!Array.isArray(value));
 assert.deepEqual(Object.keys(value).sort(),['bootstrap','candidateCommit',...(buildOnly?[]:['candidateDigest']),'candidateTree','format','predecessorReceipt','recordSha256','toolCommit']);
 assert.equal(value.format,buildOnly?'cc-gh-yard-maintenance-build-request/v1':'cc-gh-yard-maintenance-request/v1');assert.ok(full(value.toolCommit)&&full(value.candidateCommit)&&full(value.candidateTree));if(!buildOnly){assert.match(value.candidateDigest||'',/^sha256:[a-f0-9]{64}$/);assert.equal(value.candidateDigest.length,71);}assert.match(value.recordSha256||'',/^[a-f0-9]{64}$/);
 assert.ok(value.predecessorReceipt&&typeof value.predecessorReceipt==='object'&&!Array.isArray(value.predecessorReceipt));
 if(value.bootstrap!==null){assert.ok(value.bootstrap&&typeof value.bootstrap==='object'&&!Array.isArray(value.bootstrap));assert.deepEqual(Object.keys(value.bootstrap).sort(),['bytes','sha256']);assert.equal(typeof value.bootstrap.bytes,'string');assert.match(value.bootstrap.sha256||'',/^[a-f0-9]{64}$/);assert.equal(sha256(value.bootstrap.bytes),value.bootstrap.sha256);}
 return value;
}
export const parseMaintenanceRequest=(bytes,hash)=>parseRequest(bytes,hash,false);
export const parseMaintenanceBuildRequest=(bytes,hash)=>parseRequest(bytes,hash,true);
export function loadMaintenanceInputs(env=process.env,root=process.cwd(),{buildOnly=false}={}){
 assert.equal(env.CI,'true');assert.equal(env.YARD_MAINTENANCE_ACCEPTANCE,'1');
 assert.notEqual(env.NODE_TLS_REJECT_UNAUTHORIZED,'0','Verified TLS is required for authoritative receipts');
 for(const key of ['NODE_OPTIONS','DEV_AUTH_ENABLED','TELEGRAM_BOT_TOKEN','REDIS_URL','YARD_CANDIDATE_CI','YARD_PLAYER_WIRING_TEST','YARD_EIGHT_PLAYER_CANDIDATE_TEST'])assert.ok(!env[key],`Inherited ${key} forbidden`);
 assert.ok(!env.DATABASE_URL||env.DATABASE_URL==='postgres://ccgh_yard_production_ci:ccgh_yard_production_ci@127.0.0.1:35432/ccgh_yard_production_ci');
 let bytes;if(env.YARD_MAINTENANCE_REQUEST_JSON){assert.equal(typeof env.YARD_MAINTENANCE_REQUEST_JSON,'string');bytes=Buffer.from(env.YARD_MAINTENANCE_REQUEST_JSON);}else{assert.equal(typeof env.YARD_MAINTENANCE_REQUEST,'string');assert.ok(env.YARD_MAINTENANCE_REQUEST.length);bytes=readFileSync(resolve(env.YARD_MAINTENANCE_REQUEST));}assert.ok(bytes.length<=128*1024);
 const request=(buildOnly?parseMaintenanceBuildRequest:parseMaintenanceRequest)(bytes,env.YARD_MAINTENANCE_REQUEST_SHA256),recordBytes=readFileSync(resolve(root,RECORD_PATH)),record=parseMaintenanceRecord(recordBytes,request.recordSha256);
 if(record.bootstrapSha256)assert.equal(request.bootstrap?.sha256,record.bootstrapSha256);else assert.equal(request.bootstrap,null);
 return {request,record,recordBytes,requestSha256:env.YARD_MAINTENANCE_REQUEST_SHA256,activeCommit:request.candidateCommit,...(buildOnly?{}:{activeDigest:request.candidateDigest}),closedCommit:record.predecessor.commit,closedDigest:record.predecessor.imageDigest,repository:'ghcr.io/le-who/cc-gh'};
}
export function assertMaintenanceCaseResults(report,{runId,inputs}){
 const names=['ACTIVE persistence P-C-P preserves progress and durable replay','same-origin ACTIVE P-C-P preserves lost-reply intent and service-worker state','ACTIVE storage rejects invalid and future markers without mutation',
 'cross-game actual B: authentic Merge Moon Lamp enters Yard, places once and persists in PostgreSQL',
 'cross-game actual B: three fixture-assisted real Blox finishes fund one Merge pack exactly once',
 'cross-game actual B: seven available routes survive rapid Home ownership and reload',
 ...inputs.record.affectedGames.map(game=>`changed game ${game}: actual image, viewport, navigation and reload`)];
 for(const [key,value]of Object.entries({runId,activeCommit:inputs.activeCommit,activeDigest:inputs.activeDigest,predecessorCommit:inputs.closedCommit,predecessorDigest:inputs.closedDigest,requestSha256:inputs.requestSha256}))assert.equal(report.config?.metadata?.[key],value,'Maintenance report identity mismatch');
 assert.deepEqual({expected:report.stats?.expected,unexpected:report.stats?.unexpected,flaky:report.stats?.flaky,skipped:report.stats?.skipped},{expected:names.length,unexpected:0,flaky:0,skipped:0});
 const specs=[];const visit=s=>{specs.push(...(s.specs||[]));for(const child of s.suites||[])visit(child);};for(const suite of report.suites||[])visit(suite);
 assert.deepEqual(specs.map(s=>s.title).sort(),[...names].sort(),'Every exact required maintenance case must execute');
 for(const spec of specs){assert.equal(spec.ok,true);assert.equal(spec.tests?.length,1);assert.equal(spec.tests[0].results?.length,1);assert.equal(spec.tests[0].results[0].status,'passed');assert.equal(spec.tests[0].results[0].retry,0);}
 return names.length;
}
/** Navigation is an unsettled read, never evidence that the durable queue drained. */
export async function outboxPresenceForPoll(readBox,nonce){
 try{const box=await readBox();return box?.items?.some(row=>row.clientActionId===nonce)?'pending':'drained';}
 catch(error){if(/^(?:Error: )?page\.evaluate: Execution context was destroyed, most likely because of a navigation(?:\n|$)/.test(error?.message||''))return 'navigation-pending';throw error;}
}
/** Browser/SW bytes must equal the exact current image, even when a cache answers. */
export function assertMaintenanceDeliveredMedia({browser,http,disk,path}){
 assert.equal(browser.path,path);assert.equal(browser.status,200);assert.equal(http.status,200);
 assert.ok(browser.contentType.includes('image/webp'));assert.ok(http.contentType.includes('image/webp'));
 assert.ok(disk.length>0);const digest=sha256(disk);
 assert.equal(browser.bytes,disk.length);assert.equal(browser.sha256,digest,'Browser/SW atlas differs from current immutable image');
 assert.equal(http.bytes.length,disk.length);assert.equal(sha256(http.bytes),digest,'HTTP atlas differs from current immutable image');
 return {path,bytes:disk.length,sha256:digest};
}
