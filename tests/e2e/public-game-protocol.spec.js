/** Read-only public static origin check. Never load the game document into the
 * browser or call account/config/mutation APIs; navigate only verified JS text. */
import {test,expect} from '@playwright/test';
const ORIGIN='https://games.tri.mom';
test('public game static asset records negotiated browser protocol without account access',async({request,page},info)=>{
 const html=await request.get(ORIGIN+'/',{failOnStatusCode:true});
 expect(html.headers()['content-type']).toContain('text/html');
 const source=await html.text();
 const scripts=[...source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match=>new URL(match[1],ORIGIN));
 const asset=scripts.find(url=>url.origin===ORIGIN&&url.pathname.endsWith('.js')&&!url.search);
 expect(asset,'verified same-origin public entry script').toBeTruthy();
 const checked=await request.get(asset.href,{failOnStatusCode:true});
 expect(checked.headers()['content-type']).toMatch(/(?:application|text)\/javascript/);
 expect(checked.headers()['content-disposition']||'').not.toMatch(/attachment/i);
 const cacheHeaders=[];
 for(const path of [asset.pathname,'/games/garden-v2/background.webp','/games/garden-living/daisy-mature-r2.webp']){
  const resource=await request.get(ORIGIN+path,{failOnStatusCode:true}),h=resource.headers();
  cacheHeaders.push({path,status:resource.status(),contentType:h['content-type'],cacheControl:h['cache-control']||null,etag:h.etag||null,lastModified:h['last-modified']||null,contentLength:h['content-length']||null,contentEncoding:h['content-encoding']||null});
 }
 const requests=[];
 await page.route('**/*',route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()!=='GET'||url.origin!==ORIGIN||url.pathname!==asset.pathname||url.search)return route.abort();
  requests.push({method:req.method(),path:url.pathname});return route.continue();
 });
 const response=await page.goto(asset.href,{waitUntil:'load'});
 expect(response.status()).toBe(200);
 expect(response.headers()['content-type']).toMatch(/(?:application|text)\/javascript/);
 const navigation=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];return n?{nextHopProtocol:n.nextHopProtocol,startTime:n.startTime,requestStart:n.requestStart,responseStart:n.responseStart,responseEnd:n.responseEnd,encodedBytes:n.encodedBodySize,transferBytes:n.transferSize}:null;});
 expect(navigation?.nextHopProtocol).toBeTruthy();
 await info.attach('public-static-protocol.json',{contentType:'application/json',body:Buffer.from(JSON.stringify({origin:ORIGIN,assetPath:asset.pathname,scope:'Public HTML via GET, verified JavaScript text navigation only. No authenticated/account/API requests; protocol describes this static asset connection, not all production endpoints.',navigation,requests,cacheHeaders},null,2))});
});
