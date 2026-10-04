import {expect} from '@playwright/test';
export async function openHome(page){
 if(await page.getByTestId('home-catalogue').count())return;
 const id=await page.locator('.telegram-app').getAttribute('data-active-tab');
 if(id==='garden')await expect(page.locator('.gs2-stage')).toBeVisible();
 else await expect(page.locator('.telegram-app.immersive-mode')).toBeVisible();
 // Immersive styling is route-owned from the first frame, not controller
 // readiness. A transient loading launcher can disappear while click waits
 // for the entry animation, leaving Yard's real Settings route unselected.
 // This helper navigates mounted games; loading-control tests target those
 // controls explicitly instead. Preserve normal actionability and deadlines.
 await expect(page.locator('.game-entry-status')).toHaveCount(0);
 const launcher=page.getByRole('button',{name:/^(All games|Все игры)$/});
 const pause=page.locator('[data-game-pause="true"]');
 const workshop=page.getByTestId('ml-exit');
 const mergePause=page.getByTestId('ml-open-pause');
 const yardSettings=page.locator('.companion-yard-stage').getByRole('button',{name:/^(Settings|Настройки)$/});
 await expect.poll(async()=>await launcher.isVisible() || await pause.isVisible() || await workshop.isVisible() || await mergePause.isVisible() || await yardSettings.isVisible()).toBe(true);
 if(await launcher.isVisible())await launcher.click();
 else if(await workshop.isVisible())await workshop.click();
 else if(await mergePause.isVisible()){await mergePause.click();await workshop.click();}
 else if(await yardSettings.isVisible()){await yardSettings.click();await launcher.click();}
 else{
  if(!await page.locator('[role="dialog"]:visible').count() && await pause.isVisible())await pause.click();
  const games=page.locator('[role="dialog"]').getByRole('button',{name:/^(All games|Все игры)$/});
  if(await games.count())await games.click();
  else await page.locator('[role="dialog"]').getByRole('button',{name:/^(Exit|Выход)$/}).click();
 }
 await expect(page.getByTestId('home-catalogue')).toBeVisible();
}
export async function selectHomeGame(page,id){
 await openHome(page);
 await page.locator(`[data-home-game="${id}"]`).click();
 const finish=page.getByRole('button',{name:/^(Finish & open|Завершить и открыть)$/});
 if(await finish.isVisible())await finish.click();
 await expect(page.getByTestId('home-catalogue')).toHaveCount(0);
 await expect(page.locator('.telegram-app')).toHaveAttribute('data-active-tab',id);
 if(id==='garden')await expect(page.locator('.gs2-stage')).toBeVisible();
 else await expect(page.locator('.telegram-app.immersive-mode')).toBeVisible();
}

// Home scrolls. Check every card after normal scrolling with all geometry and
// hit-target assertions retained, rather than requiring eight cards on screen.
export async function expectHomeCardsReachable(page){
 const cards=page.locator('[data-home-game]');
 await expect(cards).toHaveCount(8);
 for(const card of await cards.all()){
  await card.evaluate(node=>node.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
  await expect(card).toBeVisible();
  await expect.poll(async()=>{await card.evaluate(node=>node.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));return card.evaluate(node=>{
   const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
   return {large:r.width>=44&&r.height>=44,within:r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1,hit:hit===node||node.contains(hit),noOverflow:document.documentElement.scrollWidth<=innerWidth+1};
  });}).toEqual({large:true,within:true,hit:true,noOverflow:true});
  await card.click({trial:true});
 }
}

export async function expectBubboRetainedInHome(page){
 const stage=page.locator('.bb-stage'),field=page.getByTestId('bb-field');
 await expect(page.getByTestId('home-catalogue')).toBeVisible();
 await expect(stage).toHaveCount(1);
 await expect(stage).toHaveAttribute('data-bb-phase','paused');
 await expect(page.locator('.telegram-app')).toHaveJSProperty('inert',true);
 expect(await stage.evaluate(node=>!!node.closest('[inert]'))).toBe(true);
 const shots=await field.getAttribute('data-shots');
 const home=page.getByTestId('home-catalogue');
 // Wait for the dialog's scheduled initial focus before testing non-action
 // keys on its surface. Space on the Close button would legitimately exit.
 await expect(home.locator('.home-icon')).toBeFocused();
 await home.focus();await expect(home).toBeFocused();
 await page.keyboard.press('ArrowLeft');await page.keyboard.press('Space');
 await expect(home).toBeVisible();await expect(home).toBeFocused();
 await expect(field).toHaveAttribute('data-shots',shots);
 await expect(stage).toHaveAttribute('data-bb-phase','paused');
}
