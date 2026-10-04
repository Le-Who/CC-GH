import {expect} from '@playwright/test';

const escaped=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export const dialog=page=>page.getByRole('dialog');
export async function openPanel(page,title){
  if(await dialog(page).isVisible())await dialog(page).getByRole('button',{name:'Close courtyard panel',exact:true}).click();
  await page.getByRole('navigation',{name:'Courtyard actions'}).getByRole('button',{name:new RegExp(`^${escaped(title)}\\.`)}).click();
  await expect(dialog(page)).toBeVisible();
}
export async function chooseItem(page,category,title,index=0){
  const panel=dialog(page);
  await panel.getByRole('button',{name:category,exact:true}).click();
  const item=panel.getByRole('button').filter({has:page.getByText(title,{exact:true})}).nth(index);
  await item.click();await expect(item).toHaveAttribute('aria-pressed','true');
  return item;
}
export async function guestSection(page,title){
  const button=dialog(page).getByRole('button',{name:title,exact:true});await button.click();await expect(button).toHaveAttribute('aria-pressed','true');
}
export const foodCard=(page,title)=>dialog(page).getByRole('article').filter({has:page.getByText(title,{exact:true})});
export async function expectWallet(page,currencies){
  for(const [key,label]of [['treats','Treats'],['shinyTreats','Shiny']]){
    const exact=new Intl.NumberFormat('en',{maximumFractionDigits:0}).format(currencies[key]);
    const chip=page.getByLabel(`${label}: ${exact}`,{exact:true});
    await expect(chip).toHaveCount(1);await expect(chip).toHaveAttribute('title',exact);
  }
}
export async function outbox(page,accountId){
  return page.evaluate(async id=>{
    const key=`game_hub_yard_outbox_v2:${encodeURIComponent(id)}`,local=localStorage.getItem(key);
    if(local)return JSON.parse(local);
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open('keyval-store');request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('keyval')){db.close();resolve(null);return;}
        const get=db.transaction('keyval','readonly').objectStore('keyval').get(key);
        get.onsuccess=()=>{db.close();resolve(get.result??null);};get.onerror=()=>{db.close();reject(get.error);};};
    });
  },accountId);
}
export async function emptyOutbox(page,accountId){
  await expect.poll(async()=>{const saved=await outbox(page,accountId);return saved?.version===2&&saved.accountId===accountId&&saved.items.length===0;}).toBe(true);
}
export async function boot(page,h,fixture){
  await page.addInitScript(({initData,id})=>{window.Telegram={WebApp:{initData,initDataUnsafe:{user:{id,first_name:'Disposable UI QA'}}}};localStorage.setItem('garden_shelf_language','en');},{initData:h.auth(fixture),id:Number(fixture.externalId)});
  await page.goto(`${h.origin}/?tab=room`);
  await expect(page.locator('.status-dot.ready')).toHaveCount(1,{timeout:30000});
  await expect(page.locator('.cy-app')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__APP_BUILD_ID__)).toBe(h.commit);
  const snapshot=await h.snapshot(fixture);expect(snapshot.yardRuntime.mutable).toBe(true);expect(snapshot.yardRuntime.actionProtocol).toBe('yard-v2:');
}
export async function sceneReady(page){
  await expect.poll(()=>page.locator('.cy-scene canvas').evaluate(canvas=>{
    if(!canvas.width||!canvas.height)return false;
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let count=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0&&++count>=32)return true;
    return false;
  }),{timeout:30000}).toBe(true);
  await expect(page.locator('.cy-status')).not.toContainText('The courtyard could not load.');
}
