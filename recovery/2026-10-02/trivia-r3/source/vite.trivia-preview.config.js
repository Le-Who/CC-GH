import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {createHash} from 'node:crypto';
import {existsSync,lstatSync,readFileSync,readdirSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {offlinePlugin} from './vite.offline.config.js';
import {extractTriviaCore} from './preview/trivia/server-core.mjs';
import sourcePin from './preview/trivia/server-core-pin.json' with {type:'json'};
import {TRIVIA_PREVIEW_VERSION} from './preview/trivia/version.js';
const repo=path.dirname(fileURLToPath(import.meta.url));const resolve=value=>path.join(repo,value);
export const TRIVIA_PREVIEW_KIND='cc-gh-trivia-local-offline-preview';
export const isAllowedTriviaAsset=value=>/^\/games\/trivia-v2\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.(?:png|webp|avif)$/i.test(value);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function readPublicAsset(url){if(typeof url!=='string'||!url.startsWith('/')||url.includes('..')||/[?#\\]/.test(url))throw new Error(`Unsafe preview asset URL: ${url}`);const f=resolve(`public${url}`),root=realpathSync(resolve('public')),actual=realpathSync(f);if(!actual.startsWith(`${root}${path.sep}`)||lstatSync(f).isSymbolicLink()||!lstatSync(f).isFile())throw new Error(`Unsafe asset: ${url}`);return readFileSync(actual);}
function triviaAssetUrls(){const urls=[];const walk=(dir,prefix)=>{for(const e of readdirSync(dir,{withFileTypes:true})){if(e.isSymbolicLink()||e.name.startsWith('.'))throw new Error('Unsafe Trivia art entry');const url=`${prefix}/${e.name}`;if(e.isDirectory())walk(path.join(dir,e.name),url);else if(isAllowedTriviaAsset(url))urls.push(url);else throw new Error(`Unexpected Trivia art: ${url}`);}};walk(resolve('public/games/trivia-v2'),'/games/trivia-v2');return urls.sort();}
function thirdPartyNotices(moduleIds) {
  const packages = new Map();
  const register = directory => {
    const manifestFile = path.join(directory, 'package.json');
    if (!existsSync(manifestFile)) return false;
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    if (!manifest.name) return false;
    packages.set(`${manifest.name}@${manifest.version}`, directory);
    return true;
  };
  register(resolve('node_modules/@fontsource/nunito'));
  for (const id of moduleIds) {
    if (!id.includes('/node_modules/')) continue;
    let directory = path.dirname(id.split('?')[0]);
    while (directory.startsWith(resolve('node_modules'))) {
      if (register(directory)) break;
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  const sections = ['THIRD-PARTY NOTICES\nTrivia local preview\n\nAvailable license/notice texts below are copied verbatim from installed dependency packages. When an installed package has no standalone text, its exact license/author/repository metadata is shown and clearly labeled; no missing grant text is invented.'];
  for (const [name, directory] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
    const licenses = readdirSync(directory).filter(file => /^(?:licen[cs]e|copying|notice|ofl)(?:\.|$)/i.test(file) && lstatSync(path.join(directory, file)).isFile());
    if (!licenses.length) {
      const metadata = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
      sections.push(`\n============================================================\n${name} — installed package.json metadata only\n============================================================\nNo standalone license/notice file is included in the installed package.\n${JSON.stringify({ name: metadata.name, version: metadata.version, license: metadata.license, author: metadata.author, repository: metadata.repository }, null, 2)}\n`);
    }
    for (const file of licenses.sort()) sections.push(`\n============================================================\n${name} — ${file}\n============================================================\n\n${readFileSync(path.join(directory, file), 'utf8')}`);
  }
  return Buffer.from(sections.join('\n'));
}

export function triviaPreviewPlugin(){return{name:'trivia-only-preview-audit-and-assets',resolveId(id){return id==='virtual:trivia-server-core'?'\0virtual:trivia-server-core':undefined;},load(id){if(id==='\0virtual:trivia-server-core')return extractTriviaCore(sourcePin,repo);},generateBundle(_options,bundle){
 const modules=[...this.getModuleIds()].filter(id=>!id.startsWith('\0'));
 const sharedMetadata=new Set([resolve('src/games/settlement/placementSlots.js'),resolve('src/games/match3/match3Art.js')]);
 const forbidden=modules.filter(id=>!sharedMetadata.has(id)&&(/\/src\/(?:App\.jsx|main\.jsx|app\/gameChunks\.jsx|game-runtime\/LazyPixiSceneHost\.jsx|games\/(?!trivia\/|shared\/))/.test(id)||/\/src\/game-runtime\/scenes\/(?:match3|blox|merge|farm)Scene\.js/.test(id)));
 if(forbidden.length)this.error(`Trivia preview imported another UI: ${forbidden.join('\n')}`);
 const inventory=[];const emit=(url,bytes)=>{this.emitFile({type:'asset',fileName:url.replace(/^\//,''),source:bytes});inventory.push({path:url,bytes:bytes.length,sha256:digest(bytes)});};
 for(const url of triviaAssetUrls())emit(url,readPublicAsset(url));
 emit('/THIRD-PARTY-NOTICES.txt',thirdPartyNotices(modules));
 const manifest=JSON.parse(readPublicAsset('/assets/manifest.json'));const sfx=Object.fromEntries(['tap','success','warning','error','merge','clear'].map(n=>[n,manifest.audio?.sfx?.[n]||'']));
 for(const url of new Set(Object.values(sfx).filter(Boolean))){if(!/^\/assets\/[^?#]*\.(?:mp3|ogg|wav|m4a)$/.test(url))this.error('Unexpected sound path');emit(url,readPublicAsset(url));}
 emit('/assets/manifest.json',Buffer.from(JSON.stringify({version:1,audio:{sfx,music:{}},notes:'Offline Trivia only; empty paths use existing synthesized tones.'})));
 emit('/assets-runtime/manifest.json',Buffer.from(JSON.stringify({version:1,assets:{},bundles:{}})));
 const sources=[...new Set([...modules, resolve('preview/shared/launcher.css'),resolve('preview/trivia/server-core.mjs'),resolve('preview/trivia/server-core-pin.json')])].filter(id=>id.startsWith(`${repo}/src/`)||id.startsWith(`${repo}/preview/`)).filter(id=>!id.includes('?')).sort().map(id=>({path:path.relative(repo,id),sha256:digest(readFileSync(id))}));
 this.emitFile({type:'asset',fileName:'trivia-preview.json',source:JSON.stringify({kind:TRIVIA_PREVIEW_KIND,previewVersion:TRIVIA_PREVIEW_VERSION,game:'trivia',productionCompatible:false,storage:'memory-only',network:'loopback-static-assets-only',pwa:false,browserQa:'NOT RUN: browser automation was blocked for this task; no alternative browser route was attempted. Static tests and art composites are not browser QA',modulesAudited:modules.length,entrypoints:['index.html','game.html'],assets:inventory,sources},null,2)});
 for(const item of Object.values(bundle))if(item.type==='asset'&&/^games\//.test(item.fileName)&&!isAllowedTriviaAsset(`/${item.fileName}`))this.error(`Unexpected copied art: ${item.fileName}`);
}};}
export default defineConfig({root:resolve('preview/trivia'),publicDir:false,envDir:false,envPrefix:[],define:{__OFFLINE_PREVIEW__:'true'},plugins:[react(),offlinePlugin(),triviaPreviewPlugin()],resolve:{alias:[
 {find:/^.*\/services\/apiClient\.js$/,replacement:resolve('preview/trivia/api.js')},
 {find:/^.*\/services\/realtimeClient\.js$/,replacement:resolve('preview/adapters/realtime.js')},
 {find:/^.*\/services\/updateManager\.js$/,replacement:resolve('preview/adapters/updates.js')},
 {find:/^.*\/platform\/(?:telegram|useTelegramGameNavigation)\.js$/,replacement:resolve('preview/adapters/platform.js')},
 {find:/^idb-keyval$/,replacement:resolve('preview/adapters/idb.js')},{find:'@',replacement:resolve('src')},{find:'/game-logic.js',replacement:resolve('game-logic.js')}
]},build:{outDir:resolve('dist-trivia-preview'),emptyOutDir:true,target:'es2022',assetsInlineLimit:0,rollupOptions:{input:{index:resolve('preview/trivia/index.html'),game:resolve('preview/trivia/game.html')}}},server:{host:'127.0.0.1',port:4185,strictPort:true,hmr:false}});
