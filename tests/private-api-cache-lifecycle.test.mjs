import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
import {installPrivateApiCacheCleanup} from '../src/services/privateApiCache.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function environment(t){
  const names=['window','document','navigator','caches','fetch','__APP_BUILD_ID__','__proofRegisterSW'];
  const previous=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const stops=[];
  t.after(()=>{for(const stop of stops)stop();for(const [name,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  const intervals=new Map(),timeouts=new Map(),deletions=[],updates=[],replaced=[],storage=new Map();let next=0;
  const window=new EventTarget(),document=new EventTarget(),worker=new EventTarget();
  Object.assign(window,{setInterval:(fn,ms)=>{intervals.set(++next,{fn,ms});return next;},clearInterval:id=>intervals.delete(id),setTimeout:(fn,ms)=>{timeouts.set(++next,{fn,ms});return next;},clearTimeout:id=>timeouts.delete(id),location:{href:'https://fixture.invalid/?tab=merge#hud',replace:url=>replaced.push(url)},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}});
  document.visibilityState='visible';
  Object.defineProperty(globalThis,'navigator',{value:{serviceWorker:worker},configurable:true});
  Object.assign(globalThis,{window,document,caches:{delete:async name=>{deletions.push(name);return true;}},__APP_BUILD_ID__:'build-a',fetch:async()=>new Response(JSON.stringify({buildId:'build-a'}))});
  globalThis.__proofRegisterSW=()=>{updates.push('registered');return async force=>updates.push(force);};
  return{intervals,timeouts,deletions,updates,replaced,worker,window,document,storage,stops};
}

test('visible maintenance catches recreated API cache and stops on hide/unmount',async t=>{
  const e=environment(t),stop=installPrivateApiCacheCleanup();await flush();
  assert.deepEqual(e.deletions,['api-get-cache']);
  const timer=[...e.intervals.values()].find(value=>value.ms===5000);assert.ok(timer);
  await timer.fn();assert.equal(e.deletions.length,2);
  e.document.visibilityState='hidden';e.document.dispatchEvent(new Event('visibilitychange'));assert.equal(e.intervals.size,0);
  e.document.visibilityState='visible';e.document.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(e.deletions.length,3);
  e.worker.dispatchEvent(new Event('controllerchange'));e.window.dispatchEvent(new Event('pageshow'));e.window.dispatchEvent(new Event('focus'));await flush();assert.equal(e.deletions.length,6);
  stop();e.worker.dispatchEvent(new Event('controllerchange'));e.window.dispatchEvent(new Event('focus'));await timer.fn();assert.equal(e.intervals.size,0);assert.equal(e.deletions.length,6);
  assert.ok(e.deletions.every(name=>name==='api-get-cache'));
});

test('maintenance reports cleanup failure and recovers without deleting other stores',async t=>{
  const e=environment(t),errors=[];t.mock.method(console,'error',(...args)=>errors.push(args));
  caches.delete=async()=>{throw Error('cache unavailable');};
  const stop=installPrivateApiCacheCleanup();await flush();
  const timer=[...e.intervals.values()][0];await timer.fn();assert.equal(errors.length,1);
  caches.delete=async name=>{e.deletions.push(name);return true;};await timer.fn();
  caches.delete=async()=>{throw Error('failed again');};await timer.fn();assert.equal(errors.length,2);
  stop();assert.deepEqual(e.deletions,['api-get-cache']);
});

registerHooks({resolve(specifier,context,next){if(specifier==='virtual:pwa-register')return{url:'data:text/javascript,export const registerSW = (...args) => globalThis.__proofRegisterSW(...args)',shortCircuit:true};return next(specifier,context);}});
const {installUpdateManager}=await import('../src/services/updateManager.js');

test('actual update manager survives StrictMode remount and keeps same-build cleanup',async t=>{
  const e=environment(t);let stop=installUpdateManager();await flush();stop();
  assert.equal(e.intervals.size,0);assert.equal(e.timeouts.size,0);
  stop=installUpdateManager();await flush();assert.equal(e.updates.filter(v=>v==='registered').length,2);
  await [...e.timeouts.values()][0].fn();assert.deepEqual(e.replaced,[]);
  assert.ok(e.deletions.length>=2);assert.ok(e.deletions.every(name=>name==='api-get-cache'));stop();
});

test('build upgrade deletes only retired API cache, awaits registration helper and reloads once',async t=>{
  const e=environment(t);fetch=async()=>new Response(JSON.stringify({buildId:'build-b'}));
  const stop=installUpdateManager();e.stops.push(stop);await flush();const check=[...e.timeouts.values()][0].fn;
  await check();await check();
  assert.deepEqual(e.replaced,['/?tab=merge&build=build-b#hud']);assert.ok(e.updates.includes(true));
  assert.ok(e.deletions.every(name=>name==='api-get-cache'));stop();
});

test('an update config reply after unmount cannot reload the disposed page',async t=>{
  const e=environment(t);let finish;fetch=()=>new Promise(resolve=>{finish=resolve;});
  const stop=installUpdateManager();e.stops.push(stop);await flush();const pending=[...e.timeouts.values()][0].fn();stop();
  finish(new Response(JSON.stringify({buildId:'build-b'})));await pending;assert.deepEqual(e.replaced,[]);assert.equal(e.updates.filter(v=>v===true).length,0);
});

test('transient upgrade cleanup failure does not consume the next healthy retry',async t=>{
  const e=environment(t);fetch=async()=>new Response(JSON.stringify({buildId:'build-b'}));
  const stop=installUpdateManager();e.stops.push(stop);await flush();const check=[...e.timeouts.values()][0].fn;
  caches.delete=async()=>{throw Error('transient cleanup failure');};await check();
  assert.equal(e.storage.get('gh_build_reload_guard'),undefined);assert.deepEqual(e.replaced,[]);
  caches.delete=async name=>{e.deletions.push(name);return true;};await check();
  assert.equal(e.replaced.length,1);assert.ok(e.storage.get('gh_build_reload_guard'));stop();
});
test('registration helper failure does not consume the next healthy retry',async t=>{
  const e=environment(t);let fails=true;fetch=async()=>new Response(JSON.stringify({buildId:'build-b'}));
  __proofRegisterSW=()=>async()=>{if(fails)throw Error('registration setup failure');};
  const stop=installUpdateManager();e.stops.push(stop);await flush();const check=[...e.timeouts.values()][0].fn;
  await check();assert.equal(e.storage.get('gh_build_reload_guard'),undefined);
  fails=false;await check();assert.equal(e.replaced.length,1);stop();
});
for(const previousGuard of [null,'{"buildId":"earlier-build","at":0}']){
  test(`failed navigation restores ${previousGuard===null?'absent':'previous'} guard and allows retry`,async t=>{
    const e=environment(t);if(previousGuard!==null)e.storage.set('gh_build_reload_guard',previousGuard);
    fetch=async()=>new Response(JSON.stringify({buildId:'build-b'}));
    const stop=installUpdateManager();e.stops.push(stop);await flush();const check=[...e.timeouts.values()][0].fn;
    const replace=e.window.location.replace;e.window.location.replace=()=>{throw Error('navigation unavailable');};
    await check();assert.equal(e.storage.get('gh_build_reload_guard')??null,previousGuard);
    e.window.location.replace=replace;await check();assert.equal(e.replaced.length,1);stop();
  });
}
test('unmount while upgrade cleanup is pending cannot mark a guard or reload',async t=>{
  const e=environment(t);fetch=async()=>new Response(JSON.stringify({buildId:'build-b'}));
  const stop=installUpdateManager();e.stops.push(stop);await flush();let finish;caches.delete=()=>new Promise(resolve=>{finish=resolve;});
  const pending=[...e.timeouts.values()][0].fn();await flush();stop();finish(true);await pending;
  assert.equal(e.storage.get('gh_build_reload_guard'),undefined);assert.deepEqual(e.replaced,[]);
});
test('concurrent successful update checks still reload only once',async t=>{
  const e=environment(t);fetch=async()=>new Response(JSON.stringify({buildId:'build-b'}));
  const stop=installUpdateManager();e.stops.push(stop);await flush();const check=[...e.timeouts.values()][0].fn;
  await Promise.all([check(),check()]);assert.equal(e.replaced.length,1);stop();
});
