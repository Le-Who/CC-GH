/** Unit-test transport only. The real-worker suite never registers this loader. */
export async function load(url,context,next){
 if(url.endsWith('/game-logic/yard-v2/canonical-visit-worker-thread.mjs'))return {format:'module',shortCircuit:true,source:`
  import {workerData,parentPort,threadId} from 'node:worker_threads';
  import {createHash} from 'node:crypto';
  const request=JSON.parse(workerData.requestJSON),mode=request.input.candidate?.visitId??request.input.record?.transportMode;
  if(mode==='crash')throw Error('fixture worker failed');
  if(mode==='exit')process.exit(0);
  if(mode==='hang')Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10000);
  if(mode==='slow'||mode==='refused-slow')Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,180);
  const artifact={prepared:true,ready:false,admission:false,record:{status:'prepared-inactive',authoritative:false,economicIntent:{committed:false}},plan:{transportFixture:true}};
  if(mode==='permission')artifact.admission=true;
  if(mode==='padding')artifact.plan.padding='x'.repeat(700);
  const json=mode==='oversize'?'x'.repeat(workerData.maxResultBytes+1):JSON.stringify(artifact);
  const message={protocol:workerData.protocol,sourceHash:workerData.sourceHash,id:workerData.id,key:workerData.key,threadId,kind:'artifact',json,bytes:Buffer.byteLength(json),artifactHash:createHash('sha256').update(json).digest('hex'),elapsedMs:0};
  if(mode==='wrong-key')message.key='wrong';
  if(mode==='wrong-job')message.id='wrong';
  if(mode==='wrong-source')message.sourceHash='wrong';
  if(mode==='wrong-thread')message.threadId=0;
  if(mode==='wrong-hash')message.artifactHash='wrong';
  if(mode==='refusal'){message.kind='unavailable';message.code='SOURCE_UNAVAILABLE';message.sourceCode='R1_SAVED_NO_NEUTRAL_REST_ANCHOR';}
  if(mode?.startsWith('refused')){
   const refusal={prepared:false,ready:false,admission:false,sourceCode:request.input.candidate?.sourceCode??'R1_SAVED_NO_NEUTRAL_REST_ANCHOR'};
   message.kind='refused';
   if(mode==='refused-permission')refusal.admission=true;
   if(mode==='refused-extra')refusal.record={status:'prepared-inactive'};
   if(mode==='refused-prepared')refusal.prepared=true;
   message.json=mode==='refused-json'?'invalid':JSON.stringify(refusal);
   message.bytes=Buffer.byteLength(message.json);
   message.artifactHash=createHash('sha256').update(message.json).digest('hex');
   if(mode==='refused-hash')message.artifactHash='wrong';
   if(mode==='refused-bytes')message.bytes++;
   if(mode==='refused-source')message.sourceHash='wrong';
   if(mode==='refused-protocol')message.protocol='yard-canonical-visit-worker/v1';
   if(mode==='refused-thread')message.threadId=0;
   if(mode==='refused-key')message.key='wrong';
   if(mode==='refused-job')message.id='wrong';
   if(mode==='refused-elapsed')message.elapsedMs=-1;
  }
  parentPort.postMessage(message);
  if(mode==='duplicate')parentPort.postMessage({...message,key:'late-wrong-key'});
  parentPort.close();
 `};
 return next(url,context);
}
