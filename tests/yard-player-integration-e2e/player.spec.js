import {test,expect} from '@playwright/test';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {assertYardPlayerApiEnvironment,assertYardPlayerFixture,YARD_API_PORTS} from '../helpers/yard-player-api-guard.mjs';
import {createDefaultPlayer} from '../../game-logic/player.js';
import {ensureMergeLabState} from '../../game-logic/merge-lab-service.js';
import {ensurePersistentPlayerYard} from '../../game-logic/yard-v2/service.mjs';
import {openHome,selectHomeGame} from '../e2e/helpers/home.js';
import {expectLegacyYardToolbarReachable} from '../e2e/helpers/yard-hud.js';
assertYardPlayerApiEnvironment();
const root=resolve(import.meta.dirname,'../..'),origin=mode=>`http://127.0.0.1:${YARD_API_PORTS[mode]}`;
const fixtures=[];let database,closeDatabase;
test.beforeAll(async()=>{
  const {initDb,ensureDbSchema,getDb,closeDb}=await import('../../db.js');
  if(!initDb())throw Error('Real PostgreSQL required');await ensureDbSchema();database=getDb();closeDatabase=closeDb;
  const [db]=await database`SELECT current_database() AS name,current_setting('server_version_num')::int AS version`;
  expect(db.name).toBe('ccgh_merge_ci');expect(db.version).toBeGreaterThanOrEqual(150000);expect(db.version).toBeLessThan(160000);
});
async function assertOwned(f){
  assertYardPlayerFixture(f.externalId,f.id);
  const [identity]=await database`SELECT account_id FROM account_identities WHERE provider='dev' AND external_id=${f.externalId}`;
  expect(identity?.account_id).toBe(f.id);
}
async function saved(f){await assertOwned(f);const [row]=await database`SELECT data FROM players WHERE id=${f.id}`;expect(row).toBeTruthy();return row.data;}
test.afterAll(async()=>{
  try{if(database)for(const f of fixtures){await assertOwned(f);await database`DELETE FROM players WHERE id=${f.id}`;await database`DELETE FROM accounts WHERE id=${f.id}`;}}
  finally{await closeDatabase?.();}
});
async function seed(kind='ordinary'){
  const externalId=assertYardPlayerFixture(`yard_player_api_${randomUUID()}`);
  const {getOrCreateAccountForIdentity}=await import('../../accountManager.js');
  const id=await getOrCreateAccountForIdentity('dev',externalId,{displayName:'Yard API fixture'}),f={id,externalId};fixtures.push(f);await assertOwned(f);
  const now=Date.now(),p=createDefaultPlayer(id,'Yard API fixture',now);p._onboarded=true;p._version=randomUUID();
  p.yard.currencies.treats=5000;p.yard.future={preserve:['opaque','integration']};
  ensureMergeLabState(p,{now});
  if(kind==='history'){
    p.yard.pendingGifts=Array.from({length:105},(_,i)=>({id:`legacy-${i}`,visitorId:'mika_cat',treats:2,shinyTreats:0,createdAt:now,opaque:i}));
    p.yard.album.photos=Array.from({length:110},(_,i)=>({id:`photo-${i}`,visitorId:'mika_cat',capturedAt:now,opaque:i}));
  }
  if(kind==='paused'){expect(ensurePersistentPlayerYard(p,{now}).status).toBe(200);}
  if(kind==='malformed'){p._yardV2={format:'future',version:99,opaque:['preserve']};p.yard.placedGoodies={opaque:'future-list'};p.yard.album.photos={opaque:'future-photos'};}
  await database`INSERT INTO players(id,data) VALUES(${id},${p})`;
  f.initial=structuredClone(p);return f;
}
async function snapshot(request,f,mode){const r=await request.get(`${origin(mode)}/api/player/snapshot`,{headers:{Authorization:`dev ${f.externalId}`}});expect(r.status()).toBe(200);return r.json();}
async function boot(page,f,mode,tab='room'){
  await page.addInitScript(id=>{localStorage.setItem('gh_dev_user_id',id);localStorage.setItem('garden_shelf_language','en');},f.externalId);
  await page.goto(`${origin(mode)}/?tab=${tab}`);
  await expect(page.locator('.status-dot.ready')).toHaveCount(1,{timeout:20000});
}
function mediaRequests(page){const seen=[];page.on('request',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/assets/yard-'))seen.push(path);});return seen;}
async function capture(page,info,name){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await info.attach(name,{body:await page.screenshot(),contentType:'image/png'});}
async function expectSceneReady(page){
  await expect.poll(()=>page.locator('.cy-background').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
  // Inspect only actual rendered pixels. No renderer diagnostics or private store hooks.
  await expect.poll(()=>page.locator('.cy-scene canvas').evaluate(canvas=>{
    if(!canvas.width||!canvas.height)return 0;const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let count=0;
    for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0&&++count>=32)return count;return count;
  })).toBeGreaterThanOrEqual(32);
  await expect(page.locator('.cy-status')).not.toContainText('The courtyard could not load.');
}
async function outbox(page,id){return page.evaluate(async accountId=>{
  const key=`game_hub_yard_outbox_v2:${encodeURIComponent(accountId)}`,fallback=localStorage.getItem(key);if(fallback)return JSON.parse(fallback);
  return new Promise((resolve,reject)=>{const request=indexedDB.open('keyval-store');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const read=db.transaction('keyval','readonly').objectStore('keyval').get(key);read.onsuccess=()=>{const value=read.result;db.close();resolve(value);};read.onerror=()=>{db.close();reject(read.error);};};});
},id);}
const adjacent=p=>({merge:p.merge,fence:p._mergeLabFence,garden:p.garden,gold:p.resources.gold,gachaTokens:p.resources.gachaTokens});

for(const [width,height,dpr] of [[320,568,1],[390,844,2],[568,320,1]])test.describe(`real player wiring ${width}x${height}`,()=>{
  test.use({viewport:{width,height},deviceScaleFactor:dpr,isMobile:true,hasTouch:true});
  test('closed ordinary account keeps legacy entry and never migrates through API or client flags',async({page,request},info)=>{
    const f=await seed(),media=mediaRequests(page);await boot(page,f,'closed');
    await expect(page.locator('.companion-yard-stage')).toBeVisible();await expect(page.locator('[data-yard-version],[data-yard-read-only]')).toHaveCount(0);
    await expectLegacyYardToolbarReachable(page);
    const s=await snapshot(request,f,'closed');expect(s.yardRuntime).toBeUndefined();expect((await saved(f))._yardV2).toBeUndefined();
    // Untrusted options are real HTTP input, never process policy.
    const reply=await request.post(`${origin('closed')}/api/player/mutate`,{headers:{Authorization:`dev ${f.externalId}`},data:{accountId:f.id,action:'yard.buyFood',payload:{foodId:'kibble'},clientActionId:`legacy:${randomUUID()}`,enabled:true,yardPlayerReleasePolicy:{enabled:true},serverNow:0}});
    expect(reply.status()).toBe(200);expect((await saved(f))._yardV2).toBeUndefined();
    await openHome(page);await selectHomeGame(page,'room');await expect(page.locator('.companion-yard-stage')).toBeVisible();await expect(page.locator('[data-yard-screen="settings"]')).toHaveCount(0);await expectLegacyYardToolbarReachable(page);
    expect(media.some(p=>/^\/assets\/yard-(mika|mochi|pebble|pip|family|fox|turtles)\//.test(p))).toBe(false);await capture(page,info,'closed-legacy-entry');
  });
  for(const [mode,kind] of [['closed','paused'],['closed','malformed'],['active','malformed']])test(`${mode} ${kind} save is preserved in a read-only shell with Home exit`,async({page,request},info)=>{
    const f=await seed(kind),media=mediaRequests(page),before=await saved(f);await boot(page,f,mode);
    await expect(page.locator('[data-yard-read-only=true]')).toBeVisible();await expect(page.locator('.cy-app,.companion-yard-stage')).toHaveCount(0);
    const s=await snapshot(request,f,mode);expect(s.yardRuntime.mutable).toBe(false);expect(s.merge.schemaVersion).toBe(3);
    const reply=await request.post(`${origin(mode)}/api/player/mutate`,{headers:{Authorization:`dev ${f.externalId}`},data:{accountId:f.id,action:'yard.collectGifts',payload:{},clientActionId:`yard-v2:${randomUUID()}`}});expect(reply.status()).toBe(409);
    const after=await saved(f);expect(after.yard).toEqual(before.yard);expect(after._yardV2).toEqual(before._yardV2);expect(after.merge).toEqual(before.merge);
    await capture(page,info,`${mode}-${kind}-quarantine`);await page.getByRole('button',{name:'Back to games',exact:true}).click();await expect(page.getByTestId('home-catalogue')).toBeVisible();
    await selectHomeGame(page,'garden');await expect(page.locator('.gs2-stage')).toBeVisible();expect(media).toEqual([]);
  });
  test('active real snapshot migrates once; real outbox survives lost collect reply without double credit',async({page,request},info)=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));const f=await seed('history'),media=mediaRequests(page);
    expect((await saved(f))._yardV2).toBeUndefined();await boot(page,f,'active');await expect(page.locator('.cy-app')).toBeVisible();await expectSceneReady(page);
    await expect.poll(()=>media.includes('/assets/yard-mika/runtime-media.json')&&media.includes('/assets/yard-mika/still-layer-contract.json')).toBe(true);
    const migrated=await saved(f);expect(migrated.yard.pendingGifts).toEqual(f.initial.yard.pendingGifts);expect(migrated.yard.album).toEqual(f.initial.yard.album);expect(migrated.yard.future).toEqual(f.initial.yard.future);
    expect(migrated._yardV2.migration.rawBackup.yard).toEqual(f.initial.yard);const migration=structuredClone(migrated._yardV2.migration);
    const s=await snapshot(request,f,'active');expect(s.yardRuntime.actionProtocol).toBe('yard-v2:');expect(s.yardRuntime.mutable).toBe(true);expect(s.yardRuntime.migration).toBeUndefined();expect(s.yardRuntime.commandReceipts).toBeUndefined();
    const before=await saved(f),commands=[];let dropped=false,committedReply;
    await page.route('**/api/player/mutate',async route=>{
      const command=route.request().postDataJSON();if(command?.action!=='yard.collectGifts')return route.continue();commands.push(command);
      if(!dropped){dropped=true;const response=await route.fetch();committedReply={status:response.status(),body:await response.json()};return route.abort('failed');}
      return route.continue();
    });
    const replay=page.waitForResponse(async r=>new URL(r.url()).pathname==='/api/player/mutate'&&r.request().postDataJSON()?.action==='yard.collectGifts'&&r.status()===200&&(await r.json()).duplicate===true);
    await page.locator('.cy-actions button').nth(2).click();await page.getByRole('button',{name:'Collect',exact:true}).click();
    const replayBody=await (await replay).json();expect(committedReply.status).toBe(200);expect(committedReply.body.duplicate).toBe(false);expect(commands.length).toBeGreaterThanOrEqual(2);expect(new Set(commands.map(c=>c.clientActionId)).size).toBe(1);expect(commands[0].clientActionId).toMatch(/^yard-v2:/);
    expect(replayBody.clientActionId).toBe(commands[0].clientActionId);await expect.poll(async()=>{const stored=await outbox(page,f.id);return stored?.version===2&&stored.accountId===f.id&&stored.items.length===0;}).toBe(true);
    const after=await saved(f);expect(after.yard.currencies.treats).toBe(before.yard.currencies.treats+210);expect(after.yard.currencies.shinyTreats).toBe(before.yard.currencies.shinyTreats);expect(after.yard.pendingGifts).toEqual([]);expect(after.yard.album).toEqual(before.yard.album);expect(after._yardV2.migration).toEqual(migration);expect(adjacent(after)).toEqual(adjacent(before));
    expect(Object.keys(after._yardV2.runtime.commandReceipts)).toEqual([commands[0].clientActionId]);expect(Object.values(after._yardV2.runtime.giftLedger).filter(g=>g.status==='claimed')).toHaveLength(105);
    await expect(page.locator('.cy-wallet')).toContainText(String(after.yard.currencies.treats));await expect(page.getByRole('button',{name:'Collect',exact:true})).toBeDisabled();
    // Reload uses actual IndexedDB and server persistence; no module/private-store injection.
    await page.reload();await expect(page.locator('.cy-app')).toBeVisible();await expectSceneReady(page);await expect(page.locator('.cy-wallet')).toContainText(String(after.yard.currencies.treats));
    const reloaded=await saved(f);expect(reloaded._yardV2.migration).toEqual(migration);expect(reloaded.yard.currencies).toEqual(after.yard.currencies);
    await capture(page,info,'active-persistent-after-lost-reply');await page.getByRole('button',{name:'Back to games',exact:true}).click();await expect(page.getByTestId('home-catalogue')).toBeVisible();
    await selectHomeGame(page,'garden');await expect(page.locator('.cy-app')).toHaveCount(0);await selectHomeGame(page,'room');await expect(page.locator('.cy-app')).toBeVisible();await expectSceneReady(page);
    expect(media.some(p=>/^\/assets\/yard-(mochi|pebble|pip|family|fox|turtles)\//.test(p))).toBe(false);
    const evidence=[];for(const path of [...new Set(media)]){const response=await request.get(origin('active')+path);expect(response.status()).toBe(200);const body=await response.body(),disk=await readFile(resolve(root,'dist',path.slice(1)));expect(body.equals(disk)).toBe(true);expect(response.headers()['content-type']).not.toContain('text/html');evidence.push({path,bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')});}
    const missing=await request.get(origin('active')+'/assets/yard-mika/no-such-player-test.webp');expect(missing.status()).toBe(404);expect(missing.headers()['content-type']).not.toContain('text/html');
    await info.attach('actual-yard-media-requests',{body:Buffer.from(JSON.stringify(evidence,null,2)),contentType:'application/json'});expect(errors).toEqual([]);
  });
});

test('two genuine HTTP processes converge concurrent duplicate collect into one PostgreSQL receipt',async({request})=>{
  const f=await seed('history');await snapshot(request,f,'active');const before=await saved(f),clientActionId=`yard-v2:api-concurrent:${randomUUID()}`;
  const data={accountId:f.id,action:'yard.collectGifts',payload:{},clientActionId},headers={Authorization:`dev ${f.externalId}`};
  const responses=await Promise.all(['active','activePeer'].map(mode=>request.post(`${origin(mode)}/api/player/mutate`,{headers,data})));
  expect(responses.map(r=>r.status())).toEqual([200,200]);const bodies=await Promise.all(responses.map(r=>r.json()));expect(bodies.filter(b=>b.duplicate)).toHaveLength(1);
  const after=await saved(f);expect(after.yard.currencies.treats).toBe(before.yard.currencies.treats+210);expect(after.yard.pendingGifts).toEqual([]);expect(Object.keys(after._yardV2.runtime.commandReceipts)).toEqual([clientActionId]);expect(after._yardV2.migration).toEqual(before._yardV2.migration);expect(adjacent(after)).toEqual(adjacent(before));
  const changed=await request.post(`${origin('activePeer')}/api/player/mutate`,{headers,data:{...data,payload:{unexpected:true}}});expect(changed.status()).toBe(409);expect((await changed.json()).error).toBe('ACTION_ID_PAYLOAD_CONFLICT');
  const final=await saved(f);expect(final.yard.currencies).toEqual(after.yard.currencies);expect(final._yardV2.runtime.commandReceipts).toEqual(after._yardV2.runtime.commandReceipts);
});

test('real authentication and action owner fence reject unauthenticated or foreign-account HTTP',async({request})=>{
  for(const mode of ['closed','active'])expect((await request.get(`${origin(mode)}/api/player/snapshot`)).status()).toBe(401);
  const f=await seed('history');await snapshot(request,f,'active');const before=await saved(f);
  const rejected=await request.post(`${origin('active')}/api/player/mutate`,{headers:{Authorization:`dev ${f.externalId}`},data:{accountId:`acct:${randomUUID()}`,action:'yard.collectGifts',payload:{},clientActionId:`yard-v2:${randomUUID()}`}});
  expect(rejected.status()).toBe(409);expect((await rejected.json()).error).toBe('ACCOUNT_CHANGED');const after=await saved(f);expect(after.yard).toEqual(before.yard);expect(after._yardV2).toEqual(before._yardV2);
});
