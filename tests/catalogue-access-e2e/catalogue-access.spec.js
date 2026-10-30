import {test, expect} from '@playwright/test';
import {mountHomePlayerFixture} from '../e2e/helpers/homePlayerFixture.js';

const games = ['garden', 'bentoku', 'blox', 'match3', 'merge', 'bubbo', 'trivia', 'room'];
const legacyKey = 'game_hub_yard_outbox_v1';
const emptyJournal = ' [ \n ] ';

for (const viewport of [{width:1280,height:720},{width:320,height:568},{width:390,height:844}]) {
  test.describe(`catalogue access ${viewport.width}x${viewport.height}`, () => {
    test.use({viewport, serviceWorkers:'block', ...(viewport.width<500 ? {isMobile:true,hasTouch:true,deviceScaleFactor:2} : {})});

    test('ordinary returning player can open every catalogue game with empty old journals', async ({page}, testInfo) => {
      await mountHomePlayerFixture(page);
      await page.addInitScript(async ({legacyKey,emptyJournal}) => {
        if (window.top !== window) return;
        localStorage.setItem('garden_shelf_language','ru');
        localStorage.setItem(legacyKey,emptyJournal);
        // The previous release wrote an empty v1 array even after all intents settled.
        const request=indexedDB.open('keyval-store');
        request.onupgradeneeded=()=>request.result.createObjectStore('keyval');
        await new Promise((resolve,reject)=>{
          request.onerror=()=>reject(request.error);
          request.onsuccess=()=>{
            const db=request.result,tx=db.transaction('keyval','readwrite');
            tx.objectStore('keyval').put([],legacyKey);
            tx.oncomplete=()=>{db.close();resolve();};
            tx.onerror=()=>reject(tx.error);
          };
        });
      },{legacyKey,emptyJournal});
      for (const id of games) {
        await page.goto('/?tab=garden');
        await expect(page.locator('.gs2-stage')).toBeVisible();
        await page.keyboard.press('Escape');
        const catalogue=page.getByTestId('home-catalogue');
        await expect(catalogue).toBeVisible();
        for (const game of games) await expect(page.locator(`[data-home-game="${game}"]`)).toBeEnabled();
        await expect(catalogue.locator('.home-waiting')).toHaveCount(0);
        expect(await page.locator('[data-home-game]').evaluateAll(nodes=>nodes.slice(0,2).map(n=>n.dataset.homeGame))).toEqual(['garden','bentoku']);
        if (id === 'garden') await page.screenshot({path:testInfo.outputPath('catalogue-enabled.png')});
        await page.locator(`[data-home-game="${id}"]`).click();
        await expect(catalogue).toHaveCount(0);
        await expect(page.locator('main[data-active-tab]')).toHaveAttribute('data-active-tab',id);
        await expect(page.locator('.game-entry-status')).toHaveCount(0,{timeout:20000});
        expect(await page.evaluate(key=>localStorage.getItem(key),legacyKey)).toBe(emptyJournal);
        expect(await page.evaluate(key=>new Promise((resolve,reject)=>{
          const request=indexedDB.open('keyval-store');request.onerror=()=>reject(request.error);
          request.onsuccess=()=>{const db=request.result,read=db.transaction('keyval').objectStore('keyval').get(key);read.onsuccess=()=>{db.close();resolve(read.result);};read.onerror=()=>reject(read.error);};
        }),legacyKey)).toEqual([]);
      }
    });
  });
}
