/** Inactive source-owned preparation cache. Results are evidence, never admission.
 * enqueue/lookup are synchronous and non-thenable; do not await .completion from
 * afterPlayerCommit (the existing player manager still holds its account lock).
 * No route, simulator, storage writer or capability policy imports this module. */
import {Worker} from 'node:worker_threads';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {VISIT_JOB_PROTOCOL,VISIT_JOB_SOURCE_HASH,sha256,freeze,snapshotRequest,boundedJSON,isTerminalVisitRefusal} from './canonical-visit-job-contract.mjs';

export const CANONICAL_VISIT_WORKER_ENABLED=false;
export const CANONICAL_VISIT_WORKER_LIMITS=Object.freeze({
 workers:1,maxJobs:8,maxInputBytes:256*1024,maxPendingBytes:2*1024*1024,
 maxResultBytes:1024*1024,maxCacheEntries:8,maxCacheBytes:8*1024*1024,
 jobTimeoutMs:30000,totalTimeoutMs:45000,cacheTtlMs:60000,
});
const maximum=Object.freeze({...CANONICAL_VISIT_WORKER_LIMITS,workers:2,maxJobs:32,maxPendingBytes:4*1024*1024,maxCacheEntries:32,maxCacheBytes:16*1024*1024,jobTimeoutMs:60000,totalTimeoutMs:120000,cacheTtlMs:300000});
const unavailable=(code,key=null,extra={})=>freeze({state:'unavailable',prepared:false,ready:false,admission:false,retryable:true,code,key,...extra});
const pending=(key,extra={})=>Object.freeze({state:'pending',prepared:false,ready:false,admission:false,retryable:true,code:'RECONCILIATION_PENDING',key,...extra});

export function createCanonicalVisitWorker({enabled=CANONICAL_VISIT_WORKER_ENABLED,limits:overrides={}}={}){
 if(typeof enabled!=='boolean'||!overrides||typeof overrides!=='object')throw TypeError('INVALID_WORKER_OPTIONS');
 const limits={...CANONICAL_VISIT_WORKER_LIMITS,...overrides};
 for(const [key,value] of Object.entries(limits))if(!Object.hasOwn(maximum,key)||!Number.isSafeInteger(value)||value<1||value>maximum[key])throw RangeError('INVALID_WORKER_LIMIT:'+key);
 if(limits.workers>limits.maxJobs||limits.maxInputBytes>limits.maxPendingBytes||limits.maxResultBytes>limits.maxCacheBytes||limits.jobTimeoutMs>limits.totalTimeoutMs)throw RangeError('INCONSISTENT_WORKER_LIMITS');
 const jobs=new Map(),cache=new Map(),liveWorkers=new Set();let pendingBytes=0,cacheBytes=0,closed=false,scheduled=false,startedCount=0,highWaterWorkers=0;
 const now=()=>performance.now();
 const cacheDelete=key=>{const entry=cache.get(key);if(entry){cacheBytes-=entry.bytes;cache.delete(key);}};
 function prune(){for(const [key,entry] of cache)if(entry.expiresAt<=now())cacheDelete(key);}
 function schedule(){if(scheduled||closed)return;scheduled=true;setImmediate(()=>{scheduled=false;pump();});}
 function finish(job,result){
  if(job.finished)return;job.finished=true;clearTimeout(job.timer);jobs.delete(job.key);pendingBytes-=job.bytes;job.requestJSON=null;
  job.resolve(result);
  // Keep the concurrency slot until exit, even for a timed out or cancelled job.
  if(job.worker)void job.worker.terminate().catch(()=>{});else schedule();
 }
 function discardOwner(ownerId,exceptKey=null,code='STATE_OBSOLETE'){
  for(const job of jobs.values())if(job.ownerId===ownerId&&job.key!==exceptKey)finish(job,unavailable(code,job.key));
  for(const [key,entry] of cache)if(entry.ownerId===ownerId&&key!==exceptKey)cacheDelete(key);
 }
 function remember(job,value,bytes){
  prune();
  while(cache.size>=limits.maxCacheEntries||cacheBytes+bytes>limits.maxCacheBytes)cacheDelete(cache.keys().next().value);
  cache.set(job.key,{ownerId:job.ownerId,value,bytes,expiresAt:now()+limits.cacheTtlMs});cacheBytes+=bytes;
  return value;
 }
 function decode(job,message){
  if(!message||message.protocol!==VISIT_JOB_PROTOCOL||message.sourceHash!==VISIT_JOB_SOURCE_HASH||message.id!==job.id||message.key!==job.key||message.threadId!==job.worker.threadId||message.threadId<=0)return unavailable('WORKER_MISMATCH',job.key);
  if(now()>=job.deadline||now()>=job.runDeadline)return unavailable('WORKER_TIMEOUT',job.key);
  if(message.kind==='unavailable')return unavailable('WORKER_UNAVAILABLE',job.key,{workerCode:typeof message.code==='string'?message.code.slice(0,160):'UNKNOWN',...(typeof message.sourceCode==='string'?{sourceCode:message.sourceCode.slice(0,160)}:{})});
  if(!['artifact','refused'].includes(message.kind)||!Number.isFinite(message.elapsedMs)||message.elapsedMs<0||typeof message.json!=='string'||message.json.length>limits.maxResultBytes||Buffer.byteLength(message.json)>limits.maxResultBytes||message.bytes!==Buffer.byteLength(message.json)||message.artifactHash!==sha256(message.json))return unavailable('WORKER_RESULT_INVALID',job.key);
  try{
   const artifact=JSON.parse(message.json);
   // Also bounds object overhead; the transport byte budget alone is insufficient.
   boundedJSON(artifact,limits.maxResultBytes);
   const execution={threadId:message.threadId,elapsedMs:message.elapsedMs,sourceHash:VISIT_JOB_SOURCE_HASH};
   if(message.kind==='refused'){
    if(!artifact||typeof artifact!=='object'||Array.isArray(artifact)||Object.keys(artifact).sort().join(',')!=='admission,prepared,ready,sourceCode'
     ||artifact.prepared!==false||artifact.ready!==false||artifact.admission!==false||!isTerminalVisitRefusal(job.operation,artifact.sourceCode))return unavailable('WORKER_RESULT_INVALID',job.key);
    return remember(job,freeze({state:'refused',prepared:false,ready:false,admission:false,retryable:false,code:'SOURCE_REFUSED',key:job.key,sourceCode:artifact.sourceCode,execution}),message.bytes);
   }
   if(artifact.prepared!==true||artifact.ready!==false||artifact.admission!==false||artifact.record?.status!=='prepared-inactive'||artifact.record.authoritative!==false||artifact.record.economicIntent?.committed!==false||!artifact.plan)return unavailable('WORKER_RESULT_INVALID',job.key);
   const value=freeze({state:'prepared',prepared:true,ready:false,admission:false,key:job.key,artifact,execution});
   return remember(job,value,message.bytes);
  }catch{return unavailable('WORKER_RESULT_INVALID',job.key);}
 }
 function start(job){
  if(job.finished||closed)return;
  if(now()>=job.deadline){finish(job,unavailable('QUEUE_TIMEOUT',job.key));return;}
  try{
   job.runDeadline=Math.min(job.deadline,now()+limits.jobTimeoutMs);
   clearTimeout(job.timer);job.timer=setTimeout(()=>finish(job,unavailable('WORKER_TIMEOUT',job.key)),Math.max(1,job.runDeadline-now()));
   const worker=new Worker(new URL('./canonical-visit-worker-thread.mjs',import.meta.url),{
    workerData:{protocol:VISIT_JOB_PROTOCOL,sourceHash:VISIT_JOB_SOURCE_HASH,id:job.id,key:job.key,requestJSON:job.requestJSON,maxInputBytes:limits.maxInputBytes,maxResultBytes:limits.maxResultBytes},
    resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:16,stackSizeMb:4},
    name:'yard-saved-visit-prepare',
   });
   job.worker=worker;liveWorkers.add(worker);startedCount++;highWaterWorkers=Math.max(highWaterWorkers,liveWorkers.size);
   worker.on('message',message=>{if(!job.finished)finish(job,decode(job,message));});
   worker.on('error',()=>finish(job,unavailable('WORKER_ERROR',job.key)));
   worker.on('exit',()=>{liveWorkers.delete(worker);if(!job.finished)finish(job,unavailable('WORKER_EXIT',job.key));schedule();});
  }catch{finish(job,unavailable('WORKER_START_FAILED',job.key));schedule();}
 }
 function pump(){
  if(closed)return;
  for(const job of jobs.values()){if(liveWorkers.size>=limits.workers)break;if(!job.worker)start(job);}
 }
 function snapshot(request){
  if(closed)return {error:unavailable('WORKER_CLOSED')};
  if(!enabled)return {error:unavailable('WORKER_DISABLED')};
  try{return snapshotRequest(request,limits.maxInputBytes);}catch(error){return {error:unavailable(error.message)};}
 }
 function lookupSnapshot(s){
  prune();const hit=cache.get(s.key);if(hit){cache.delete(s.key);cache.set(s.key,hit);return hit.value;}
  const job=jobs.get(s.key);return job?job.handle:pending(s.key);
 }
 return Object.freeze({
  /** Called only with a fresh, server-owned immutable opportunity/state snapshot. */
  enqueue(request){
   const s=snapshot(request);if(s.error)return s.error;
   const existing=lookupSnapshot(s);if(existing.state==='prepared'||existing.state==='refused'||existing.completion)return existing;
   // Supersession is bounded to this account; other owners cannot share a key.
   discardOwner(s.ownerId,s.key);
   if(jobs.size>=limits.maxJobs||pendingBytes+s.bytes>limits.maxPendingBytes)return unavailable('QUEUE_FULL',s.key);
   let resolve;const completion=new Promise(done=>{resolve=done;});
   const job={id:randomUUID(),key:s.key,ownerId:s.ownerId,operation:s.operation,bytes:s.bytes,requestJSON:s.json,deadline:now()+limits.totalTimeoutMs,resolve,worker:null,finished:false};
   job.handle=pending(s.key,{completion});job.timer=setTimeout(()=>finish(job,unavailable('QUEUE_TIMEOUT',job.key)),limits.totalTimeoutMs);
   jobs.set(s.key,job);pendingBytes+=s.bytes;schedule();return job.handle;
  },
  /** Reconstruct request under the fresh player lock. expectedKey fences a late
   * notification. Neither this return nor a cached artifact authorizes a commit. */
  lookup(currentRequest,expectedKey){
   const s=snapshot(currentRequest);if(s.error)return s.error;
   if(expectedKey!==undefined&&s.key!==expectedKey)return unavailable('STATE_OBSOLETE',s.key);
   return lookupSnapshot(s);
  },
  invalidateOwner(ownerId){discardOwner(ownerId);},
  cancel(ownerId,key){const job=jobs.get(key);if(job?.ownerId===ownerId)finish(job,unavailable('WORKER_CANCELLED',key));if(cache.get(key)?.ownerId===ownerId)cacheDelete(key);},
  stats(){prune();return Object.freeze({enabled:enabled&&!closed,closed,jobs:jobs.size,workers:liveWorkers.size,pendingBytes,cacheEntries:cache.size,cacheBytes,startedCount,highWaterWorkers});},
  async close(){
   closed=true;for(const job of jobs.values())finish(job,unavailable('WORKER_CLOSED',job.key));
   for(const key of cache.keys())cacheDelete(key);
   await Promise.all([...liveWorkers].map(worker=>worker.terminate().catch(()=>{})));
  },
 });
}
