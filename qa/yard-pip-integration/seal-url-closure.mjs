/** Seal explicit source-derived requirements against real emitted bytes.
 * This cannot invent a missing descriptor or declare an incomplete graph complete.
 * Call after the actual source build and the reviewed final descriptor enumerator. */
import fs from 'node:fs/promises';import path from 'node:path';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)),REPO=path.resolve(HERE,'../..'),DIST=path.join(HERE,'dist');
const sha=b=>createHash('sha256').update(b).digest('hex'),check=(v,m)=>{if(!v)throw Error(m);};
const input=JSON.parse(await fs.readFile(path.join(HERE,'asset-url-requirements.json')));
check(input.format==='actual-yard-source-url-requirements/v1'&&input.complete===true,'Final source URL requirements are absent or explicitly incomplete');
for(const scope of['off','on','fallback','portraits'])check(input.coverage?.[scope]==='complete','Incomplete source URL scope: '+scope);
check(Array.isArray(input.sourcePins)&&input.sourcePins.length>0,'Requirements lack source provenance');
for(const pin of input.sourcePins){check(typeof pin.path==='string'&&!pin.path.startsWith('/')&&!pin.path.split('/').includes('..'),'Invalid source pin');const b=await fs.readFile(path.join(REPO,pin.path));check(b.length===pin.bytes&&sha(b)===pin.sha256,'URL enumerator source pin changed: '+pin.path);}
const rows=[],seen=new Set(),physical=new Map();
for(const expected of input.urls){
 check(typeof expected.url==='string'&&expected.url.startsWith('/')&&!expected.url.startsWith('//'),'Exact same-origin URL required');
 const u=new URL(expected.url,'http://review.invalid');check(u.origin==='http://review.invalid'&&!u.hash&&u.pathname+u.search===expected.url,'Noncanonical URL is forbidden');check(!seen.has(expected.url),'Duplicate exact URL: '+expected.url);seen.add(expected.url);
 check(typeof expected.file==='string'&&!expected.file.startsWith('/')&&!expected.file.split('/').includes('..'),'Invalid emitted path');
 const file=path.join(DIST,expected.file),stat=await fs.lstat(file);check(stat.isFile()&&!stat.isSymbolicLink(),'Required URL lacks ordinary readable emitted file: '+expected.url);const b=await fs.readFile(file);
 if(expected.sha256)check(sha(b)===expected.sha256,'Descriptor byte identity mismatch: '+expected.url);if(expected.bytes!==undefined)check(b.length===expected.bytes,'Descriptor length mismatch: '+expected.url);
 const row={url:expected.url,file:expected.file,bytes:b.length,sha256:sha(b),consumers:expected.consumers??[]};rows.push(row);physical.set(row.file,{bytes:row.bytes,sha256:row.sha256});
}
for(const url of['/','/?optional=0','/?optional=1','/main.js','/main.css','/pip-prototype/yard-pip-scene.mjs'])check(seen.has(url),'Missing generated app entry: '+url);
// Independently verify emitted HTML/CSS/module-import/static-new-URL edges.
// Loader-generated manifest/atlas URLs still come from the pinned actual enumerator.
const html=await fs.readFile(path.join(DIST,'index.html'),'utf8'),mapText=html.match(/<script\s+type=["']importmap["']>([\s\S]*?)<\/script>/)?.[1],importMap=mapText?JSON.parse(mapText).imports||{}:{};
const edges=[];
function edge(from,specifier,kind){
 if(specifier.startsWith('data:'))return;
 let spec=specifier;if(kind==='module'&&!/^(?:[./]|https?:)/.test(spec)){spec=importMap[spec];check(typeof spec==='string','Unmapped emitted bare import: '+specifier);}
 const u=new URL(spec,'http://review.invalid'+from);check(u.origin==='http://review.invalid'&&!u.hash,'External/fragment asset edge forbidden: '+specifier);const target=u.pathname+u.search;if(kind==='static-new-URL'&&u.pathname.endsWith('/')&&!u.search){edges.push({from,to:target,kind:'URL-base-only',qualification:'Directory URL construction is not a fetch; actual child requests are enumerated by native adapters'});return;}check(seen.has(target),'Emitted reference omitted from exact closure: '+from+' -> '+target);edges.push({from,to:target,kind});
}
for(const row of rows){
 const ext=path.extname(row.file);if(!['.html','.css','.js','.mjs'].includes(ext))continue;const text=await fs.readFile(path.join(DIST,row.file),'utf8');
 if(ext==='.html'){for(const m of text.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)=["']([^"']+)["']/g))edge(row.url,m[1],'html');for(const value of Object.values(importMap))edge(row.url,value,'importmap');}
 if(ext==='.css')for(const m of text.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g))edge(row.url,m[1],'css');
 if(ext==='.js'||ext==='.mjs'){
  for(const m of text.matchAll(/(?:^|;)\s*(?:import|export)\s*(?:[^;]*?\bfrom\s*)?["']([^"']+)["']/g))edge(row.url,m[1],'module');
  for(const m of text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g))edge(row.url,m[1],'module');
  for(const m of text.matchAll(/new URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g))edge(row.url,m[1],'static-new-URL');
 }
}
rows.sort((a,b)=>a.url.localeCompare(b.url));
const result={format:'actual-yard-static-url-closure/v1',complete:true,coverage:input.coverage,sourcePins:input.sourcePins,requirementsSHA256:sha(await fs.readFile(path.join(HERE,'asset-url-requirements.json'))),emittedReferenceEdges:edges,urlCount:rows.length,uniqueFileCount:physical.size,encodedUniqueBytes:[...physical.values()].reduce((n,r)=>n+r.bytes,0),rows};
await fs.writeFile(path.join(HERE,'asset-url-closure.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({sealed:true,urlCount:result.urlCount,uniqueFileCount:result.uniqueFileCount,encodedUniqueBytes:result.encodedUniqueBytes}));
