import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),repo=path.resolve(process.env.YARD_PREVIEW_REPO_ROOT||path.join(root,'../..'));
const requireRepo=createRequire(path.join(repo,'package.json')),{build}=requireRepo('esbuild'),sharp=requireRepo('sharp');
const overlay=path.join(root,'vendor/r5'),dist=path.join(root,'dist');
const exists=async file=>{try{return(await fs.stat(file)).isFile();}catch{return false;}};
const allowlist=JSON.parse(await fs.readFile(path.join(root,'PUBLICATION-ALLOWLIST.json'),'utf8'));
const reused=JSON.parse(await fs.readFile(path.join(root,'REUSED-REPO-FILES.json'),'utf8'));
for(const row of reused.files){const bytes=await fs.readFile(path.join(repo,row.path));
 const blob=createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex');
 if(blob!==row.gitBlob)throw Error('Ordinary repository baseline differs: '+row.path);}
for(const row of allowlist.files){const file=path.resolve(root,row.path);if(!file.startsWith(root))throw Error('Escaping package');
 const bytes=await fs.readFile(file);if(bytes.length!==row.bytes||createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error('Package file changed: '+row.path);
 if(row.kind==='raster'){const m=await sharp(bytes).metadata();if(m.width!==row.canvas[0]||m.height!==row.canvas[1])throw Error('Raster dimensions differ');}}
await fs.mkdir(dist,{recursive:true});await fs.cp(path.join(root,'public'),dist,{recursive:true});
await build({entryPoints:[path.join(root,'browser/main.jsx')],bundle:true,outdir:dist,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',
 define:{'process.env.NODE_ENV':'"production"','import.meta.env':JSON.stringify({DEV:false,PROD:true,MODE:'production',BASE_URL:'/'})},logLevel:'info',external:['/assets/*','/games/*'],
 plugins:[{name:'exact-preview-overlay',setup(api){api.onResolve({filter:/^(@repo\/|\.{1,2}\/)/},async args=>{
  let resolved=args.path.startsWith('@repo/')?path.join(repo,args.path.slice(6)):path.resolve(path.dirname(args.importer),args.path);
  if(resolved.endsWith('/src/games/companion-yard-v2/scene.mjs'))return{path:path.join(root,'browser/scene.mjs')};
  if(resolved.startsWith(overlay+path.sep)){if(await exists(resolved))return{path:resolved};return{path:path.join(repo,path.relative(overlay,resolved))};}
  if(resolved.startsWith(repo+path.sep)&&!resolved.startsWith(root)){const replacement=path.join(overlay,path.relative(repo,resolved));if(await exists(replacement))return{path:replacement};}
  if(args.path.startsWith('@repo/'))return{path:resolved};
 });}}]});
await fs.writeFile(path.join(dist,'index.html'),'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Isolated Yard preview</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/main.css"></head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>\n');
console.log(JSON.stringify({built:true,scope:'real React/CSS read-only preview',deploy:false}));
