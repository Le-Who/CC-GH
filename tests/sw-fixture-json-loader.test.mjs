import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extname,resolve,dirname} from 'node:path';
import vm from 'node:vm';
import {build} from 'esbuild';

test('actual SW fixture loader bundles JSON protocol imports without interpreting them as JS',async()=>{
 const source=readFileSync('tests/e2e/helpers/swFixture.mjs','utf8');
 const registration=source.match(/b\.onLoad\(\{filter:\/\.\*\/,namespace:'proof-fs'\},[\s\S]*?\);/)[0];
 let load;vm.runInNewContext(registration,{b:{onLoad(_options,callback){load=callback;}},readFileSync,extname});
 const output=await build({stdin:{contents:`import items from './game-logic/yard-v2/canonical-item-protocol.json' with {type:'json'};import food from './game-logic/yard-v2/canonical-food-contract.json' with {type:'json'};export default [items.location,food.id];`,resolveDir:process.cwd()},bundle:true,format:'cjs',platform:'node',write:false,logLevel:'silent',plugins:[{name:'exact-fixture-loader',setup(b){
  b.onResolve({filter:/\.json$/},args=>({path:resolve(args.importer?dirname(args.importer):process.cwd(),args.path),namespace:'proof-fs'}));
  b.onLoad({filter:/.*/,namespace:'proof-fs'},load);
 }}]});
 const module={exports:{}};vm.runInNewContext(output.outputFiles[0].text,{module,exports:module.exports});
 const expected=JSON.parse(readFileSync('game-logic/yard-v2/canonical-item-protocol.json','utf8'));
 assert.equal(JSON.stringify(module.exports.default[0]),JSON.stringify(expected.location));
 assert.equal(module.exports.default[1],JSON.parse(readFileSync('game-logic/yard-v2/canonical-food-contract.json','utf8')).id);
});
