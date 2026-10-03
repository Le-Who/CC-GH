import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
await mkdir('output/playwright/concept',{recursive:true});
const browser=await chromium.launch({headless:true});
for(const [name,width,height,language] of [['phone-390-en',390,844,'en'],['phone-320-ru',320,568,'ru'],['landscape-568',568,320,'en'],['tablet-768',768,1024,'en']]){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const page=await context.newPage();await page.goto(`${process.env.HOME_PREVIEW_URL||'http://127.0.0.1:3315'}/preview/home.html?lang=${language}`);
 await page.locator('[data-home-game]').last().scrollIntoViewIfNeeded();await page.locator('.home-catalogue').evaluate(node=>node.scrollTop=0);
 await page.screenshot({path:`output/playwright/concept/${name}.png`});
 console.log(name,await page.locator('[data-home-game]').count());await context.close();
}
await browser.close();
