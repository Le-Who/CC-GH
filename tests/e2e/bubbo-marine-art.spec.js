import { openHome, selectHomeGame } from './helpers/home.js';
import {test,expect} from '@playwright/test';
import crypto from 'node:crypto';
import assets from '../fixtures/arcade-runtime-assets.json' with {type:'json'};

const marine=assets.filter(asset=>asset.artGeneration==='bubbo-marine-2026-10-02');

for(const [width,height] of [[320,568],[390,844],[568,320]]){
 test.describe(`Bubbo marine art ${width}x${height}`,()=>{
  test.use({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  test('reviewed marine exports load, paint on the real field and survive a shot',async({page},testInfo)=>{
   const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(()=>{
    localStorage.setItem('gh_dev_user_id',`marine_art_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    localStorage.setItem('garden_shelf_language','en');
    window.__bubboMarineDraws={};
    const drawImage=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
     const match=image?.src?.match(/\/games\/bubbo-v2\/(mint|amber|coral|sky|berry)\.webp(?:\?|$)/);
     if(match&&this.canvas.matches('.bb-field')){
      const key=match[1],entry=window.__bubboMarineDraws[key]||{count:0};
      entry.count++;entry.width=args.at(-2);entry.height=args.at(-1);
      window.__bubboMarineDraws[key]=entry;
     }
     return drawImage.call(this,image,...args);
    };
   });
   // Watch the actual Image requests used by BubboField, including build cache keys.
   const loaded=marine.map(asset=>page.waitForResponse(response=>new URL(response.url()).pathname===asset.path)
    .then(async response=>({asset,status:response.status(),sha256:crypto.createHash('sha256').update(await response.body()).digest('hex')}))
    .catch(error=>({asset,error:error.message})));
   await page.goto('/');
   await expect(page.locator('.status-dot.ready')).toBeVisible({timeout:15000});
   await selectHomeGame(page, 'bubbo');
   await page.getByTestId('bb-start').click();
   const field=page.getByTestId('bb-field');
   await expect(field).toHaveAttribute('data-ready','true');
   expect(marine).toHaveLength(5);
   for(const result of await Promise.all(loaded)){
    expect(result.error,result.asset.path).toBeUndefined();
    expect(result.status).toBe(200);
    expect(result.sha256,result.asset.path).toBe(result.asset.sha256);
   }
   await expect.poll(()=>page.evaluate(()=>Object.keys(window.__bubboMarineDraws).length)).toBeGreaterThan(0);
   const {draws,geometry}=await field.evaluate(node=>({draws:window.__bubboMarineDraws,geometry:JSON.parse(node.dataset.bubboGeometry)}));
   for(const draw of Object.values(draws)){
    expect(draw.count).toBeGreaterThan(0);
    expect(draw.width).toBeGreaterThanOrEqual(Math.min(22,geometry.cell*.99)-.01);
    expect(draw.width).toBeLessThanOrEqual(Math.max(22,geometry.cell*.99)+.01);
    expect(draw.width).toBe(draw.height);
   }
   await testInfo.attach('marine-token-draws',{body:Buffer.from(JSON.stringify(draws,null,2)),contentType:'application/json'});
   await testInfo.attach('marine-live-field',{body:await field.screenshot(),contentType:'image/png'});
   await field.focus();
   await field.press('Space');
   await expect(field).toHaveAttribute('data-shots','1');
   await expect(field).toHaveAttribute('data-flight','false');
   await testInfo.attach('marine-after-shot',{body:await field.screenshot(),contentType:'image/png'});
   await page.locator('.bb-pause').click();
   await expect(page.locator('.bb-stage')).toHaveAttribute('data-bb-phase','paused');
   await expect(page.locator('.bb-dialog')).toBeVisible();
   expect(errors).toEqual([]);
  });
 });
}
