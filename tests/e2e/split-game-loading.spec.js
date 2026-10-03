import {test,expect} from '@playwright/test';
import {startSwFixture} from './helpers/swFixture.mjs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
test.use({actionTimeout:10000});

async function initialize(page){await page.addInitScript(()=>{localStorage.setItem('gh_dev_user_id','fixture-a');localStorage.setItem('garden_shelf_language','en');});}
async function loadedScripts(page){return page.evaluate(()=>performance.getEntriesByType('resource').filter(row=>new URL(row.name).pathname.endsWith('.js')).map(row=>({path:new URL(row.name).pathname,encodedBytes:row.encodedBodySize,transferBytes:row.transferSize})));}
async function closeGarden(page){await page.locator('.gs2-dialog .gs2-close').click();await expect(page.locator('.gs2-dialog')).toHaveCount(0);}
async function recordGraph(fixture,page,testInfo,phases){
 const graph=JSON.parse(await readFile(resolve(fixture.dist,'game-loading-graph.json'),'utf8'));
 const actual=await loadedScripts(page);
 expect(actual.filter(row=>row.path.startsWith('/assets/')&&!graph.chunks.some(chunk=>'/'+chunk.file===row.path))).toEqual([]);
 await testInfo.attach('actual-game-loading.json',{body:Buffer.from(JSON.stringify({phases,actual,totalEncodedBytes:actual.reduce((sum,row)=>sum+row.encodedBytes,0)},null,2)),contentType:'application/json'});
}
for(const mode of ['r2','legacy'])for(const width of (mode==='r2'?[320,390]:[390]))test.describe(`split Garden ${mode} ${width}`,()=>{
 test.use({viewport:{width,height:844},isMobile:true,hasTouch:true});
 test('real provider, lazy sheets, purchase and saved plant survive reload',async({page},testInfo)=>{
  test.setTimeout(60000);const fixture=await startSwFixture({gameActions:true,gardenMode:mode});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
   await initialize(page);await page.goto(fixture.origin+'/?tab=garden');await expect(page.locator('[data-plant-id="split-saved-daisy"]')).toBeVisible();
   await expect(page.locator('[data-plant-details-button]')).toBeEnabled();
   const phases={boot:await loadedScripts(page)};
   expect(phases.boot.some(row=>/Garden(SettingsDialog|Quests|Shop|Detail)|GardenR2Progress/.test(row.path))).toBe(false);
   expect(phases.boot.some(row=>/LegacyGardenGame/.test(row.path))).toBe(mode==='legacy');
   expect(phases.boot.some(row=>/Settlement|MergeLab|LegacyMerge|PixiGameHost|WebGLRenderer/.test(row.path))).toBe(false);
   await page.getByRole('button',{name:'Garden settings',exact:true}).click();await expect(page.locator('[data-garden-panel="settings"]')).toBeVisible();
   await expect.poll(()=>page.locator('.gs2-dialog').evaluate(node=>node.contains(document.activeElement))).toBe(true);await closeGarden(page);
   if(mode==='r2'){
    await page.getByRole('button',{name:'Garden progress',exact:true}).click();await expect(page.locator('[data-garden-panel="progression"]')).toBeVisible();
    await page.getByRole('button',{name:'Garden quests',exact:true}).click();
   }else await page.getByRole('button',{name:'Garden quests',exact:true}).click();
   await expect(page.locator('[data-garden-panel="quests"]')).toBeVisible();await closeGarden(page);
   await page.locator('[data-plant-id="split-saved-daisy"] [data-plant-details-button]').click();await expect(page.locator('[data-garden-panel="plant-detail"]')).toBeVisible();await closeGarden(page);
   const gold=fixture.player('account-a').resources.gold;
   await page.getByRole('button',{name:'Seed Shop',exact:true}).first().click();await expect(page.locator('[data-garden-panel="seed-shop-inventory"]')).toBeVisible();
   const purchase=page.locator('.gs2-catalog-row').filter({hasText:'Daisy'}).getByRole('button');await purchase.click();
   await expect.poll(()=>fixture.player('account-a').garden.plants.length).toBe(2);
   expect(fixture.player('account-a').resources.gold).toBeLessThan(gold);
   await closeGarden(page);phases.allSheets=await loadedScripts(page);
   for(const name of ['GardenSettingsDialog','GardenQuests','GardenShop','GardenDetail'])expect(phases.allSheets.some(row=>row.path.includes(name))).toBe(true);
   await recordGraph(fixture,page,testInfo,phases);
   await page.reload();await expect(page.locator('[data-plant-id]')).toHaveCount(2);await expect(page.locator('[data-plant-id="split-saved-daisy"]')).toBeVisible();
   expect(errors).toEqual([]);
  }finally{await fixture.close();}
 });
});

for(const width of [390,1280])test.describe(`split Settlement ${width}`,()=>{
 test.use({viewport:{width,height:width===390?844:720}});
 test('real panels load on demand and economic delivery persists through reload',async({page},testInfo)=>{
  test.setTimeout(60000);const fixture=await startSwFixture({gameActions:true});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
   await initialize(page);await page.goto(fixture.origin+'/?tab=settlement');await expect(page.locator('.settlement-canvas')).toBeVisible({timeout:30000});
   const phases={boot:await loadedScripts(page)};
   expect(phases.boot.some(row=>/Settlement(?:OverviewPanel|BuildingPanel|GoalsPanel|InventoryScreen|CouncilScreen|ConstructionScreen|ResearchTreeScreen|WorldMapScreen|GenericPanel)/.test(row.path))).toBe(false);
   expect(phases.boot.some(row=>/GardenShelfGame|MergeLabGame|LegacyMergeGame/.test(row.path))).toBe(false);
   await page.getByTestId('settlement-tab-orders').click();await expect(page.getByTestId('settlement-deliver')).toBeEnabled();
   await page.getByTestId('settlement-deliver').click();await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('village-ascend-v11-state'))?.state?.settlementCycle?.deliveries)).toBe(1);
   const economy=await page.evaluate(()=>{const state=JSON.parse(localStorage.getItem('village-ascend-v11-state')).state;return {resources:state.resources,deliveries:state.settlementCycle.deliveries};});
   const panels=[['.left-dock','Goals','SettlementGoalsPanel'],['.left-dock','News','SettlementGenericPanel'],['.left-dock','Council','SettlementCouncilScreen'],['.bottom-nav','Inventory','SettlementInventoryScreen'],['.bottom-nav','Build','SettlementConstructionScreen'],['.bottom-nav','Research','SettlementResearchTreeScreen'],['.bottom-nav','World map','SettlementWorldMapScreen']];
   for(const [dock,label,chunk] of panels){await page.locator(dock).getByRole('button',{name:label,exact:true}).click();await expect(page.locator('.right-panel .panel-body').first()).toBeVisible();await expect.poll(async()=> (await loadedScripts(page)).some(row=>row.path.includes(chunk))).toBe(true);}
   await page.getByRole('button',{name:'Close panel',exact:true}).click();
   await page.locator('.settlement-compact-detail-open').click();await expect.poll(async()=>(await loadedScripts(page)).some(row=>row.path.includes('SettlementBuildingPanel'))).toBe(true);
   // The retained overview has no visible opener in this base. Exercise that
   // view with the real store's UI command and label this fixture coverage.
   const graph=JSON.parse(await readFile(resolve(fixture.dist,'game-loading-graph.json'),'utf8'));
   const storeChunk=graph.chunks.find(chunk=>chunk.gameModules.includes('src/games/settlement/useSettlementStore.js'));
   await page.evaluate(async entry=>{const module=await import('/'+entry);const store=Object.values(module).find(value=>typeof value==='function'&&typeof value.getState==='function'&&value.getState().settlementCycle);if(!store)throw Error('Production Settlement store missing');store.getState().setPanel('overview');},storeChunk.file);
   await expect.poll(async()=>(await loadedScripts(page)).some(row=>row.path.includes('SettlementOverviewPanel'))).toBe(true);
   phases.overviewCoverage='fixture UI command through the production store; no visible opener';
   phases.allPanels=await loadedScripts(page);await recordGraph(fixture,page,testInfo,phases);
   await page.reload();await expect(page.locator('.settlement-canvas')).toBeVisible();
   expect(await page.evaluate(()=>{const state=JSON.parse(localStorage.getItem('village-ascend-v11-state')).state;return {resources:state.resources,deliveries:state.settlementCycle.deliveries};})).toEqual(economy);
   expect(errors).toEqual([]);
  }finally{await fixture.close();}
 });
});
