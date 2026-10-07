import {test,expect} from '@playwright/test';
import {mountHomePlayerFixture} from '../e2e/helpers/homePlayerFixture.js';

test.use({video:'on'});

// Real App, Bubbo controller/field, transport and production action dispatch.
// The existing player fixture replaces HTTP persistence only; no game state,
// navigation store, controller callback or pointer handler is injected.
for(const [width,height] of [[390,844],[568,320]])test.describe(`Bubbo full-app touch ${width}x${height}`,()=>{
  test.use({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true});

  test.afterEach(async({page},info)=>{
    if(info.status===info.expectedStatus)return;
    await info.attach('failure-dom',{body:Buffer.from(await page.content()),contentType:'text/html'}).catch(()=>{});
    await info.attach('failure-screen',{body:await page.screenshot(),contentType:'image/png'}).catch(()=>{});
    await info.attach('failure-touch-state',{body:Buffer.from(JSON.stringify(await page.evaluate(()=>({
      events:window.__bubboTouchEvents,frames:window.__bubboTouchFrames,
      field:document.querySelector('[data-testid="bb-field"]')?.dataset,
      stage:document.querySelector('[data-testid="bb-stage"]')?.dataset,
    })),null,2)),contentType:'application/json'}).catch(()=>{});
  });

  test('held touch aims without firing; release makes exactly one persisted shot',async({page},info)=>{
    const errors=[],mutations=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{
      if(new URL(request.url()).pathname!=='/api/player/mutate')return;
      const body=request.postDataJSON();
      if(body?.action?.startsWith('bubbo.'))mutations.push({action:body.action,shotsFired:body.payload?.game?.shotsFired,shotsLeft:body.payload?.game?.shotsLeft});
    });
    const player=await mountHomePlayerFixture(page);
    await page.addInitScript(()=>{
      localStorage.setItem('gh_dev_user_id','bubbo_full_app_touch');
      localStorage.setItem('garden_shelf_language','en');
      window.__bubboTouchEvents=[];window.__bubboTouchFrames=[];
      for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,event=>{
        if(!event.target.matches?.('[data-testid="bb-field"]'))return;
        window.__bubboTouchEvents.push({type,pointerType:event.pointerType,isTrusted:event.isTrusted,pointerId:event.pointerId,x:event.clientX,y:event.clientY});
      },true);
    });
    let cdp;
    try{
      await page.goto('/?tab=bubbo');
      await expect(page.locator('.status-dot.ready')).toBeVisible({timeout:20000});
      await expect(page.getByTestId('bb-start')).toBeVisible();
      await page.getByTestId('bb-start').tap();
      await expect(page.getByTestId('bb-stage')).toHaveAttribute('data-bb-phase','playing');
      const field=page.getByTestId('bb-field');
      await expect(field).toHaveAttribute('data-ready','true');
      await expect(field).toHaveAttribute('data-shots','0');
      await expect.poll(()=>player.bubbo?.currentGame?.shotsFired).toBe(0);
      await field.evaluate(node=>{
        window.__bubboObserveTouch=true;
        const observe=()=>{
          if(!window.__bubboObserveTouch)return;
          const fx=JSON.parse(node.dataset.bubboFx||'{}');
          if(window.__bubboTouchFrames.length<600)window.__bubboTouchFrames.push({at:performance.now(),shots:Number(node.dataset.shots),flight:node.dataset.flight==='true',aiming:fx.aiming});
          requestAnimationFrame(observe);
        };requestAnimationFrame(observe);
      });
      const box=await field.boundingBox();expect(box).not.toBeNull();
      const start={x:box.x+box.width*.50,y:box.y+box.height*.66};
      const target={x:box.x+box.width*.58,y:box.y+box.height*.36};
      for(const point of [start,target]){
        expect(point.x).toBeGreaterThan(0);expect(point.x).toBeLessThan(width);
        expect(point.y).toBeGreaterThan(0);expect(point.y).toBeLessThan(height);
      }
      cdp=await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});
      await expect.poll(()=>field.evaluate(node=>JSON.parse(node.dataset.bubboFx).aiming)).toBe(true);
      for(let step=1;step<=4;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(target.x-start.x)*step/4,y:start.y+(target.y-start.y)*step/4,id:1}]});
      await page.waitForTimeout(160);
      await info.attach('held-touch-before-release',{body:await page.screenshot(),contentType:'image/png'});
      await expect(field).toHaveAttribute('data-shots','0');
      await expect(field).toHaveAttribute('data-flight','false');
      expect(player.bubbo.currentGame.shotsFired).toBe(0);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await expect(field).toHaveAttribute('data-shots','1',{timeout:6000});
      await expect(field).toHaveAttribute('data-flight','false');
      await expect.poll(()=>player.bubbo?.currentGame?.shotsFired).toBe(1);
      await expect.poll(()=>field.evaluate(node=>JSON.parse(node.dataset.bubboFx).aiming)).toBe(false);
      // Longer than another ordinary flight after the owned touch has ended.
      // This catches release/cleanup replay without generating a second gesture.
      await page.waitForTimeout(1100);
      await expect(field).toHaveAttribute('data-shots','1');
      expect(player.bubbo.currentGame.shotsFired).toBe(1);
      expect(player.bubbo.currentGame.shotsLeft).toBe(35);
      const evidence=await page.evaluate(()=>({events:window.__bubboTouchEvents,frames:window.__bubboTouchFrames}));
      await info.attach('touch-release-result',{body:await page.screenshot(),contentType:'image/png'});
      await info.attach('trusted-touch-and-flight',{body:Buffer.from(JSON.stringify({...evidence,mutations,errors,savedGame:{shotsFired:player.bubbo.currentGame.shotsFired,shotsLeft:player.bubbo.currentGame.shotsLeft}},null,2)),contentType:'application/json'});
      expect(evidence.events.filter(event=>event.type==='pointerdown'&&event.pointerType==='touch'&&event.isTrusted)).toHaveLength(1);
      expect(evidence.events.some(event=>event.type==='pointermove'&&event.pointerType==='touch'&&event.isTrusted)).toBe(true);
      expect(evidence.events.filter(event=>event.type==='pointerup'&&event.pointerType==='touch'&&event.isTrusted)).toHaveLength(1);
      expect(evidence.events.filter(event=>event.type==='pointercancel')).toHaveLength(0);
      expect(evidence.frames.some(frame=>frame.flight)).toBe(true);
      expect(Math.max(...evidence.frames.map(frame=>frame.shots))).toBe(1);
      expect(mutations.filter(mutation=>mutation.action==='bubbo.start')).toHaveLength(1);
      expect(mutations.some(mutation=>mutation.action==='bubbo.sync'&&mutation.shotsFired===1&&mutation.shotsLeft===35)).toBe(true);
      expect(mutations.some(mutation=>mutation.shotsFired>1||mutation.action==='bubbo.end')).toBe(false);
      expect(errors).toEqual([]);
    }finally{
      await page.evaluate(()=>{window.__bubboObserveTouch=false;}).catch(()=>{});
      await info.attach('mutation-and-error-log',{body:Buffer.from(JSON.stringify({mutations,errors},null,2)),contentType:'application/json'});
      await cdp?.detach().catch(()=>{});
    }
  });
});
