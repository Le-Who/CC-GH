/** Exhaustive file inventory, graph and declared Yard URL closure; no browser. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {runtimeUrls} from './runtime-urls.mjs';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export async function inventory(root,prefix='') {
 const rows=[];
 for(const e of await fs.readdir(path.join(root,prefix),{withFileTypes:true})){
  assert(!e.isSymbolicLink(),'Symlink forbidden: '+e.name);const rel=path.posix.join(prefix,e.name);
  if(e.isDirectory())rows.push(...await inventory(root,rel));else if(e.isFile()){const b=await fs.readFile(path.join(root,rel));rows.push({path:rel,bytes:b.length,sha256:sha(b)});}
 }
 return rows.sort((a,b)=>a.path.localeCompare(b.path));
}
export async function closeBuild(root,dist,mode,{prune=false}={}) {
 root=path.resolve(root);dist=path.resolve(dist);
 const load=p=>import(pathToFileURL(path.join(root,p)));
 const {catalogPreview,YARD_UI_ART}=await load('src/games/companion-yard-v2/catalog-ui.mjs');
 const catalog=await load('game-logic/yard-catalog.js');
 const ui=JSON.parse(await fs.readFile(path.join(root,'src/games/companion-yard-v2/ui-image-inventory.json')));
 const canonical=JSON.parse(await fs.readFile(path.join(root,'scripts/yard-public-media.json')));
 const graph=JSON.parse(await fs.readFile(path.join(dist,'game-loading-graph.json')));
 const rows=await inventory(dist),by=new Map(rows.map(r=>[r.path,r])),chunks=new Map(graph.chunks.map(c=>[c.file,c]));
 const modules=graph.chunks.flatMap(c=>c.modules);
 assert(modules.includes('src/games/companion-yard-v2/CourtyardGame.jsx'),'Actual root consumer missing');
 assert(!modules.some(p=>p.includes('/vendor/r5/')),'Parallel implementation entered build');
 if(mode!=='phone')assert(modules.includes('src/games/companion-yard-v2/YardReleaseGame.jsx'),'Normal release consumer missing');
 if(mode==='phone')assert(!modules.includes('src/games/companion-yard/CompanionYardGame.jsx'),'Unused old game entered phone preview');
 const native=await runtimeUrls(root,dist);
 const urls=new Set([...Object.values(YARD_UI_ART),...native.urls]);for(const row of ui.rows)urls.add(row.url);
 const calls=[];function keep(kind,id,options){const url=catalogPreview(kind,id,options);calls.push({kind,id,options,url});if(url)urls.add(url);}
 for(const id of ['empty_bowl',...Object.keys(catalog.YARD_FOODS)])keep('food',id);
 for(const id of Object.keys(catalog.YARD_GOODIES))for(const condition of ['new','worn','broken'])keep('goodie',id,{condition});
 for(const id of Object.keys(catalog.YARD_VISITORS))for(const pose of ['','nap','pounce','sit','roll','sniff','nibble','stretch','peek','curl','listen','rest','soak','watch','glow'])keep('visitor',id,{pose});
 for(const id of ['cat','dog','bunny','fox','hamster','turtle',...Object.keys(catalog.YARD_SPECIES)])keep('companion',id);
 for(const id of Object.keys(catalog.YARD_REMODELS))keep('remodel',id);
 for(const r of rows)if(/\.(css|html)$/.test(r.path)){
  const text=await fs.readFile(path.join(dist,r.path),'utf8');
  for(const match of text.matchAll(/(?:url\(\s*["']?|(?:src|href)=["'])(\/[^"'\s)>]+)["']?/g))urls.add(match[1]);
 }
 for(const c of graph.chunks){assert(by.has(c.file),'Missing emitted chunk');for(const dep of [...c.imports,...c.dynamicImports])assert(by.has(dep),'Missing import: '+dep);}
 for(const url of urls){assert(url?.startsWith('/')&&!url.startsWith('//'),'Unclosed nonlocal UI URL: '+url);assert(by.has(new URL(url,'http://closure.invalid').pathname.slice(1)),'Missing UI URL: '+url);}
 for(const r of canonical.files){const a=by.get(r.path);assert(a&&a.bytes===r.bytes&&a.sha256===r.sha256,'Frozen media changed: '+r.path);}
 const sources=['data/fixture.json','data/location.json','data/calibration.json','source/pip-rest-coat.glsl','assets/clean-garden.png','assets/pip.glb'];
 const optional=[];
 for(const source of sources){const bytes=await fs.readFile(path.join(root,'src/games/companion-yard-v2/pip-prototype',source)),hash=sha(bytes),found=rows.filter(r=>r.sha256===hash);assert.equal(found.length,mode==='default'?0:1,'Optional asset identity boundary: '+source);if(found.length)optional.push({...found[0],source});}
 const optionalChunks=graph.chunks.filter(c=>c.modules.some(m=>m.includes('/pip-prototype/'))).map(c=>c.file);
 assert.equal(optionalChunks.length>0,mode!=='default','Compile-time optional gate failed');
 const startup=new Set();function visit(file){if(startup.has(file))return;startup.add(file);for(const dep of chunks.get(file)?.imports||[])visit(dep);}
 for(const c of graph.chunks.filter(c=>c.isEntry))visit(c.file);
 assert(![...startup].some(f=>f.startsWith('assets/yard-data/')||optionalChunks.includes(f)),'Lazy Yard/optional source entered bootstrap');
 if(mode==='phone'){
  assert(!rows.some(r=>r.path==='sw.js'||r.path.endsWith('.webmanifest')||r.path.startsWith('workbox-')),'PWA forbidden in phone output');
  const active=new Set(),done=new Set();function acyclic(f){assert(!active.has(f),'Phone static initialization cycle: '+f);if(done.has(f))return;active.add(f);for(const dep of chunks.get(f)?.imports||[])acyclic(dep);active.delete(f);done.add(f);}for(const f of chunks.keys())acyclic(f);
 }
 const files=rows.filter(r=>!prune||!r.path.startsWith('games/')||urls.has('/'+r.path));
 const selected=new Set(files.map(r=>r.path));for(const url of urls)assert(selected.has(new URL(url,'http://closure.invalid').pathname.slice(1)));
 assert(!files.some(r=>r.path.endsWith('.map')),'Source maps forbidden');
 return {format:'yard-normal-native-build-closure/v1',complete:true,mode,dist,files,totalFiles:files.length,totalBytes:files.reduce((n,r)=>n+r.bytes,0),optional,optionalChunks,uiUrls:[...urls].sort(),catalogCalls:calls,nativeEnumeration:{actors:native.actors,clipObjects:native.clipObjects,pageReferences:native.pageReferences},canonicalFiles:canonical.files.length,canonicalBytes:canonical.totalBytes,startup:[...startup],removed:rows.filter(r=>!selected.has(r.path)),qualification:'Static source/byte/URL closure; browser requests and pixels still untested'};
}
if(process.argv[1]===import.meta.filename){const[root,dist,mode,out]=process.argv.slice(2);const result=await closeBuild(root,dist,mode,{prune:mode==='phone'});await fs.writeFile(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({mode,files:result.totalFiles,bytes:result.totalBytes,optional:result.optional.length,complete:result.complete}));}
