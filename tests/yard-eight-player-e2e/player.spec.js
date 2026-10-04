import {test,expect} from '@playwright/test';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {assertEightCandidateApi,CANDIDATE_PORT,CANDIDATE_DIST,AUTHORED_CLOCK_ORIGIN,EIGHT_IDS,CANDIDATE_SOURCE_PINS} from '../helpers/yard-eight-player-candidate.mjs';
import {assertYardPlayerFixture} from '../helpers/yard-player-api-guard.mjs';
import {installEightCanvasWitness} from '../helpers/yard-eight-canvas-witness.mjs';
import {actorAtlasPages,attributedDraw} from '../helpers/yard-eight-atlas-attribution.mjs';
import {createDefaultPlayer} from '../../game-logic/player.js';
import {ensureMergeLabState} from '../../game-logic/merge-lab-service.js';
import {YARD_GOODIES,YARD_FOODS,YARD_REMODELS} from '../../game-logic/yard-v2/catalog.mjs';
import {EIGHT_FIXTURE_SPECS} from '../helpers/yard-eight-domain-fixtures.mjs';
import {selectHomeGame} from '../e2e/helpers/home.js';
assertEightCandidateApi();
const root=resolve(import.meta.dirname,'../..'),base=`http://127.0.0.1:${CANDIDATE_PORT}`,fixtures=[],templates=new Map();let database,closeDatabase;
const adjacent=p=>({merge:p.merge,fence:p._mergeLabFence,garden:p.garden,gold:p.resources.gold,gachaTokens:p.resources.gachaTokens});
const headers=f=>({Authorization:`dev ${f.externalId}`});
test.beforeAll(async()=>{const db=await import('../../db.js');if(!db.initDb())throw Error('Real PostgreSQL required');await db.ensureDbSchema();database=db.getDb();closeDatabase=db.closeDb;});
async function owned(f){assertYardPlayerFixture(f.externalId,f.id);const [r]=await database`SELECT account_id FROM account_identities WHERE provider='dev' AND external_id=${f.externalId}`;expect(r?.account_id).toBe(f.id);}
async function saved(f){await owned(f);const [r]=await database`SELECT data FROM players WHERE id=${f.id}`;expect(r).toBeTruthy();return r.data;}
test.afterAll(async()=>{try{if(database)for(const f of fixtures){await owned(f);await database`DELETE FROM players WHERE id=${f.id}`;await database`DELETE FROM accounts WHERE id=${f.id}`;}}finally{await closeDatabase?.();}});
function template(key){if(!templates.has(key)){const result=JSON.parse(readFileSync(resolve(root,'test-results/yard-eight-player-fixtures',`${key.replaceAll(':','-')}.json`),'utf8'));expect(result.sourcePins).toEqual(CANDIDATE_SOURCE_PINS);expect(result.fixture.key).toBe(key);templates.set(key,result.fixture);}return templates.get(key);}
async function seed(key='actions'){
 const externalId=assertYardPlayerFixture(`yard_player_api_${randomUUID()}`),{getOrCreateAccountForIdentity}=await import('../../accountManager.js');
 const id=await getOrCreateAccountForIdentity('dev',externalId,{displayName:'Eight actor candidate'}),f={id,externalId,key};fixtures.push(f);await owned(f);
 const p=createDefaultPlayer(id,'Eight actor candidate',AUTHORED_CLOCK_ORIGIN);p._onboarded=true;p._version=randomUUID();ensureMergeLabState(p,{now:AUTHORED_CLOCK_ORIGIN});
 if(key!=='actions'){f.template=template(key);p.yard=structuredClone(f.template.yard);p._yardV2=structuredClone(f.template.storage);}
 else{
  p.yard.currencies={treats:10000,shinyTreats:500};p.yard.goodieInventory={};p.yard.foodInventory={kibble:3};
  p.yard.placedGoodies=[{slotId:'repair-moon',goodieId:'moon_lamp',x:60,y:40,condition:'worn',uses:YARD_GOODIES.moon_lamp.durability,rotationZ:0,opaque:'keep'}];
  p.yard.pendingGifts=[{id:'owned-legacy-gift',visitorId:'mika_cat',treats:12,shinyTreats:1,createdAt:AUTHORED_CLOCK_ORIGIN}];
  p.yard.petbook.mika_cat={visits:1};p.yard.helper={...p.yard.helper,unlocked:true,autoRefill:false,preferredFoodId:'kibble'};
 }
 p.yard.opaqueCandidate={preserve:true};f.initial=structuredClone(p);await database`INSERT INTO players(id,data) VALUES(${id},${p})`;return f;
}
async function snapshot(request,f){const r=await request.get(`${base}/api/player/snapshot`,{headers:headers(f)});expect(r.status()).toBe(200);return r.json();}
async function command(request,f,action,payload={}){const data={accountId:f.id,action,payload,clientActionId:`yard-v2:${randomUUID()}`};const r=await request.post(`${base}/api/player/mutate`,{headers:headers(f),data});return {status:r.status(),body:await r.json(),data};}
async function boot(page,f){
 await page.addInitScript(installEightCanvasWitness);await page.addInitScript(id=>{localStorage.setItem('gh_dev_user_id',id);localStorage.setItem('garden_shelf_language','en');},f.externalId);
 const errors=[],media=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/assets/yard-'))media.push(path);});
 await page.goto(`${base}/?tab=room`);await expect(page.locator('.status-dot.ready')).toHaveCount(1,{timeout:30000});await expect(page.locator('.cy-app')).toBeVisible();
 await expect.poll(()=>page.locator('.cy-scene canvas').evaluate(c=>{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<p.length;i+=4)if(p[i]&&++n>=32)return true;return false;}),{timeout:30000}).toBe(true);
 await expect(page.locator('.cy-status')).not.toContainText('The courtyard could not load.');return {errors,media};
}
const actorPath=id=>id==='mika'?'/assets/yard-mika/':['mochi','pebble','pip'].includes(id)?`/assets/yard-${id}/`:`/assets/yard-family/${id}/`;
const atlasPages=new Map();function pagesFor(id){if(!atlasPages.has(id)){const path=actorPath(id),manifest=JSON.parse(readFileSync(resolve(root,CANDIDATE_DIST,path.slice(1),'runtime-media.json'),'utf8'));atlasPages.set(id,actorAtlasPages(manifest,path));}return atlasPages.get(id);}
async function rendered(page,actors,afterAt=0){await expect.poll(async()=>{const rows=await page.evaluate(()=>window.__yardEightDrawWitness);return actors.every(id=>rows.some(row=>row.at>=afterAt&&attributedDraw(row,pagesFor(id))));},{timeout:30000}).toBe(true);await expect(page.locator('.cy-status')).not.toContainText('The courtyard could not load.');}
async function evidence(page,request,info,observed,actors){
 await rendered(page,actors);expect(observed.errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 const draws=await page.evaluate(()=>window.__yardEightDrawWitness),bytes=[];
 for(const path of [...new Set(observed.media)]){const r=await request.get(base+path);expect(r.status(),path).toBe(200);const received=await r.body(),disk=await readFile(resolve(root,CANDIDATE_DIST,path.slice(1)));expect(received.equals(disk),path).toBe(true);expect(r.headers()['content-type']).not.toContain('text/html');bytes.push({path,bytes:received.length,sha256:createHash('sha256').update(received).digest('hex')});}
 for(const actor of actors)expect(bytes.some(row=>draws.some(d=>new URL(d.url).pathname===row.path&&attributedDraw(d,pagesFor(actor))))).toBe(true);
 const candidateIdentity=JSON.parse(await readFile(resolve(root,CANDIDATE_DIST,'EIGHT-CANDIDATE-ONLY.json'),'utf8'));
 await info.attach('actual-atlas-draws-and-http-bytes',{body:Buffer.from(JSON.stringify({actors,draws,bytes,candidateIdentity},null,2)),contentType:'application/json'});
 await info.attach('actual-courtyard',{body:await page.screenshot(),contentType:'image/png'});
}
async function uiAction(page,action,click){const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/player/mutate'&&r.request().postDataJSON()?.action===action);await click();const r=await response,b=await r.json();expect(r.status(),JSON.stringify(b)).toBe(200);expect(b.duplicate).toBe(false);await expect(page.locator('.cy-status')).not.toContainText('Saving action');return {body:b,data:r.request().postDataJSON()};}
const row=(page,title)=>page.locator('.cy-row').filter({has:page.locator('strong').filter({hasText:new RegExp(`^${title}$`)})});
async function panel(page,index){if(await page.locator('.cy-dialog').isVisible())await page.getByRole('button',{name:'Close courtyard panel',exact:true}).click();await page.locator('.cy-actions button').nth(index).click();await expect(page.locator('.cy-dialog')).toBeVisible();}
const matrix=[{name:'small-phone',width:320,height:568,dpr:1,touch:true},{name:'phone',width:390,height:844,dpr:2,touch:true},{name:'landscape',width:844,height:390,dpr:2,touch:true},{name:'desktop',width:1280,height:800,dpr:1,touch:false}];
for(const viewport of matrix)test.describe(viewport.name,()=>{
 test.use({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:viewport.dpr,isMobile:viewport.touch,hasTouch:viewport.touch});
 // Run finite pairs first; the shortest first guest has 18 real minutes left at
 // clock origin. The whole lane is bounded to 14 minutes, without time scaling.
 for(const key of ['mika-willow','pip-starlit','willow-starlit',...EIGHT_IDS])test(`actual native admission, atlas and pixels: ${key}`,async({page,request},info)=>{
  const f=await seed(key),before=await saved(f),expected=f.template;
  expect(Object.keys(before._yardV2.runtime.visits)).toHaveLength(expected.expectedActors.length-1);
  const observed=await boot(page,f),s=await snapshot(request,f),after=await saved(f);
  expect(s.yardRuntime.mutable).toBe(true);expect(s.yardRuntime.visits.map(v=>v.visitorId).sort()).toEqual(expected.expectedActors.map(id=>EIGHT_FIXTURE_SPECS[id].visitorId).sort());
  expect(s.yardRuntime.visits.every(v=>v.renderCompatible)).toBe(true);expect(after._yardV2.runtime.visits).toEqual(expected.expected);
  expect(after.yard.placedGoodies).toEqual(expected.expectedYard.placedGoodies);expect(after.yard.bowls).toEqual(expected.expectedYard.bowls);expect(after.yard.currencies).toEqual(before.yard.currencies);expect(adjacent(after)).toEqual(adjacent(before));
  await rendered(page,expected.expectedActors);await panel(page,1);
  for(const button of await page.getByRole('button',{name:'Move',exact:true}).all())await expect(button).toBeDisabled();
  await page.getByRole('button',{name:'Close courtyard panel',exact:true}).click();
  // Reservations are enforced by real API as well as disabled controls.
  const rejected=await command(request,f,'yard.pickupGoodie',{slotId:s.yardRuntime.visits[0].slotId});expect(rejected.status).toBe(400);expect((await saved(f)).yard.placedGoodies).toEqual(after.yard.placedGoodies);
  await evidence(page,request,info,observed,expected.expectedActors);
  if(viewport.name==='phone'&&key==='mika-willow'){
   await page.setViewportSize({width:844,height:390});await expect.poll(()=>page.locator('.cy-scene canvas').evaluate(c=>Math.abs(c.width-c.getBoundingClientRect().width*devicePixelRatio)<2)).toBe(true);await expect(page.locator('.cy-status')).not.toContainText('The courtyard could not load.');
   await info.attach('live-phone-rotation',{body:await page.screenshot(),contentType:'image/png'});await page.setViewportSize({width:390,height:844});
  }
  await page.reload();await expect(page.locator('.cy-app')).toBeVisible();await rendered(page,expected.expectedActors);
  const reloaded=await saved(f);expect(reloaded._yardV2.runtime.visits).toEqual(after._yardV2.runtime.visits);expect(reloaded.yard.petbook).toEqual(after.yard.petbook);
  await page.getByRole('button',{name:'Back to games',exact:true}).click();await expect(page.getByTestId('home-catalogue')).toBeVisible();await selectHomeGame(page,'garden');await expect(page.locator('.cy-app')).toHaveCount(0);
  const afterExit=await page.evaluate(()=>performance.now());await selectHomeGame(page,'room');await expect(page.locator('.cy-app')).toBeVisible();await rendered(page,expected.expectedActors,afterExit);
 });
 test('all 14 intent contracts through real controls or explicit unavailable affordances',async({page,request},info)=>{
  const f=await seed(),observed=await boot(page,f),initial=await saved(f),seen=[];
  const action=async(name,click)=>{const r=await uiAction(page,name,click);seen.push(r);return r;};
  await panel(page,0);await action('yard.buyFood',()=>row(page,'Garden Kibble').getByRole('button',{name:'Take',exact:true}).click());
  await action('yard.setFood',()=>row(page,'Bowl').getByRole('button',{name:'Fill',exact:true}).click());
  await panel(page,1);await action('yard.fixGoodie',()=>row(page,'Moon Lamp').getByRole('button',{name:/^Repair/}).click());
  await action('yard.pickupGoodie',()=>row(page,'Moon Lamp').getByRole('button',{name:'Store',exact:true}).click());
  await action('yard.buyGoodie',()=>row(page,'Sun Cushion').getByRole('button',{name:'Buy',exact:true}).click());
  await page.locator('.cy-row').filter({has:page.getByRole('button',{name:'Place',exact:true})}).filter({hasText:'Sun Cushion'}).getByRole('button',{name:'Place',exact:true}).click();
  await action('yard.placeGoodie',()=>page.locator('.cy-placement').getByRole('button',{name:'Place',exact:true}).click());
  await panel(page,1);await row(page,'Sun Cushion').getByRole('button',{name:'Move',exact:true}).click();await page.locator('.cy-scene canvas').press('ArrowLeft');
  await action('yard.moveGoodie',()=>page.locator('.cy-scene canvas').press('Enter'));
  await panel(page,1);await row(page,'Sun Cushion').getByRole('button',{name:'Move',exact:true}).click();await page.locator('.cy-scene canvas').dispatchEvent('pointercancel',{pointerId:1});await expect(page.locator('.cy-placement')).toHaveCount(0);
  await panel(page,1);await expect(page.getByRole('button',{name:'Expand',exact:true})).toBeDisabled();
  for(const button of await page.getByRole('button',{name:'Select',exact:true}).all())await expect(button).toBeDisabled();
  const unavailable=[];for(const [name,payload]of [['yard.buyExpansion',{}],['yard.setRemodel',{remodelId:Object.keys(YARD_REMODELS).find(id=>id!=='meadow')}]]){const r=await command(request,f,name,payload);expect(r.status).toBe(409);expect(r.body.error).toBe('YARD_BINDING_REQUIRED');unavailable.push(name);}
  await panel(page,2);const collectBefore=await saved(f);const collect=await action('yard.collectGifts',()=>page.getByRole('button',{name:'Collect',exact:true}).click());
  const replay=await request.post(`${base}/api/player/mutate`,{headers:headers(f),data:collect.data});expect(replay.status()).toBe(200);expect((await replay.json()).duplicate).toBe(true);
  expect((await saved(f)).yard.currencies.treats).toBe(collectBefore.yard.currencies.treats+12);
  await action('yard.claimDailyLetter',()=>page.getByRole('button',{name:'Open',exact:true}).click());
  await action('yard.capturePhoto',()=>page.getByRole('button',{name:'Portrait',exact:true}).first().click());
  await action('yard.favoritePhoto',()=>page.getByRole('button',{name:'Favorite',exact:true}).first().click());
  await page.getByLabel('Name',{exact:true}).fill('Source buddy');await action('yard.configureCompanion',()=>page.getByRole('button',{name:'Save name',exact:true}).click());
  await action('yard.configureCompanion',()=>page.getByLabel('Helper food',{exact:true}).selectOption('berry_plate'));
  await action('yard.configureCompanion',()=>page.getByRole('button',{name:/^Auto-feed:/}).click());
  const after=await saved(f);expect(after.yard.companion.name).toBe('Source buddy');expect(after.yard.helper.preferredFoodId).toBe('berry_plate');expect(after.yard.helper.autoRefill).toBe(true);expect(after.yard.album.photos).toHaveLength(1);expect(after.yard.album.photos[0].favorite).toBe(true);
  expect(after.yard.placedGoodies.find(p=>p.goodieId==='sun_cushion').x).toBe(53);expect(after.yard.goodieInventory.moon_lamp).toBe(1);expect(after.yard.opaqueCandidate).toEqual(initial.yard.opaqueCandidate);expect(adjacent(after)).toEqual(adjacent(initial));
  expect(new Set([...seen.map(r=>r.data.action),...unavailable]).size).toBe(14);
  expect(after.yard.currencies.treats).toBe(initial.yard.currencies.treats-YARD_FOODS.kibble.cost.treats-YARD_GOODIES.moon_lamp.fixCost.treats-YARD_GOODIES.sun_cushion.cost.treats+12+35);
  await page.keyboard.press('Escape');await expect(page.locator('.cy-dialog')).not.toBeVisible();await expect(page.locator('.cy-scene canvas')).toBeVisible();
  await page.getByRole('button',{name:'Back to games',exact:true}).click();await expect(page.getByTestId('home-catalogue')).toBeVisible();await selectHomeGame(page,'room');await expect(page.locator('.cy-app')).toBeVisible();await page.reload();await expect(page.locator('.cy-wallet')).toContainText(String(after.yard.currencies.treats));
  await info.attach('fourteen-intent-results',{body:Buffer.from(JSON.stringify({positive:seen.map(r=>({action:r.data.action,nonce:r.data.clientActionId})),unavailable,balances:after.yard.currencies},null,2)),contentType:'application/json'});await info.attach('interactive-ui',{body:await page.screenshot(),contentType:'image/png'});expect(observed.errors).toEqual([]);
 });
});
test.describe('supported wear pixels on phone',()=>{test.use({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 for(const id of ['willow','starlit','basil','sage'])for(const condition of ['worn','broken'])test(`${id} ${condition}: real persisted source condition reaches renderer`,async({page,request},info)=>{
  const f=await seed(`${id}:${condition}`),observed=await boot(page,f),s=await snapshot(request,f);expect(s.yardRuntime.visits).toHaveLength(1);
  const clipId=s.yardRuntime.visits[0].mediaAdmission.plan.clipId,manifest=JSON.parse(readFileSync(resolve(root,CANDIDATE_DIST,actorPath(id).slice(1),'runtime-media.json'),'utf8'));
  const conditionPages=actorAtlasPages({clips:{[clipId]:manifest.clips[clipId]},roots:manifest.roots},actorPath(id));
  expect(s.yardRuntime.visits[0].mediaAdmission.plan.conditionReceipt.conditionAfter).toBe(condition);expect(s.yardRuntime.visits[0].renderCompatible).toBe(true);
  await expect.poll(async()=>{const rows=await page.evaluate(()=>window.__yardEightDrawWitness);return rows.some(row=>attributedDraw(row,conditionPages));},{timeout:30000}).toBe(true);
  await evidence(page,request,info,observed,[id]);
 });
 for(const key of ['reject:pip:worn','reject:pip:broken','reject:starlit:threshold'])test(`${key}: actual native rejection preserves serving, wear and balance`,async({page,request},info)=>{
  const f=await seed(key),before=await saved(f),observed=await boot(page,f),s=await snapshot(request,f),after=await saved(f);
  expect(s.yardRuntime.visits).toEqual([]);expect(Object.keys(after._yardV2.runtime.visits)).toHaveLength(0);
  expect(after._yardV2.runtime.events.some(e=>e.type==='admission-blocked-media')).toBe(true);
  for(const field of ['placedGoodies','bowls','petbook','currencies'])expect(after.yard[field]).toEqual(before.yard[field]);
  expect(await page.evaluate(()=>window.__yardEightDrawWitness)).toEqual([]);expect(observed.errors).toEqual([]);
  await info.attach('unsupported-condition-held',{body:Buffer.from(JSON.stringify({key,events:after._yardV2.runtime.events},null,2)),contentType:'application/json'});
 });
});
