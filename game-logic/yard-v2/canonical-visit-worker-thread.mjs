/** One finite preparation/replay. Never import this module on the request thread. */
import {isMainThread,parentPort,workerData,threadId} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {VISIT_JOB_PROTOCOL,VISIT_JOB_SOURCE_HASH,VISIT_WORKER_SOURCES,sha256,boundedJSON,snapshotRequest,isTerminalVisitRefusal} from './canonical-visit-job-contract.mjs';

if(isMainThread||!parentPort)throw Error('CANONICAL_VISIT_WORKER_THREAD_REQUIRED');
const started=performance.now();
const envelope={protocol:VISIT_JOB_PROTOCOL,sourceHash:VISIT_JOB_SOURCE_HASH,id:workerData.id,key:workerData.key,threadId};
try{
 if(workerData.protocol!==VISIT_JOB_PROTOCOL||workerData.sourceHash!==VISIT_JOB_SOURCE_HASH)throw Error('SOURCE_MISMATCH');
 // Pin the complete imported source graph, not just a caller-provided version.
 // A deployment must atomically replace source and restart its worker service.
 for(const {specifier,sha256:expected} of VISIT_WORKER_SOURCES){
  if(sha256(readFileSync(new URL(import.meta.resolve(specifier))))!==expected)throw Error('SOURCE_MISMATCH');
 }
 const request=JSON.parse(workerData.requestJSON);
 if(snapshotRequest(request,workerData.maxInputBytes).key!==workerData.key)throw Error('KEY_MISMATCH');
 const {prepareCanonicalSavedVisit,restoreCanonicalSavedVisit}=await import('./canonical-saved-visit-bridge.mjs');
 const result=request.operation==='prepare'?prepareCanonicalSavedVisit(request.input):restoreCanonicalSavedVisit(request.input.record,{rows:request.input.rows,serverNow:request.input.serverNow});
 if(result.prepared===false&&result.ready===false&&result.admission===false&&isTerminalVisitRefusal(request.operation,result.code)){
  const {json,bytes}=boundedJSON({prepared:false,ready:false,admission:false,sourceCode:result.code},workerData.maxResultBytes);
  parentPort.postMessage({...envelope,kind:'refused',json,bytes,artifactHash:sha256(json),elapsedMs:performance.now()-started});
 }else if(result.prepared!==true){
  parentPort.postMessage({...envelope,kind:'unavailable',code:'SOURCE_UNAVAILABLE',sourceCode:typeof result.code==='string'?result.code.slice(0,160):'UNKNOWN_SOURCE_RESULT',elapsedMs:performance.now()-started});
 }else{
  const artifact={prepared:true,ready:false,admission:false,record:result.record,plan:result.plan};
  // A sample is time-dependent. Never cache it or a stock/permission decision.
  const {json,bytes}=boundedJSON(artifact,workerData.maxResultBytes);
  parentPort.postMessage({...envelope,kind:'artifact',json,bytes,artifactHash:sha256(json),elapsedMs:performance.now()-started});
 }
}catch(error){
 parentPort.postMessage({...envelope,kind:'unavailable',code:['SOURCE_MISMATCH','KEY_MISMATCH'].includes(error.message)?error.message:'WORKER_FAILURE',elapsedMs:performance.now()-started});
}finally{parentPort.close();}
