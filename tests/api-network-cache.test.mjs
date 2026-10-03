import assert from 'node:assert/strict';
import {test} from 'node:test';
import {api} from '../src/services/apiClient.js';

function environment(t){
  const previous=new Map(['window','fetch','caches'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  t.after(()=>{for(const [name,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  globalThis.window={Telegram:{WebApp:{initData:'fixture-a'}}};
  const cacheNames=new Set(['api-get-cache','runtime-art-v1','font-cache','unrelated']);
  const deletions=[],calls=[];
  globalThis.caches={delete:async name=>{deletions.push(name);return cacheNames.delete(name);}};
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({player:{id:options.headers.Authorization}}),{status:200,headers:{'Content-Type':'application/json'}});};
  return{cacheNames,deletions,calls};
}
test('personal GETs use distinct non-sensitive URLs across accounts and preserve the query',async t=>{
  const {calls}=environment(t);
  await api('/api/player/snapshot?mode=full');window.Telegram.WebApp.initData='fixture-b';await api('/api/player/snapshot?mode=full');
  assert.notEqual(calls[0].url,calls[1].url);
  for(const {url,options} of calls){const parsed=new URL(url,'https://local.test');assert.equal(parsed.pathname,'/api/player/snapshot');assert.equal(parsed.searchParams.get('mode'),'full');assert.ok(parsed.searchParams.get('__gh_read'));assert.ok(!url.includes('fixture-'));assert.equal(options.cache,'no-store');}
});
test('personal reads remove only the retired API cache, including a late old-worker write',async t=>{
  const {cacheNames,deletions}=environment(t);
  await api('/api/resources/state');cacheNames.add('api-get-cache');await api('/api/resources/state');
  assert.ok(!cacheNames.has('api-get-cache'));assert.deepEqual([...cacheNames].sort(),['font-cache','runtime-art-v1','unrelated']);assert.ok(deletions.length>=2);assert.ok(deletions.every(name=>name==='api-get-cache'));
});
test('an account change during asynchronous cache cleanup prevents the fetch',async t=>{
  const {calls}=environment(t);let current=true;
  caches.delete=async()=>{current=false;return true;};
  assert.equal((await api('/api/player/snapshot',undefined,{isCurrent:()=>current})).error,'ACCOUNT_CHANGED');assert.equal(calls.length,0);
});
test('private cache cleanup failure is explicit and fails before returning any snapshot',async t=>{
  const {calls}=environment(t);caches.delete=async()=>{throw Error('storage unavailable');};
  assert.equal((await api('/api/player/snapshot')).error,'NETWORK_CACHE_CLEANUP_FAILED');assert.equal(calls.length,0);
});
test('POST bodies and public configuration GET stay unchanged',async t=>{
  const {calls,deletions}=environment(t);const body={accountId:'canonical-b',action:'yard.claim',payload:{x:1}};
  await api('/api/player/mutate',body);await api('/api/config');
  assert.equal(calls[0].url,'/api/player/mutate');assert.equal(calls[0].options.body,JSON.stringify(body));assert.equal(calls[1].url,'/api/config');assert.deepEqual(deletions,[]);
});

test('stalled required cache cleanup returns TIMEOUT and never starts a late fetch',async t=>{
  const {calls}=environment(t);let finish;
  caches.delete=()=>new Promise(resolve=>{finish=resolve;});
  const pending=api('/api/player/snapshot',undefined,{timeoutMs:10});let watchdog;
  const result=await Promise.race([pending,new Promise(resolve=>{watchdog=setTimeout(()=>resolve({error:'CLEANUP_STILL_PENDING'}),200);})]);
  clearTimeout(watchdog);finish(true);await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(result,{error:'TIMEOUT'});assert.equal(calls.length,0);
});
test('network AbortError still returns TIMEOUT after successful private cache cleanup',async t=>{
  environment(t);let requests=0;
  fetch=async(_url,{signal})=>{requests++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}));};
  assert.deepEqual(await api('/api/player/snapshot',undefined,{timeoutMs:10}),{error:'TIMEOUT'});
  assert.equal(requests,1);
});
test('concurrent reads cannot fetch after their account retires during cleanup',async t=>{
  const {calls}=environment(t);let finish,current=true;
  const cleanup=new Promise(resolve=>{finish=resolve;});caches.delete=()=>cleanup;
  const options={isCurrent:()=>current};
  const first=api('/api/player/snapshot',undefined,options),second=api('/api/resources/state',undefined,options);
  await new Promise(resolve=>setImmediate(resolve));current=false;finish(true);
  assert.deepEqual(await Promise.all([first,second]),[{error:'ACCOUNT_CHANGED'},{error:'ACCOUNT_CHANGED'}]);
  assert.equal(calls.length,0);
});
test('absent retired cache still permits a private network read',async t=>{
  const {calls}=environment(t);caches.delete=async()=>false;
  assert.ok((await api('/api/player/snapshot')).player);assert.equal(calls.length,1);
});
