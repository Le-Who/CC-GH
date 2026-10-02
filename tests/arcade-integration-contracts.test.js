import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {loadAssetPipelineEntries} from '../scripts/assets-pipeline.config.mjs';
const {readLosslessWebpMetadata}=createRequire(import.meta.url)('../recovery-tools/verification/webp-metadata.cjs');
import assets from './fixtures/arcade-runtime-assets.json' with {type:'json'};
import {MATCH3_RETAINED_ASSET_KEYS} from '../src/games/match3/match3Art.js';
import {resolveAssetSourceList} from '../src/game-runtime/assetBundles.js';
const root=new URL('../',import.meta.url);
test('all 53 v2 runtime images match reviewed export hashes and preserve source provenance',()=>{
 assert.equal(assets.length,53);
 for(const asset of assets){const bytes=fs.readFileSync(new URL('public'+asset.path,root));assert.equal(bytes.length,asset.bytes,asset.path);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),asset.sha256,asset.path);assert.match(asset.path,/\.webp$/);if(asset.sourcePath){const metadata=readLosslessWebpMetadata(bytes);assert.equal(metadata.width,asset.width);assert.equal(metadata.height,asset.height);assert.match(asset.sourceSha256,/^[a-f0-9]{64}$/);assert.match(asset.rgbaSha256,/^[a-f0-9]{64}$/)}}
});
test('Match3 preloads retained effects using the same production manifest that the scene resolves',()=>{
 assert.equal(MATCH3_RETAINED_ASSET_KEYS.length,8);assert.ok(MATCH3_RETAINED_ASSET_KEYS.includes('match3.fx.clearBurst'));
 const manifest={assets:Object.fromEntries(MATCH3_RETAINED_ASSET_KEYS.map((key,i)=>[key,`/assets-runtime/puzzling-potions/verified-${i}.webp`]))};
 for(const key of MATCH3_RETAINED_ASSET_KEYS)assert.deepEqual(resolveAssetSourceList(key,manifest),[manifest.assets[key]]);
 const host=fs.readFileSync(new URL('src/game-runtime/PixiGameHost.jsx',root),'utf8');
 assert.match(host,/assetKeys\?\.length/);assert.match(host,/src: resolveAssetSourceList\(key, manifest\)/);
 assert.ok(host.indexOf('src: resolveAssetSourceList(key, manifest)')<host.indexOf('sceneRef.current = buildScene'));
 const presentation=fs.readFileSync(new URL('src/games/match3/Match3Presentation.jsx',root),'utf8');
 assert.match(presentation,/assetKeys:MATCH3_RETAINED_ASSET_KEYS/);
 const scene=fs.readFileSync(new URL('src/game-runtime/scenes/match3Scene.js',root),'utf8');
 assert.match(scene,/gameAsset\(MATCH3_ASSET_KEYS\.fxClearBurst\)/);
});
test('v2 host disposes scene objects while preserving shared Assets textures across remounts',()=>{
 const source=fs.readFileSync(new URL('src/game-runtime/PixiGameHost.jsx',root),'utf8');
 const body=source.slice(source.indexOf('function destroyPixiApp'),source.indexOf('\nfunction readPublishedAssetLayouts'));
 const dispose=vm.runInNewContext(body+';destroyPixiApp',{console});const calls=[];
 dispose({destroy:(view,children)=>calls.push({view,children})},true);dispose({destroy:(view,children)=>calls.push({view,children})},false);
 assert.equal(calls[0].children.children,true);assert.equal(calls[0].children.texture,false);assert.equal(calls[0].children.textureSource,false);
 assert.equal(calls[1].children.texture,true);assert.equal(calls[1].children.textureSource,true);
 assert.equal((source.match(/destroyPixiApp\(app, isolated\)/g)||[]).length,3);
});

test('direct arcade WebP exports stay outside lossy asset-pipeline re-encoding and have no runtime PNG siblings',async()=>{
 const entries=await loadAssetPipelineEntries(new URL('../',import.meta.url).pathname);
 assert.equal(entries.some(entry=>/^public\/games\/(?:blox-v2|match3-v2)\//.test(entry.source)),false);
 for(const asset of assets.filter(asset=>asset.sourcePath)){
  assert.equal(fs.existsSync(new URL('public'+asset.sourcePath,root)),false,asset.sourcePath+' must remain only in the source checkpoint');
 }
});
