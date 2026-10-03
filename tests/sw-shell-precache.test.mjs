import assert from 'node:assert/strict';
import {test} from 'node:test';
import {collectInitialShellFiles, createShellPrecache} from '../scripts/sw-shell-precache.mjs';

function fixture(){
  return {
    'assets/main.js':{type:'chunk',fileName:'assets/main.js',isEntry:true,imports:['assets/react.js'],dynamicImports:['assets/game.js'],viteMetadata:{importedCss:new Set(['assets/main.css']),importedAssets:new Set()}},
    'assets/react.js':{type:'chunk',fileName:'assets/react.js',imports:['assets/state.js'],viteMetadata:{importedCss:new Set(),importedAssets:new Set()}},
    'assets/state.js':{type:'chunk',fileName:'assets/state.js',imports:[]},
    'assets/game.js':{type:'chunk',fileName:'assets/game.js',imports:['assets/pixi.js'],viteMetadata:{importedCss:new Set(['assets/game.css'])}},
    'assets/pixi.js':{type:'chunk',fileName:'assets/pixi.js',imports:[]},
    'assets/main.css':{type:'asset',fileName:'assets/main.css',source:'@font-face{src:url("./font.woff2")} .icon{background:url(/assets/shell.webp)} .remote{background:url(data:image/png;base64,AAA)}'},
    'assets/game.css':{type:'asset',fileName:'assets/game.css',source:'@font-face{src:url("./game-font.woff2")}'},
    'assets/font.woff2':{type:'asset',fileName:'assets/font.woff2',source:new Uint8Array([1])},
    'assets/game-font.woff2':{type:'asset',fileName:'assets/game-font.woff2',source:new Uint8Array([2])},
    'assets/shell.webp':{type:'asset',fileName:'assets/shell.webp',source:new Uint8Array([3])},
  };
}
test('precache follows static shell imports and CSS resources, excluding dynamic game dependencies',()=>{
  assert.deepEqual([...collectInitialShellFiles(fixture())].sort(),['assets/font.woff2','assets/main.css','assets/main.js','assets/react.js','assets/shell.webp','assets/state.js']);
});
test('Workbox manifest transform preserves revisions and excludes unrelated public files',async()=>{
  const {plugin,manifestTransform}=createShellPrecache();
  plugin.generateBundle({},fixture());
  const rows=['assets/main.js','assets/font.woff2','assets/game.js','assets/pixi.js','assets/game-font.woff2','old-public.js','manifest.webmanifest'].map(url=>({url,revision:'revision-'+url}));
  const result=await manifestTransform(rows);
  assert.deepEqual(result.manifest,rows.filter(row=>['assets/main.js','assets/font.woff2','manifest.webmanifest'].includes(row.url)));
  assert.deepEqual(result.warnings,[]);
});
test('a missing shell entry fails the build instead of falling back to eager precache',async()=>{
  const {manifestTransform}=createShellPrecache();
  await assert.rejects(()=>manifestTransform([{url:'assets/game.js',revision:'x'}]),/initial shell/i);
});
