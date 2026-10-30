import assert from 'node:assert/strict';
import {test} from 'node:test';
import {installPrivateApiCacheCleanup} from '../src/services/privateApiCache.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function environment(t){
  const names=['window','document','navigator','caches','fetch','__APP_BUILD_ID__'];
  const previous=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const stops=[];
  t.after(()=>{for(const stop of stops)stop();for(const [name,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  const intervals=new Map(),timeouts=new Map(),deletions=[],updates=[],replaced=[],storage=new Map();let next=0;
  const window=new EventTarget(),document=new EventTarget(),worker=new EventTarget();
  worker.register=async()=>{updates.push('registered');return{update:async()=>updates.push('checked')};};
  Object.assign(window,{setInterval:(fn,ms)=>{intervals.set(++next,{fn,ms});return next;},clearInterval:id=>intervals.delete(id),setTimeout:(fn,ms)=>{timeouts.set(++next,{fn,ms});return next;},clearTimeout:id=>timeouts.delete(id),location:{href:'https://fixture.invalid/?tab=merge#hud',replace:url=>replaced.push(url)},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}});
  document.visibilityState='visible';
  Object.defineProperty(globalThis,'navigator',{value:{serviceWorker:worker},configurable:true});
  Object.assign(globalThis,{window,document,caches:{delete:async name=>{deletions.push(name);return true;}},__APP_BUILD_ID__:'build-a',fetch:async()=>new Response(JSON.stringify({buildId:'build-a'}))});
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

const {installUpdateManager,checkForAppUpdate}=await import('../src/services/updateManager.js');

test('a newer build is offered without navigating an active document',async t=>{
 const e=environment(t),available=[];fetch=async()=>new Response(JSON.stringify({buildId:'build-b'}));
 const stop=installUpdateManager({onUpdateAvailable:update=>available.push(update)});e.stops.push(stop);await flush();
 await [...e.timeouts.values()].find(timer=>timer.ms===4000).fn();
 assert.deepEqual(e.replaced,[]);
 assert.equal(available.at(-1)?.buildId,'build-b');
 assert.equal(typeof available.at(-1)?.apply,'function');
 assert.equal(e.storage.get('gh_build_reload_guard'),undefined);
});

test('actual update manager survives StrictMode remount and keeps same-build cleanup',async t=>{
  const e=environment(t);let stop=installUpdateManager();await flush();stop();
  assert.equal(e.intervals.size,0);assert.equal(e.timeouts.size,0);
  stop=installUpdateManager();await flush();assert.equal(e.updates.filter(v=>v==='registered').length,2);
  await [...e.timeouts.values()][0].fn();assert.deepEqual(e.replaced,[]);
  assert.ok(e.deletions.length>=2);assert.ok(e.deletions.every(name=>name==='api-get-cache'));stop();
});

test('only an explicit settled update deletes retired API cache and navigates once',async t=>{
  const e=environment(t);fetch=async()=>new Response(JSON.stringify({buildId:'build-b'}));
  let update;const stop=installUpdateManager({onUpdateAvailable:value=>update=value});e.stops.push(stop);await flush();const check=[...e.timeouts.values()][0].fn;
  await check();await check();
  assert.deepEqual(e.replaced,[]);assert.equal(await update.apply(),false);
  assert.equal(await update.apply({canReload:()=>false}),false);
  assert.equal(await update.apply({canReload:()=>true}),true);
  assert.equal(await update.apply({canReload:()=>true}),false);
  assert.deepEqual(e.replaced,['/?tab=merge&build=build-b#hud']);assert.ok(e.updates.includes('registered'));
  assert.ok(e.deletions.every(name=>name==='api-get-cache'));stop();
});

test('an update config reply after unmount cannot reload the disposed page',async t=>{
  const e=environment(t);let finish;fetch=()=>new Promise(resolve=>{finish=resolve;});
  const stop=installUpdateManager();e.stops.push(stop);await flush();const pending=[...e.timeouts.values()][0].fn();stop();
  finish(new Response(JSON.stringify({buildId:'build-b'})));await pending;assert.deepEqual(e.replaced,[]);assert.equal(e.updates.filter(v=>v==='checked').length,0);
});

test('transient upgrade cleanup failure does not consume the next healthy retry',async t=>{
  const e=environment(t);fetch=async()=>new Response(JSON.stringify({buildId:'build-b'}));
  let update;const stop=installUpdateManager({onUpdateAvailable:value=>update=value});e.stops.push(stop);await flush();const check=[...e.timeouts.values()][0].fn;await check();
  caches.delete=async()=>{throw Error('transient cleanup failure');};assert.equal(await update.apply({canReload:()=>true}),false);
  assert.equal(e.storage.get('gh_build_reload_guard'),undefined);assert.deepEqual(e.replaced,[]);
  caches.delete=async name=>{e.deletions.push(name);return true;};await update.apply({canReload:()=>true});
  assert.equal(e.replaced.length,1);assert.ok(e.storage.get('gh_build_reload_guard'));stop();
});
test('unavailable service worker cannot strand a manually confirmed update',async t=>{
  const e=environment(t);fetch=async()=>new Response(JSON.stringify({buildId:'build-b'}));
  e.worker.register=async()=>{throw Error('registration unavailable');};
  let update;const stop=installUpdateManager({onUpdateAvailable:value=>update=value});e.stops.push(stop);await flush();const check=[...e.timeouts.values()][0].fn;
  await check();assert.equal(e.storage.get('gh_build_reload_guard'),undefined);
  await update.apply({canReload:()=>true});assert.equal(e.replaced.length,1);stop();
});
for(const previousGuard of [null,'{"buildId":"earlier-build","at":0}']){
  test(`failed navigation restores ${previousGuard===null?'absent':'previous'} guard and allows retry`,async t=>{
    const e=environment(t);if(previousGuard!==null)e.storage.set('gh_build_reload_guard',previousGuard);
    fetch=async()=>new Response(JSON.stringify({buildId:'build-b'}));
    let update;const stop=installUpdateManager({onUpdateAvailable:value=>update=value});e.stops.push(stop);await flush();const check=[...e.timeouts.values()][0].fn;await check();
    const replace=e.window.location.replace;e.window.location.replace=()=>{throw Error('navigation unavailable');};
    await update.apply({canReload:()=>true});assert.equal(e.storage.get('gh_build_reload_guard')??null,previousGuard);
    e.window.location.replace=replace;await update.apply({canReload:()=>true});assert.equal(e.replaced.length,1);stop();
  });
}
test('unmount while upgrade cleanup is pending cannot mark a guard or reload',async t=>{
  const e=environment(t);fetch=async()=>new Response(JSON.stringify({buildId:'build-b'}));
  let update;const stop=installUpdateManager({onUpdateAvailable:value=>update=value});e.stops.push(stop);await flush();await [...e.timeouts.values()][0].fn();let finish;caches.delete=()=>new Promise(resolve=>{finish=resolve;});
  const pending=update.apply({canReload:()=>true});await flush();stop();finish(true);await pending;
  assert.equal(e.storage.get('gh_build_reload_guard'),undefined);assert.deepEqual(e.replaced,[]);
});
test('concurrent checks notify once and concurrent explicit applies navigate once',async t=>{
  const e=environment(t);fetch=async()=>new Response(JSON.stringify({buildId:'build-b'}));
  const notifications=[];const stop=installUpdateManager({onUpdateAvailable:value=>notifications.push(value)});e.stops.push(stop);await flush();const check=[...e.timeouts.values()][0].fn;
  await Promise.all([check(),check()]);assert.equal(notifications.length,1);assert.equal(e.replaced.length,0);
  await Promise.all([notifications[0].apply({canReload:()=>true}),notifications[0].apply({canReload:()=>true})]);assert.equal(e.replaced.length,1);stop();
});

test('a pending save or changed account after cleanup fences the explicit update',async t=>{
 const e=environment(t);fetch=async()=>new Response(JSON.stringify({buildId:'build-b'}));
 let update,allowed=true,finish;const stop=installUpdateManager({onUpdateAvailable:value=>update=value});e.stops.push(stop);await flush();await [...e.timeouts.values()][0].fn();
 caches.delete=()=>new Promise(resolve=>finish=resolve);const pending=update.apply({canReload:()=>allowed});await flush();allowed=false;finish(true);
 assert.equal(await pending,false);assert.deepEqual(e.replaced,[]);assert.equal(e.storage.get('gh_build_reload_guard'),undefined);
});

test('a reverted version clears its update offer without navigating',async t=>{
 const e=environment(t);fetch=async()=>new Response(JSON.stringify({buildId:'build-b'}));const offers=[];
 const stop=installUpdateManager({onUpdateAvailable:value=>offers.push(value)});e.stops.push(stop);await flush();const check=[...e.timeouts.values()][0].fn;await check();
 const old=offers[0];fetch=async()=>new Response(JSON.stringify({buildId:'build-a'}));await check();assert.equal(offers.at(-1),null);
 assert.equal(await old.apply({canReload:()=>true}),false);assert.deepEqual(e.replaced,[]);
});

test('a foreground version preflight joins the pending poll before allowing a game change',async t=>{
 const e=environment(t);let finish,sends=0;fetch=()=>{sends++;return new Promise(resolve=>finish=resolve);};
 const stop=installUpdateManager();e.stops.push(stop);await flush();const pending=[...e.timeouts.values()][0].fn();
 const foreground=checkForAppUpdate();assert.equal(sends,1);finish(new Response(JSON.stringify({buildId:'build-b'})));
 const [poll,result]=await Promise.all([pending,foreground]);assert.equal(poll.buildId,'build-b');assert.equal(result.buildId,'build-b');assert.deepEqual(e.replaced,[]);
 assert.equal(await result.apply({canReload:()=>true,tab:'bentoku'}),true);assert.deepEqual(e.replaced,['/?tab=bentoku&build=build-b#hud']);
});
