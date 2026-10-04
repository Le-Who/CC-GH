import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

const scope='actual-dom-static-canvas-art-study-no-backend-no-animation';
const inputsUrl=process.env.YARD_SCENE_STUDY_INPUTS;
if(!inputsUrl||!/^\/yard-static-study\/[a-zA-Z0-9._/-]+\.json$/.test(inputsUrl)||inputsUrl.includes('..'))throw Error('Set YARD_SCENE_STUDY_INPUTS to the explicitly selected static-study manifest');
async function capture(page,info,name){
  const styleReadiness=await page.evaluate(async()=>{
    const fonts=await Promise.all([400,600,800,900].map(async weight=>{const faces=await document.fonts.load(`${weight} 14px Nunito`,'Уютный двор Предметы 1250');if(!faces.length)throw Error('Production Nunito is not registered: '+weight);return{weight,faces:faces.length};}));
    await document.fonts.ready;
    const style=getComputedStyle(document.querySelector('.cy-app'));
    const surfaces=['--cy-strip-art','--cy-panel-art','--cy-card-art','--cy-button-art'].map(property=>{
      const value=style.getPropertyValue(property).trim(),match=/^url\(["']?([^"')]+)["']?\)$/.exec(value);
      if(!match)throw Error('Missing actual CSS surface '+property);
      return{property,url:new URL(match[1],location.href).href};
    });
    for(const surface of surfaces){const image=new Image();image.src=surface.url;await image.decode();if(!image.naturalWidth||!image.naturalHeight)throw Error('Undecoded CSS surface '+surface.property);surface.width=image.naturalWidth;surface.height=image.naturalHeight;}
    return{surfaces,fonts,fontsStatus:document.fonts.status,declaredFontFamily:style.fontFamily,registeredFonts:[...document.fonts].map(face=>({family:face.family,status:face.status}))};
  });
  await expect.poll(()=>page.locator('img').evaluateAll(images=>images.filter(image=>{
    const r=image.getBoundingClientRect(),style=getComputedStyle(image),clip=image.closest('.cy-panel')?.getBoundingClientRect();
    const visible=style.visibility!=='hidden'&&r.width&&r.height&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&(!clip||r.bottom>clip.top&&r.top<clip.bottom);
    return visible&&(!image.complete||!image.naturalWidth);
  }).map(image=>image.getAttribute('src')))).toEqual([]);
  await page.screenshot({path:info.outputPath(`art-study-actual-dom-static-canvas-${info.project.name}-${name}.png`),fullPage:false});
  const metrics=await page.evaluate(()=>{
    const observation=window.__yardDomCanvasStudy.snapshot(),faults=[];
    for(const element of [document.documentElement,document.body,...document.querySelectorAll('.cy-panel')])if(element.clientWidth&&element.scrollWidth>element.clientWidth+1)faults.push({type:'horizontal-overflow',element:element.className||element.tagName});
    for(const control of document.querySelectorAll('button,input,select')){
      const r=control.getBoundingClientRect();if(!r.width||!r.height)continue;
      if(r.width<43.9||r.height<43.9)faults.push({type:'tap-target',text:control.textContent.trim(),width:r.width,height:r.height});
      if(!control.closest('.cy-panel')&&(r.left<-.5||r.right>innerWidth+.5||r.top<-.5||r.bottom>innerHeight+.5))faults.push({type:'control-clipped',text:control.textContent.trim()});
    }
    for(const label of document.querySelectorAll('.cy-header h1,.cy-wallet,.cy-actions button,.cy-tabs button,.cy-selected-actions strong,.cy-catalog-choice>strong'))if(label.clientWidth&&label.scrollWidth>label.clientWidth+1)faults.push({type:'label-clipped',text:label.textContent.trim()});
    const canvas=document.querySelector('.cy-scene canvas'),r=canvas.getBoundingClientRect(),ctx=canvas.getContext('2d');
    const cornerAlpha=[[0,0],[canvas.width-1,0],[0,canvas.height-1],[canvas.width-1,canvas.height-1]].map(([x,y])=>ctx.getImageData(x,y,1,1).data[3]);
    return{scope:document.body.dataset.fixtureScope,viewport:{width:innerWidth,height:innerHeight},canvas:{cssWidth:r.width,cssHeight:r.height,width:canvas.width,height:canvas.height,cornerAlpha},faults,...observation};
  });
  await writeFile(info.outputPath(`art-study-${info.project.name}-${name}-metrics.json`),JSON.stringify({...metrics,styleReadiness},null,2));
  expect(styleReadiness.surfaces).toHaveLength(4);expect(styleReadiness.fontsStatus).toBe('loaded');
  expect(metrics.scope).toBe(scope);expect(metrics.ready).toBe(true);expect(metrics.error).toBeNull();expect(metrics.faults).toEqual([]);
  expect(metrics.scene.errors).toEqual([]);expect(metrics.scene.disposed).toBe(false);expect(metrics.scene.sourceFrame).toBe(metrics.selectedInput.sourceFrame);expect(metrics.scene.sourceTimeMs).toBe(metrics.selectedInput.sourceTimeMs);
  expect(metrics.scene.inputSha256).toBe(metrics.selectedInput.sha256);expect(metrics.scene.cameraDirection).toEqual(metrics.selectedInput.cameraDirection);
  expect(metrics.selectedInput.cameraDirection).toEqual([5.66,-8,9.799775507632814]);
  expect(new URL(metrics.scene.inputUrl).pathname).toBe('/yard-static-study/inputs-elevation45-original-azimuth.json');
  expect(metrics.scene.media.map(row=>row.id).sort()).toEqual(['plate','plate10','subject','moon','cushion','mouse'].sort());
  expect(metrics.scene.media.every(row=>row.http===200&&/^[a-f0-9]{64}$/.test(row.sha256))).toBe(true);
  expect(metrics.scene.lastDraw.variant).toBe('cottage10');expect(metrics.scene.lastDraw.showGate).toBe(false);expect(metrics.scene.lastDraw.foliageCount).toBe(0);
  expect(metrics.scene.lastDraw.drawables.map(row=>row.id).sort()).toEqual(['basil-fountain','moon','cushion','mouse'].sort());
  const drawableByGoodie={moon_lamp:'moon',sun_cushion:'cushion',yarn_mouse:'mouse',fountain_bowl:'basil-fountain'};
  for(const prop of metrics.projectedFixtureProps){const drawn=metrics.scene.lastDraw.drawables.find(row=>row.id===drawableByGoodie[prop.goodieId]);expect(drawn).toBeTruthy();expect(prop.point).not.toBeNull();expect(drawn.pivot.x).toBeCloseTo(prop.point.x,5);expect(drawn.pivot.y).toBeCloseTo(prop.point.y,5);}
  expect(metrics.selectedInput.url).toBe(inputsUrl);expect(metrics.selectedInput.sha256).toBe('8916da3249a78b7b5b6f5371276f93a1cd99c48997214f3df07c136b3c840e85');
  const fixedPlacements=metrics.fixtureProps.map(p=>({goodieId:p.goodieId,placementWorldXY:[p.x,p.y]})).sort((a,b)=>a.goodieId.localeCompare(b.goodieId));
  expect(fixedPlacements).toEqual([{goodieId:'fountain_bowl',placementWorldXY:[40,40]},{goodieId:'moon_lamp',placementWorldXY:[60,40]},{goodieId:'sun_cushion',placementWorldXY:[64,68]},{goodieId:'yarn_mouse',placementWorldXY:[72,54]}]);
  expect(metrics.scene.placements.map(({goodieId,placementWorldXY})=>({goodieId,placementWorldXY})).sort((a,b)=>a.goodieId.localeCompare(b.goodieId))).toEqual(fixedPlacements);
  expect(metrics.scene.lastSize.width).toBeCloseTo(metrics.canvas.cssWidth,2);expect(metrics.scene.lastSize.height).toBeCloseTo(metrics.canvas.cssHeight,2);
  expect(metrics.scene.lastSize.backingWidth).toBe(metrics.canvas.width);expect(metrics.scene.lastSize.backingHeight).toBe(metrics.canvas.height);
  expect(metrics.canvas.cornerAlpha).toEqual([255,255,255,255]);expect(metrics.scene.retainedTotalBytes).toBeLessThan(32*1024*1024);
  expect(metrics.balances).toEqual({treats:1250,shinyTreats:12});
}

test.afterEach(async({page},info)=>{
  const diagnostics=await page.evaluate(()=>window.__yardDomCanvasStudy?.snapshot()??null).catch(error=>({readError:String(error.message)}));
  await writeFile(info.outputPath('art-study-final-diagnostics.json'),JSON.stringify({scope,inputsUrl,diagnostics},null,2));
});

test('whole actual DOM and static Canvas normal screen and catalogue',async({page},info)=>{
  const errors=[],apiRequests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))apiRequests.push(request.url());});
  await page.route('**/api/**',route=>route.abort('blockedbyclient'));
  await page.goto('/?sceneInputs='+encodeURIComponent(inputsUrl));
  await expect(page.getByRole('heading',{name:'Уютный двор'})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__yardDomCanvasStudy?.snapshot().ready||false)).toBe(true);
  await expect(page.locator('.cy-background')).toBeHidden();await expect(page.locator('.cy-wallet')).toHaveCount(2);
  await expect(page.locator('.cy-wallet').nth(0)).toHaveAttribute('aria-label',/1\D*250/);await expect(page.locator('.cy-wallet').nth(1)).toHaveAttribute('title','12');
  await capture(page,info,'normal');
  await page.getByRole('navigation').getByRole('button',{name:/^Предметы\./}).click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog.locator('.cy-catalog-choice')).toHaveCount(4);
  await expect(dialog.getByRole('button',{name:'Во дворе',exact:true})).toHaveAttribute('aria-pressed','true');
  for(const label of ['Лунная лампа','Солнечная подушка','Нитяная мышь','Чаша-фонтан'])await expect(dialog.locator('.cy-catalog-choice').filter({hasText:label})).toHaveCount(1);
  await capture(page,info,'placed-catalogue');
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:/^Предметы\./}).click();await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:'Закрыть панель двора'}).click();await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);expect(apiRequests).toEqual([]);expect(await page.locator('body').getAttribute('data-blocked-mutation-attempts')).toBeNull();
});
