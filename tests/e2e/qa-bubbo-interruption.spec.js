import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';

const networkCopy={
  en:'No reply received. Check your connection, then refresh to check the result before trying again.',
  ru:'Ответ не получен. Проверьте соединение, затем обновите страницу и проверьте результат перед повторной попыткой.'
};

async function geometry(page){
  const boxes={};
  for(const [name,selector] of Object.entries({dialog:'.bb-dialog',start:'[data-testid="bb-start"]',exit:'[data-testid="bb-exit"]',feedback:'.bb-menu-feedback'})){
    boxes[name]=await page.locator(selector).boundingBox();
    expect(boxes[name],`${name} must keep a measurable box`).not.toBeNull();
  }
  boxes.scrollTop=await page.locator('.bb-dialog-scroll').evaluate(node=>node.scrollTop);
  return boxes;
}

async function expectStableGeometry(page,before){
  const after=await geometry(page);
  for(const name of ['dialog','start','exit','feedback'])for(const key of ['x','y','width','height']){
    expect(Math.abs(after[name][key]-before[name][key]),`${name}.${key} changed after start feedback`).toBeLessThanOrEqual(1);
  }
  expect(after.scrollTop,'Feedback must not scroll the menu on its own').toBe(before.scrollTop);
  return after;
}

async function expectReadableFeedback(page,width,height){
  const error=page.locator('.bb-error');
  await expect(error).toHaveCount(1);
  await expect(error).toHaveAttribute('role','alert');
  await expect(error).toHaveAttribute('tabindex','0');
  await error.scrollIntoViewIfNeeded();
  const bounds=await error.evaluate(node=>{
    const box=node.getBoundingClientRect(),lane=node.parentElement.getBoundingClientRect(),dialog=node.closest('.bb-dialog').getBoundingClientRect();
    const style=getComputedStyle(node);
    return {x:box.x,y:box.y,right:box.right,bottom:box.bottom,width:box.width,height:box.height,lane:{x:lane.x,y:lane.y,right:lane.right,bottom:lane.bottom},dialog:{x:dialog.x,y:dialog.y,right:dialog.right,bottom:dialog.bottom},fontSize:parseFloat(style.fontSize),lineHeight:parseFloat(style.lineHeight),overflowY:style.overflowY,clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,clientHeight:node.clientHeight,scrollHeight:node.scrollHeight};
  });
  expect(bounds.fontSize).toBeGreaterThanOrEqual(14);
  expect(bounds.lineHeight).toBeGreaterThanOrEqual(20);
  expect(bounds.height).toBeGreaterThanOrEqual(40);
  expect(bounds.height).toBeLessThanOrEqual(100);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(width+1);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(height+1);
  for(const outer of [bounds.lane,bounds.dialog]){
    expect(bounds.x).toBeGreaterThanOrEqual(outer.x-1);
    expect(bounds.y).toBeGreaterThanOrEqual(outer.y-1);
    expect(bounds.right).toBeLessThanOrEqual(outer.right+1);
    expect(bounds.bottom).toBeLessThanOrEqual(outer.bottom+1);
  }
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth+1);
  expect(bounds.overflowY).toBe('auto');
  await error.evaluate(node=>{node.scrollTop=0;node.focus({preventScroll:true});});
  await expect(error).toBeFocused();
  if(bounds.scrollHeight>bounds.clientHeight){
    await page.keyboard.press('End');
    await expect.poll(()=>error.evaluate(node=>node.scrollTop+node.clientHeight)).toBeGreaterThanOrEqual(bounds.scrollHeight-1);
    // Every line, including the end of long RU/EN copy, can be reached without
    // scrolling Start/Exit or pushing feedback outside its reserved lane.
    const lastLineVisible=await error.evaluate(node=>{
      const text=node.firstChild,range=document.createRange();
      range.setStart(text,Math.max(0,text.length-1));range.setEnd(text,text.length);
      const last=range.getBoundingClientRect(),box=node.getBoundingClientRect();
      return last.top>=box.top-1&&last.bottom<=box.bottom+1;
    });
    expect(lastLineVisible).toBe(true);
  }
  await page.keyboard.press('Tab');
  expect(await page.locator('.bb-dialog').evaluate(node=>node.contains(document.activeElement))).toBe(true);
  return bounds;
}

for(const [width,height] of [[320,568],[390,844],[568,320]])test.describe(`Bubbo interrupted start ${width}x${height}`,()=>{
  test.use({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  for(const lang of ['en','ru'])test(`Bubbo interrupted start has actionable ${lang} copy and stable retry`,async({page},info)=>{
    await page.addInitScript(({lang,id})=>{localStorage.setItem('gh_dev_user_id',id);localStorage.setItem('garden_shelf_language',lang);},{lang,id:`qa_interrupt_${randomUUID()}`});
    await page.goto('/?tab=bubbo');
    const start=page.getByTestId('bb-start'),exit=page.getByTestId('bb-exit'),scroller=page.locator('.bb-dialog-scroll');
    await expect(start).toBeVisible();
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('.active-game-frame').evaluate(async node=>{await Promise.all(node.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
    await start.click({trial:true});
    const before=await geometry(page),attempts=[];
    let release,entered,mode='network';
    await page.route('**/api/player/mutate',async route=>{
      if(route.request().postDataJSON()?.action!=='bubbo.start'||mode==='success')return route.continue();
      const failure=mode;
      await new Promise(resolve=>{release=resolve;entered();});
      if(failure==='network')await route.abort('failed');
      else await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({error:failure})});
    });
    // Repeated transport failure, followed by unusually long localized domain
    // feedback, exercises both clearing and re-populating the same reserved lane.
    const longCopy=Array(6).fill(networkCopy[lang]).join(' ');
    for(const failure of ['network','network',longCopy]){
      mode=failure;
      await scroller.evaluate((node,top)=>{node.scrollTop=top;},before.scrollTop);
      const requestEntered=new Promise(resolve=>{entered=resolve;});
      await start.click();await requestEntered;
      await expect(start).toBeDisabled();
      await expect(page.locator('.bb-error')).toHaveCount(0);
      await expectStableGeometry(page,before);
      // A failed request must not steal focus from an existing escape path.
      await exit.evaluate(node=>node.focus({preventScroll:true}));
      release();
      await expect(start).toBeEnabled();
      await expect(page.locator('.bb-error')).toHaveText(failure==='network'?networkCopy[lang]:longCopy);
      await expect(exit).toBeFocused();
      const after=await expectStableGeometry(page,before);
      const errorBounds=await expectReadableFeedback(page,width,height);
      await expect(page.locator('.notice')).toHaveCount(0);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
      await start.click({trial:true});await exit.click({trial:true});
      await scroller.evaluate((node,top)=>{node.scrollTop=top;},before.scrollTop);
      await expectStableGeometry(page,before);
      attempts.push({after,errorBounds,error:await page.locator('.bb-error').textContent()});
    }
    await page.screenshot({path:info.outputPath('interrupted-start.png')});
    await info.attach('start-control-layout',{body:JSON.stringify({before,attempts}),contentType:'application/json'});
    mode='success';
    await start.click();
    await expect(page.locator('.bb-stage')).toHaveAttribute('data-bb-phase','playing');
    await expect(page.locator('.bb-error')).toHaveCount(0);
  });
});
