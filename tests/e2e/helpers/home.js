import {expect} from '@playwright/test';
export async function openHome(page){
 if(await page.getByTestId('home-catalogue').count())return;
 const id=await page.locator('.telegram-app').getAttribute('data-active-tab');
 if(id==='garden')await expect(page.locator('.gs2-stage')).toBeVisible();
 else await expect(page.locator('.telegram-app.immersive-mode')).toBeVisible();
 const launcher=page.getByRole('button',{name:/^(All games|Все игры)$/});
 const pause=page.locator('[data-game-pause="true"]');
 const workshop=page.getByTestId('ml-exit');
 const yardSettings=page.locator('.companion-yard-stage').getByRole('button',{name:/^(Settings|Настройки)$/});
 await expect.poll(async()=>await launcher.isVisible() || await pause.isVisible() || await workshop.isVisible() || await yardSettings.isVisible()).toBe(true);
 if(await launcher.isVisible())await launcher.click();
 else if(await workshop.isVisible())await workshop.click();
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
