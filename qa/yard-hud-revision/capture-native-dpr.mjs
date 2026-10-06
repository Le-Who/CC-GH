/** Called by the authorized browser owner. Does not create a browser or server.
 * Raw device-scale PNGs qualify pixel density; CSS-scale images remain layout evidence. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
export async function captureNativeHud(page,outputDirectory,{label='hud',expectedDpr=2}={}){
 assert.ok([2,3].includes(expectedDpr));
 const fonts=await page.evaluate(async()=>{
  const family=face=>face.family.replaceAll('"','').replaceAll("'",'');
  const faces=[...document.fonts].filter(face=>family(face)==='Nunito');
  if(!faces.some(face=>face.weight==='600')||!faces.some(face=>face.weight==='700'))throw Error('Nunito600/700 font faces were not included');
  await Promise.all([document.fonts.load('600 14px Nunito','Выберите место · Choose a spot'),document.fonts.load('700 16px Nunito','Лакомства 9,999 Treats')]);
  await document.fonts.ready;
  const loaded=[...document.fonts].filter(face=>family(face)==='Nunito'&&face.status==='loaded').map(face=>({weight:face.weight,unicodeRange:face.unicodeRange}));
  const requests=performance.getEntriesByType('resource').filter(row=>/nunito-(?:cyrillic|latin)[^/]*\.woff2(?:\?|$)/.test(row.name)).map(row=>({url:row.name,transferSize:row.transferSize,decodedBodySize:row.decodedBodySize}));
  return{dpr:devicePixelRatio,loaded,requests,appFamily:getComputedStyle(document.querySelector('.cy-app')).fontFamily,walletFamily:getComputedStyle(document.querySelector('.cy-wallet strong')).fontFamily,walletWeight:getComputedStyle(document.querySelector('.cy-wallet strong')).fontWeight};
 });
 assert.equal(fonts.dpr,expectedDpr);assert.match(fonts.appFamily,/Nunito/);assert.match(fonts.walletFamily,/Nunito/);assert.equal(fonts.walletWeight,'700');
 assert.ok(fonts.requests.some(row=>row.url.includes('nunito-cyrillic-')),'Actual Cyrillic font request missing');assert.ok(fonts.requests.some(row=>row.url.includes('nunito-latin-')),'Actual Latin font request missing');
 await mkdir(outputDirectory,{recursive:true});const captures=[];
 for(const [name,selector]of[['header','.cy-header'],['dock','.cy-actions']]){
  const element=page.locator(selector),bounds=await element.boundingBox();assert.ok(bounds);
  const bytes=await element.screenshot({type:'png',scale:'device',animations:'disabled'});
  assert.equal(bytes.subarray(1,4).toString(),'PNG');const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  assert.ok(Math.abs(width-bounds.width*expectedDpr)<=1);assert.ok(Math.abs(height-bounds.height*expectedDpr)<=1);
  const file=`${label}-${name}-dpr${expectedDpr}.png`;await writeFile(path.join(outputDirectory,file),bytes);
  captures.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),cssBounds:bounds,pixelSize:[width,height],scale:'device'});
 }
 const result={label,viewport:page.viewportSize(),fonts,captures,qualification:'Actual native-DPR browser PNGs; inspect pixels separately from these mechanical checks'};
 await writeFile(path.join(outputDirectory,`${label}-dpr${expectedDpr}.json`),JSON.stringify(result,null,2)+'\n');return result;
}
