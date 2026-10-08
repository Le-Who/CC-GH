import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const base='1a66a9df3d177d1b8308bab223ad6f647a76f98a';
const manifest=JSON.parse(fs.readFileSync('qa/mika-normal-yard/manifest.json','utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const mode=process.argv[2]||'source';
assert.equal(manifest.base,base);assert.equal(manifest.activation,false);
if(mode==='source'){
 const changed=execFileSync('git',['diff','--name-only',base,'HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).sort();
 assert.deepEqual(changed,[...manifest.files.map(f=>f.path),...manifest.qaPaths].sort(),'Closed source and QA delta');
 for(const f of manifest.files){const bytes=fs.readFileSync(f.path);assert.equal(hash(bytes),f.sha256,f.path);assert.equal(bytes.length,f.bytes,f.path);}
 for(const f of manifest.files.filter(f=>/\.(mjs|js)$/.test(f.path))){
  const source=fs.readFileSync(f.path,'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*\(\s*|new URL\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g))assert(fs.existsSync(path.resolve(path.dirname(f.path),match[1])),`Missing relative input ${f.path}: ${match[1]}`);
 }
 execFileSync('git',['diff','--exit-code',base,'HEAD','--','package.json','pnpm-lock.yaml','Dockerfile','game-logic','routes','playerManager.js','src/game-state','src/games/garden-shelf'],{stdio:'pipe'});
 console.log(JSON.stringify({base,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),changed,scope:manifest.scope,publicAssetAlwaysCopiedBytes:3671320,activation:false},null,2));
}else{
 assert(['off','on'].includes(mode));
 const graph=JSON.parse(fs.readFileSync('dist/game-loading-graph.json','utf8'));
 const chunks=graph.chunks.filter(c=>c.modules.some(m=>m.includes('/mika-qa/')));
 assert.equal(chunks.length>0,mode==='on','Build flag must remove or include the QA actor graph');
 const asset=fs.readFileSync('dist/assets/yard-mika-p2-qa/p2.glb');
 assert.equal(asset.length,3671320);assert.equal(hash(asset),'2249774f8ced124451d3c46a8a69bc06a9889c7d9cc31c836a6dd868fd96f084');
 console.log(JSON.stringify({mode,qaChunks:chunks.map(c=>c.file),assetBytes:asset.length,assetSha256:hash(asset),defaultOffPreventsRuntimeLoadOnly:true,shippingResourceAcceptance:false},null,2));
}
