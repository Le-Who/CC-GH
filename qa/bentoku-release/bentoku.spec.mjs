/** Real candidate backend and live hosted game, with a disposable signed account. */
import {test,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import {fixture,insertFixture,auth,origin,DATABASE_URL,assertDevelopmentEnvironment} from './image-helpers.mjs';
assertDevelopmentEnvironment();
test('Bentoku catalogue, live iframe, mobile placement and lifecycle',async({browser})=>{
 test.setTimeout(70000);
 const OUT=path.resolve(process.env.YARD_DEVELOPMENT_EVIDENCE),runId=process.env.YARD_DEVELOPMENT_RUN_ID;
 const runtime=JSON.parse(await fs.readFile(path.join(OUT,'runtime.json'),'utf8'));assert.equal(runtime.runId,runId);
 const sql=postgres(DATABASE_URL,{max:1,prepare:false,connect_timeout:5,statement_timeout:5000});
 const proof={head:process.env.GITHUB_SHA,status:'failed',hostedOrigin:'https://bentoku-nine.vercel.app',cases:[],captures:[],reloadPreserved:false};
 try{
  const [db]=await sql`SELECT current_database() AS name`;assert.equal(db.name,'ccgh_yard_production_ci');
  const f=fixture();await insertFixture(sql,f,runId);const initData=await auth(f);
  for(const [width,height]of [[320,568],[390,844],[568,320]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
   try{
    const p=await context.newPage();
    await p.addInitScript(({initData,id,parentOrigin})=>{if(location.origin!==parentOrigin)return;window.Telegram={WebApp:{initData,initDataUnsafe:{user:{id,first_name:'Disposable development fixture'}}}};localStorage.setItem('garden_shelf_language','ru');},{initData,id:Number(f.externalId),parentOrigin:origin('origin')});
    await p.goto(origin('origin')+'/#tgWebAppPlatform=android&tgWebAppVersion=8.0',{waitUntil:'domcontentloaded'});
    await expect.poll(()=>p.evaluate(()=>window.__APP_BUILD_ID__)).toBe(runtime.inputs.candidate.commit);
    await expect(p.locator('main[data-active-tab]')).toHaveAttribute('data-active-tab','garden');await p.keyboard.press('Escape');await expect(p.getByTestId('home-catalogue')).toBeVisible();
    expect(await p.locator('[data-home-game]').evaluateAll(nodes=>nodes.slice(0,2).map(n=>n.dataset.homeGame))).toEqual(['garden','bentoku']);
    const card=p.locator('[data-home-game="bentoku"]');await expect(card).toHaveAccessibleName('Bentoku');
    const box=await card.boundingBox();assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height,'Bentoku must be fully visible in the first row without scrolling');
    expect(await p.getByTestId('home-catalogue').evaluate(n=>n.scrollTop)).toBe(0);
    await expect(card.locator('img')).toHaveJSProperty('naturalWidth',512);
    if(width===390){const name='bentoku-catalogue-390x844.png';await p.screenshot({path:path.join(OUT,name)});proof.captures.push(name);}
    await card.tap();
    const ready=async()=>{await expect(p.locator('[data-game-shell="bentoku"]')).toHaveAttribute('data-status','ready',{timeout:20000});const frame=p.frames().find(f=>f.url().startsWith('https://bentoku-nine.vercel.app/'));assert(frame);await expect(frame.locator('.mobile-theme-loading')).toBeHidden({timeout:15000});await expect(frame.locator('.mobile-shell')).toBeVisible();return frame;};
    let frame=await ready();
    const frameUrl=new URL(frame.url());expect(frameUrl.searchParams.get('embed')).toBe('ccgh');
    expect([...frameUrl.searchParams.keys()]).toEqual(['embed']);
    expect(await frame.evaluate(()=>({initData:!!window.Telegram?.WebApp?.initData,user:!!window.Telegram?.WebApp?.initDataUnsafe?.user}))).toEqual({initData:false,user:false});
    await expect(frame.locator('[data-cell]')).toHaveCount(9);await expect(frame.locator('[data-pocket]')).toHaveCount(12);
    await frame.locator('[data-pocket] [data-piece-id]').first().tap();await frame.locator('[data-cell="0"]').tap();
    await expect(frame.locator('[data-cell="0"] [data-piece-id]')).toHaveCount(1);
    const save=await frame.evaluate(()=>localStorage.getItem('bentoku.save.v1'));assert(save);
    const before=await p.evaluate(()=>({href:location.href,timeOrigin:performance.timeOrigin}));
    await p.getByRole('button',{name:'Все игры',exact:true}).tap();await expect(p.getByTestId('home-catalogue')).toBeVisible();
    await expect.poll(()=>frame.evaluate(()=>({paused:window.__BENTOKU_GAME__.isPaused,inert:document.body.inert,input:window.__BENTOKU_GAME__.input.enabled,playing:window.__BENTOKU_GAME__.sound.getAllPlaying().length}))).toEqual({paused:true,inert:true,input:false,playing:0});
    await card.scrollIntoViewIfNeeded();await card.tap();await expect.poll(()=>frame.evaluate(()=>window.__BENTOKU_GAME__.isPaused)).toBe(false);
    expect(await frame.evaluate(()=>localStorage.getItem('bentoku.save.v1'))).toBe(save);
    expect(await p.evaluate(()=>({href:location.href,timeOrigin:performance.timeOrigin}))).toEqual(before);
    const geometry=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
    const inner=await frame.evaluate(()=>{const r=document.querySelector('.mobile-shell'),t=document.querySelector('.mobile-toolbar').getBoundingClientRect();return{overflow:r.scrollHeight-r.clientHeight,bottom:t.bottom,height:innerHeight};});expect(inner.overflow).toBeLessThanOrEqual(1);expect(inner.bottom).toBeLessThanOrEqual(inner.height+1);
    if(width===390){await p.reload({waitUntil:'domcontentloaded'});frame=await ready();expect(await frame.evaluate(()=>localStorage.getItem('bentoku.save.v1'))).toBe(save);proof.reloadPreserved=true;}
    const capture=`bentoku-${width}x${height}.png`;await p.screenshot({path:path.join(OUT,capture),scale:'device'});proof.captures.push(capture);
    proof.cases.push({viewport:`${width}x${height}`,status:'passed',placed:true,paused:true,resumed:true,geometry:inner,documentPreserved:true});
   }catch(error){
    proof.error=String(error).slice(0,3000);const p=context.pages()[0];
    if(p){try{const name=`bentoku-${width}x${height}-failure.png`;await p.screenshot({path:path.join(OUT,name),timeout:2500});proof.captures.push(name);proof.failureObservation=await p.evaluate(()=>({url:location.origin+location.pathname,queryKeys:[...new URL(location.href).searchParams.keys()],gameShell:document.querySelector('[data-game-shell="bentoku"]')?.dataset.status,homeVisible:!!document.querySelector('[data-testid="home-catalogue"]')}));}catch(captureError){proof.captureError=String(captureError).slice(0,800);}}
    throw error;
   }finally{await context.close();}
  }proof.status='passed';
 }finally{await fs.writeFile(path.join(OUT,'bentoku-proof.json'),JSON.stringify(proof,null,2)+'\n');await sql.end({timeout:5});}
});
