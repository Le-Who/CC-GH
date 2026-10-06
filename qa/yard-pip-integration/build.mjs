/** Build only. No browser, hosting, network, dependency installation or publication. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {gzipSync,brotliCompressSync,constants as zlibConstants} from 'node:zlib';
const HERE=path.dirname(fileURLToPath(import.meta.url)),REPO=path.resolve(HERE,'../..');
const candidate=path.join(HERE,'candidate'),overlay=path.join(candidate,'vendor/r5'),baseline=path.join(REPO,'qa/yard-corrected-scene');
const dist=path.join(HERE,'dist'),prototype=path.join(overlay,'src/games/companion-yard-v2/pip-prototype');
const {build}=createRequire(path.join(REPO,'package.json'))('esbuild');
const exists=async p=>{try{return(await fs.stat(p)).isFile();}catch{return false;}};
const mkdirCopy=async(a,b)=>{try{await fs.mkdir(path.dirname(b),{recursive:true});await fs.cp(a,b,{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}};
await fs.rm(dist,{recursive:true,force:true});await fs.mkdir(dist,{recursive:true});
// Every source below is an already public base-tree asset or reviewed candidate.
for(const entry of await fs.readdir(path.join(REPO,'public/assets'),{withFileTypes:true}))if(entry.name.startsWith('yard-'))await mkdirCopy(path.join(REPO,'public/assets',entry.name),path.join(dist,'assets',entry.name));
for(const rel of ['games/companion-yard','games/hud-redesign/room'])await mkdirCopy(path.join(REPO,'public',rel),path.join(dist,rel));
await mkdirCopy(path.join(baseline,'public'),dist);
// Restore only the exact published native M2 media closure, including recovery roots.
const canonical=JSON.parse(await fs.readFile(path.join(HERE,'canonical-media-closure.json')));
for(const row of canonical.files){
 if(!row.path||!row.repositoryPath||row.path.startsWith('/')||row.repositoryPath.startsWith('/')||[row.path,row.repositoryPath].some(p=>p.split('/').includes('..')))throw Error('Unsafe canonical asset path');
 const bytes=await fs.readFile(path.join(REPO,row.repositoryPath));if(bytes.length!==row.bytes||createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error('Canonical source bytes differ: '+row.repositoryPath);
 const target=path.join(dist,row.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);
}
await mkdirCopy(path.join(overlay,'public'),dist);await mkdirCopy(path.join(candidate,'public'),dist);
for(const rel of ['assets','data','source','vendor'])await mkdirCopy(path.join(prototype,rel),path.join(dist,'pip-prototype',rel));
function resolver(){return{name:'actual-yard-sources',setup(api){api.onResolve({filter:/^(@repo\/|@baseline\/|\.{1,2}\/)/},async args=>{
 let resolved=args.path.startsWith('@repo/')?path.join(REPO,args.path.slice(6)):args.path.startsWith('@baseline/')?path.join(baseline,args.path.slice(10)):path.resolve(path.dirname(args.importer),args.path);
 const baselineOverlay=path.join(baseline,'vendor/r5');
 if(resolved.startsWith(baselineOverlay+path.sep))resolved=path.join(overlay,path.relative(baselineOverlay,resolved));
 if(resolved===path.join(prototype,'yard-pip-scene.mjs')&&args.kind==='dynamic-import')return{path:'/pip-prototype/yard-pip-scene.mjs',external:true};
 if(resolved.startsWith(path.join(prototype,'vendor')+path.sep))return{path:'/pip-prototype/'+path.relative(prototype,resolved).split(path.sep).join('/'),external:true};
 if(resolved.startsWith(overlay+path.sep))return{path:await exists(resolved)?resolved:path.join(REPO,path.relative(overlay,resolved))};
 if(resolved.startsWith(REPO+path.sep)&&!resolved.startsWith(HERE)&&!resolved.startsWith(baseline)){const replacement=path.join(overlay,path.relative(REPO,resolved));if(await exists(replacement))return{path:replacement};}
 if(args.path.startsWith('@repo/')||args.path.startsWith('@baseline/'))return{path:resolved};
 });}};}
const options={bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',metafile:true,logLevel:'info',external:['/assets/*','/games/*'],define:{'process.env.NODE_ENV':'"production"','import.meta.env':JSON.stringify({DEV:false,PROD:true,MODE:'production',BASE_URL:'/'})},plugins:[resolver()]};
const main=await build({...options,entryPoints:[path.join(HERE,'browser/main.jsx')],outfile:path.join(dist,'main.js')});
const lazy=await build({...options,entryPoints:[path.join(prototype,'yard-pip-scene.mjs')],outfile:path.join(dist,'pip-prototype/yard-pip-scene.mjs')});
const inputs=Object.keys(main.metafile.inputs);
if(!inputs.some(x=>x.endsWith('/companion-yard-v2/scene.mjs'))||!inputs.some(x=>x.endsWith('/companion-yard-v2/scene-owner.mjs'))||inputs.some(x=>x.endsWith('/browser/scene.mjs'))||inputs.some(x=>x.includes('/pip-prototype/')))throw Error('Actual Canvas2D source required; fixture alias or eager prototype forbidden');
await fs.writeFile(path.join(dist,'index.html'),'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Actual Yard optional Pip QA</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/main.css"><script type="importmap">{"imports":{"three":"/pip-prototype/vendor/three/build/three.module.js"}}</script></head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>\n');
const list=async(d,p='')=>{const a=[];for(const e of await fs.readdir(d,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('No symlinks');const q=path.posix.join(p,e.name);if(e.isDirectory())a.push(...await list(path.join(d,e.name),q));else if(e.isFile())a.push(q);}return a.sort();};
const files=[];for(const name of await list(dist)){const bytes=await fs.readFile(path.join(dist,name));files.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
const bundleTransfer=[];for(const name of ['main.js','main.css','pip-prototype/yard-pip-scene.mjs']){const bytes=await fs.readFile(path.join(dist,name));bundleTransfer.push({file:name,uncompressedBytes:bytes.length,gzipLevel9Bytes:gzipSync(bytes,{level:9}).length,brotliQuality5Bytes:brotliCompressSync(bytes,{params:{[zlibConstants.BROTLI_PARAM_QUALITY]:5}}).length});}
await fs.writeFile(path.join(HERE,'bundle-transfer-estimates.json'),JSON.stringify({minified:true,bundles:bundleTransfer,qualification:'Offline size estimates only. The current static QA server sends uncompressed bytes; no compressed network transfer is claimed.'},null,2));
await fs.writeFile(path.join(HERE,'built-files.json'),JSON.stringify({files,mainInputs:inputs,lazyInputs:Object.keys(lazy.metafile.inputs),bundleTransfer,sourceClaim:'Actual JSX and Canvas2D scene; isolated read-only state and HTTP transport only'},null,2));

// These inspect actual emitted bytes and exact native loader descriptors. No browser.
await import('./enumerate-runtime-urls.mjs');
await import('./seal-url-closure.mjs');
