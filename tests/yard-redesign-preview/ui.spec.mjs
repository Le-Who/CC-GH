import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

const scope='ui-only-fixed-fixture-no-live-scene-no-backend';
async function openPanel(page,label){
  await page.getByRole('navigation').getByRole('button',{name:new RegExp(`^${label}\\.`)}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
async function settleImages(page){
  await expect.poll(()=>page.locator('img').evaluateAll(images=>images.filter(image=>{
    const rect=image.getBoundingClientRect(),style=getComputedStyle(image);
    if(!rect.width||!rect.height||style.visibility==='hidden')return false;
    const panel=image.closest('.cy-panel'),clip=panel?.getBoundingClientRect();
    const visible=rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth&&(!clip||rect.bottom>clip.top&&rect.top<clip.bottom);
    return visible&&(!image.complete||!image.naturalWidth);
  }).map(image=>image.getAttribute('src'))),{message:'Visible authored images must load'}).toEqual([]);
}
async function capture(page,testInfo,name){
  await settleImages(page);
  const filename=`fixed-fixture-ui-only-${testInfo.project.name}-${name}.png`;
  await page.screenshot({path:testInfo.outputPath(filename),fullPage:false});
  const metrics=await page.evaluate(()=>{
    const faults=[],viewport={width:innerWidth,height:innerHeight};
    for(const element of [document.documentElement,document.body,...document.querySelectorAll('.cy-panel')]){
      if(element.clientWidth&&element.scrollWidth>element.clientWidth+1)faults.push({type:'horizontal-overflow',element:element.className||element.tagName,width:element.clientWidth,scroll:element.scrollWidth});
    }
    for(const button of document.querySelectorAll('button,input,select')){
      const r=button.getBoundingClientRect();if(!r.width||!r.height)continue;
      if(r.width<43.9||r.height<43.9)faults.push({type:'tap-target',text:button.textContent.trim(),width:r.width,height:r.height});
      if(!button.closest('.cy-panel')&&(r.left<-.5||r.right>innerWidth+.5||r.top<-.5||r.bottom>innerHeight+.5))faults.push({type:'control-clipped',text:button.textContent.trim(),rect:{x:r.x,y:r.y,width:r.width,height:r.height}});
    }
    for(const label of document.querySelectorAll('.cy-header h1,.cy-wallet,.cy-actions button,.cy-tabs button,.cy-selected-actions strong,.cy-card>strong,.cy-catalog-choice>strong')){
      if(label.classList.contains('cy-visually-hidden'))continue;
      if(label.clientWidth&&label.scrollWidth>label.clientWidth+1)faults.push({type:'label-clipped',text:label.textContent.trim()});
    }
    return{scope:document.body.dataset.fixtureScope,viewport,faults,mutationAttempts:Number(document.body.dataset.blockedMutationAttempts||0)};
  });
  const metricsPath=testInfo.outputPath(`fixed-fixture-ui-only-${name}-metrics.json`);
  await writeFile(metricsPath,JSON.stringify(metrics,null,2));
  expect(metrics.scope).toBe(scope);expect(metrics.faults).toEqual([]);
}

test.beforeEach(async({page})=>{
  await page.route('**/api/**',route=>route.abort('blockedbyclient'));
});

test('actual UI catalog, food, guests, album, close and Escape',{tag:'@ui-only-fixed-fixture'},async({page},testInfo)=>{
  const faults=[];page.on('pageerror',error=>faults.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Уютный двор'})).toBeVisible();
  await expect(page.locator('.cy-wallet')).toHaveCount(2);
  await expect(page.locator('.cy-wallet').nth(0)).toHaveAttribute('aria-label',/123\D*456\D*789/);
  await expect(page.locator('.cy-wallet').nth(1)).toHaveAttribute('aria-label',/987\D*654\D*321/);
  await capture(page,testInfo,'main-large-balances');

  await openPanel(page,'Предметы');
  await expect(page.locator('.cy-selected-actions')).toContainText('Занято гостем');
  await expect(page.getByRole('button',{name:'Передвинуть',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Убрать',exact:true})).toBeDisabled();
  await capture(page,testInfo,'items-placed-occupied');
  await page.getByRole('button',{name:/^Солнечная подушка/}).click();
  await expect(page.getByRole('button',{name:/^Починить/})).toContainText('24');
  await capture(page,testInfo,'items-placed-repair');
  await page.getByRole('button',{name:'Запасы',exact:true}).click();
  await expect(page.locator('.cy-catalog-choice')).toHaveCount(6);
  await page.getByRole('button',{name:/^Столик для перекуса/}).click();
  await capture(page,testInfo,'items-inventory-long-title');
  await page.getByRole('button',{name:'Магазин',exact:true}).click();
  await page.getByRole('button',{name:/^Лунная лампа/}).click();
  await expect(page.locator('.cy-selected-actions')).toContainText('360 лакомств + 3 сияющих');
  await capture(page,testInfo,'items-shop-mixed-price');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await page.evaluate(()=>!!document.activeElement?.closest('dialog'))).toBe(false);

  await openPanel(page,'Еда');
  await expect(page.getByRole('combobox',{name:'Корм: Вторая миска'})).toBeDisabled();
  await capture(page,testInfo,'food-bowls');
  await page.getByRole('heading',{name:'Еда',exact:true}).last().scrollIntoViewIfNeeded();
  await capture(page,testInfo,'food-catalog');
  await page.getByRole('button',{name:'Закрыть панель двора'}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();

  await openPanel(page,'Гости');
  await capture(page,testInfo,'guests-gifts-letter');
  await page.getByRole('heading',{name:'Знакомые гости'}).scrollIntoViewIfNeeded();
  await expect(page.locator('.cy-card')).toHaveCount(9);
  await capture(page,testInfo,'guests-portraits');
  await page.getByRole('button',{name:'Фотоальбом',exact:true}).click();
  await expect(page.locator('.cy-photo-art')).toHaveCount(8);
  await capture(page,testInfo,'album');
  await page.getByRole('button',{name:'Помощник',exact:true}).click();
  await capture(page,testInfo,'helper');
  await page.getByRole('button',{name:'Закрыть панель двора'}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(faults).toEqual([]);
  expect(await page.locator('body').getAttribute('data-blocked-mutation-attempts')).toBeNull();
});

test('empty, loading, error and English UI states',{tag:'@ui-only-fixed-fixture'},async({page},testInfo)=>{
  for(const state of ['empty','loading','error']){
    await page.goto(`/?state=${state}`);await capture(page,testInfo,`${state}-main`);
    await openPanel(page,'Предметы');await page.getByRole('button',{name:'Запасы',exact:true}).click();
    await capture(page,testInfo,`${state}-inventory`);
    await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
  }
  await page.goto('/?lang=en');await openPanel(page,'Items');
  await page.getByRole('button',{name:'Inventory',exact:true}).click();
  await capture(page,testInfo,'english-inventory');
});

test('placement explanations from explicit fixture outcomes',{tag:'@ui-only-fixed-fixture'},async({page},testInfo)=>{
  for(const [result,text]of [['valid','Место свободно'],['outside','Весь предмет должен быть внутри двора.'],['collision','Здесь уже стоит другой предмет.'],['reserved','По этому пути идёт гость.']]){
    await page.goto(`/?placement=${result}`);await openPanel(page,'Предметы');
    await page.getByRole('button',{name:'Запасы',exact:true}).click();
    await page.getByRole('button',{name:'Поставить',exact:true}).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('status')).toContainText(text);
    const confirm=page.getByRole('button',{name:'Поставить',exact:true});
    if(result==='valid')await expect(confirm).toBeEnabled();else await expect(confirm).toBeDisabled();
    await capture(page,testInfo,`placement-fixture-${result}`);
    await page.getByRole('button',{name:'Отмена',exact:true}).click();
    await expect(page.locator('.cy-placement')).toHaveCount(0);
  }
  expect(await page.locator('body').getAttribute('data-blocked-mutation-attempts')).toBeNull();
});

test('attempted purchase stays blocked without a transport request',{tag:'@ui-only-fixed-fixture'},async({page},testInfo)=>{
  const requests=[];page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))requests.push(request.url());});
  await page.goto('/');await openPanel(page,'Предметы');
  await page.getByRole('button',{name:'Магазин',exact:true}).click();
  await page.getByRole('button',{name:'Купить',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('this action was blocked');
  await expect(page.locator('body')).toHaveAttribute('data-blocked-mutation-attempts','1');
  await capture(page,testInfo,'mutation-blocked');
  expect(requests).toEqual([]);
});
