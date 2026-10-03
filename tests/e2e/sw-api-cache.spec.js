import {test,expect} from '@playwright/test';
import {startSwFixture,registerWorker,rawSnapshot,legacyCache,legacyCacheRows} from './helpers/swFixture.mjs';

test.describe('production service-worker privacy and lazy shell',()=>{
  test.use({serviceWorkers:'allow'});
  let fixture;
  test.beforeAll(async()=>{fixture=await startSwFixture();});
  test.afterAll(async()=>{await fixture?.close();});
  test.beforeEach(()=>{fixture.failApi(false);fixture.delayAccountA(0);fixture.delayAccountB(0);fixture.freshHttpCache(false);});
  async function proofPage(page,account='a'){
    await page.goto(`${fixture.origin}/sw-proof.html?account=${account}`);
    await page.waitForFunction(()=>window.swProof);
  }
  async function seedLegacy(page){
    await registerWorker(page,'/legacy-sw.js');
    expect((await rawSnapshot(page)).body.player.id).toBe('account-a');
    await expect.poll(async()=>(await legacyCache(page))?.player?.id).toBe('account-a');
  }
  test('old controlling worker cannot give account A to a cold account B offline',async({page,context})=>{
    await proofPage(page);await seedLegacy(page);fixture.failApi();await proofPage(page,'b');
    const result=await page.evaluate(async()=>({returned:await swProof.hub.getState().loadSnapshot(),owner:swProof.hub.getState().snapshot?.player?.id,status:swProof.hub.getState().status}));
    expect(result.returned.error).toBe('NETWORK_ERROR');expect(result.owner).toBeUndefined();expect(result.status).toBe('offline');
    fixture.failApi(false);await context.setOffline(true);
    expect((await page.evaluate(()=>swProof.api('/api/resources/state'))).error).toBe('NETWORK_ERROR');
    await context.setOffline(false);
  });
  test('fresh worker uses network-only even when an old client requests a fresh HTTP-cached URL',async({page})=>{
    await proofPage(page);fixture.freshHttpCache();
    expect((await rawSnapshot(page)).body.player.id).toBe('account-a');
    await registerWorker(page,'/sw.js');
    const before=fixture.requests.filter(r=>r.account==='account-b').length;
    const response=await rawSnapshot(page,'fixture-b');
    expect(response.body.player.id).toBe('account-b');
    expect(fixture.requests.filter(r=>r.account==='account-b').length).toBeGreaterThan(before);
    expect(await legacyCache(page)).toBeNull();
  });
  test('old worker timeout cannot substitute its cached A reply for a delayed cold B read',async({page})=>{
    await proofPage(page);await seedLegacy(page);fixture.delayAccountB(6500);await proofPage(page,'b');
    const result=await page.evaluate(()=>swProof.hub.getState().loadSnapshot());
    expect(result.player.id).toBe('account-b');expect(await page.evaluate(()=>swProof.hub.getState().snapshot.player.id)).toBe('account-b');
  });
  test('upgrade fences delayed old requests and clears recreated API cache while preserving saves',async({page,context},testInfo)=>{
    test.setTimeout(60000);
    await proofPage(page);await seedLegacy(page);
    await page.evaluate(async()=>{
      for(const name of ['runtime-art-v1','font-cache','unrelated-cache'])await(await caches.open(name)).put('/preserved-proof',new Response('preserved'));
      await new Promise((done,reject)=>{const request=indexedDB.open('keyval-store',1);request.onupgradeneeded=()=>request.result.createObjectStore('keyval');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const tx=db.transaction('keyval','readwrite');tx.objectStore('keyval').put({owner:'account-a',progress:42},'sw-proof-player-progress');tx.oncomplete=()=>{db.close();done();};};});
    });
    const delayedBefore=fixture.delayedResponses.length;
    const aBefore=fixture.requests.filter(r=>r.account==='account-a'&&r.path==='/api/player/snapshot').length;
    fixture.delayAccountA(9000);
    await page.evaluate(()=>{window.oldRequest=fetch('/api/player/snapshot?legacyLate=first',{headers:{Authorization:'tma fixture-a'}}).then(r=>r.json()).catch(()=>null);});
    await expect.poll(()=>fixture.requests.filter(r=>r.account==='account-a'&&r.path==='/api/player/snapshot').length).toBeGreaterThan(aBefore);
    fixture.delayAccountA(15000);
    await page.evaluate(()=>{window.secondOldRequest=fetch('/api/player/snapshot?legacyLate=second',{headers:{Authorization:'tma fixture-a'}}).then(r=>r.json()).catch(()=>null);});
    await expect.poll(()=>fixture.requests.filter(r=>r.account==='account-a'&&r.path==='/api/player/snapshot').length).toBeGreaterThan(aBefore+1);
    await registerWorker(page,'/sw.js');
    const b=await context.newPage();await proofPage(b,'b');
    expect((await b.evaluate(()=>swProof.hub.getState().loadSnapshot())).player.id).toBe('account-b');
    await expect.poll(()=>fixture.delayedResponses.length,{timeout:12000}).toBeGreaterThan(delayedBefore);
    expect((await page.evaluate(()=>window.oldRequest)).player.id).toBe('account-a');
    const afterFirst=await legacyCacheRows(b);
    // Old-worker lifetime differs between browsers. Record actual late writes;
    // never assume that activation must reproduce an unsafe cache resurrection.
    await b.evaluate(()=>{window.stopProofCleanup=swProof.installCleanup();});
    await expect.poll(()=>legacyCacheRows(b),{timeout:2000}).toEqual([]);
    await expect.poll(()=>fixture.delayedResponses.length,{timeout:10000}).toBeGreaterThan(delayedBefore+1);
    expect((await page.evaluate(()=>window.secondOldRequest)).player.id).toBe('account-a');
    const afterSecond=await legacyCacheRows(b);
    await expect.poll(()=>legacyCacheRows(b),{timeout:6500}).toEqual([]);
    // Explicitly simulate the worst-case cache recreation, independently of
    // browser worker-lifetime behavior, and exercise the real maintenance timer.
    await b.evaluate(async()=>{await(await caches.open('api-get-cache')).put(new Request('/api/player/snapshot?legacyLate=simulated',{headers:{Authorization:'tma fixture-a'}}),new Response(JSON.stringify({player:{id:'account-a'}})));});
    expect((await legacyCacheRows(b))[0].authorization).toBe('tma fixture-a');
    await expect.poll(()=>legacyCacheRows(b),{timeout:6500}).toEqual([]);
    await testInfo.attach('sw-upgrade-diagnostics.json',{body:Buffer.from(JSON.stringify({afterFirst,afterSecond,delayedResponses:fixture.delayedResponses.slice(delayedBefore),simulatedLateWriteCleared:true},null,2)),contentType:'application/json'});
    expect((await b.evaluate(()=>swProof.hub.getState().loadSnapshot())).player.id).toBe('account-b');
    await context.setOffline(true);
    expect((await b.evaluate(()=>swProof.hub.getState().loadSnapshot())).error).toBe('NETWORK_ERROR');
    expect(await b.evaluate(()=>swProof.hub.getState().snapshot.player.id)).toBe('account-b');
    await context.setOffline(false);
    const preserved=await b.evaluate(async()=>{
      const names=await caches.keys();const art=await Promise.all(['runtime-art-v1','font-cache','unrelated-cache'].map(async name=>({name,value:await(await(await caches.open(name)).match('/preserved-proof')).text()})));
      const progress=await new Promise((done,reject)=>{const r=indexedDB.open('keyval-store',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('keyval');const get=tx.objectStore('keyval').get('sw-proof-player-progress');get.onsuccess=()=>done(get.result);tx.oncomplete=()=>db.close();};});
      return {names,art,progress};
    });
    expect(preserved.names).not.toContain('api-get-cache');expect(preserved.art.every(a=>a.value==='preserved')).toBe(true);expect(preserved.progress).toEqual({owner:'account-a',progress:42});
    await b.evaluate(()=>window.stopProofCleanup());await b.close();
  });
  test('actual production boot precaches the shell and leaves other games lazy',async({page,context},testInfo)=>{
    test.setTimeout(60000);
    const requests=[],errors=[];
    context.on('request',request=>requests.push({path:new URL(request.url()).pathname,worker:!!request.serviceWorker()}));
    page.on('pageerror',error=>errors.push(error.message));
    const cdp=await context.newCDPSession(page);cdp.on('ServiceWorker.workerErrorReported',event=>errors.push(event.errorMessage.errorMessage));await cdp.send('ServiceWorker.enable');
    await page.addInitScript(()=>localStorage.setItem('gh_dev_user_id','fixture-a'));
    try {
      await page.goto(fixture.origin+'/?tab=merge');await expect(page.locator('.status-dot.ready')).toHaveCount(1,{timeout:20000});
      await expect(page.getByTestId('ml-laboratory')).toBeVisible();
    } catch(error) {
      await testInfo.attach('sw-boot-failure.json',{body:Buffer.from(JSON.stringify({errors,requests,html:(await page.content()).slice(0,4000)},null,2)),contentType:'application/json'});
      throw error;
    }
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    const cached=await page.evaluate(async()=>{
      const name=(await caches.keys()).find(name=>name.startsWith('workbox-precache-'));
      const cache=await caches.open(name);return await Promise.all((await cache.keys()).map(async key=>({path:new URL(key.url).pathname,bytes:(await(await cache.match(key)).arrayBuffer()).byteLength})));
    });
    const gamePattern=/(?:LazyPixiSceneHost|PixiGameHost|Scene-|Game-|WebGLRenderer|WebGPURenderer)/;
    expect(cached.filter(row=>gamePattern.test(row.path))).toEqual([]);
    expect(requests.filter(row=>row.worker&&gamePattern.test(row.path))).toEqual([]);
    expect(requests.filter(row=>/(LegacyMergeGame|LazyPixiSceneHost|PixiGameHost|WebGLRenderer|WebGPURenderer)/.test(row.path))).toEqual([]);
    expect(requests.some(row=>row.path.includes('MergeLabGame')&&row.path.endsWith('.js'))).toBe(true);
    expect(requests.some(row=>row.path.includes('merge-lab-catalog')&&row.path.endsWith('.js'))).toBe(true);
    expect(errors).toEqual([]);
    const js=cached.filter(row=>row.path.endsWith('.js'));
    const pageResources=await page.evaluate(()=>performance.getEntriesByType('resource').filter(row=>new URL(row.name).pathname.endsWith('.js')).map(row=>({path:new URL(row.name).pathname,encodedBytes:row.encodedBodySize,transferBytes:row.transferSize,durationMs:row.duration})));
    const metrics={precacheEntries:cached.length,precacheBytes:cached.reduce((sum,row)=>sum+row.bytes,0),precacheJsEntries:js.length,precacheJsBytes:js.reduce((sum,row)=>sum+row.bytes,0),pageScriptEncodedBytes:pageResources.reduce((sum,row)=>sum+row.encodedBytes,0),pageResources,requests,cached};
    await testInfo.attach('sw-shell-network.json',{body:Buffer.from(JSON.stringify(metrics,null,2)),contentType:'application/json'});
    expect(metrics.precacheJsBytes).toBeLessThan(600000);
    expect(metrics.precacheBytes).toBeLessThan(1000000);
    expect(fixture.productionWorker).not.toContain('createHandlerBoundToURL("index.html")');
  });
});
