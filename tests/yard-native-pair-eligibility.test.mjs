import './yard-inventory-only-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pairSeedSearch} from './helpers/yard-native-pair.mjs';
import {createEightAcceptanceOptions} from './fixtures/yard-eight-canonical/acceptance.mjs';
const input=JSON.parse(readFileSync(new URL('../recovery-tools/yard-canonical-eight-qa/pair-search-v4.json',import.meta.url)));
const options=createEightAcceptanceOptions();
function spec(first,second){const row=input.rows.find(r=>r.pair.join('/')===`${first}/${second}`);return{yard:structuredClone(row.yard),first,second,firstSlot:'a-target',secondSlot:'b-target'};}
test('source-ready first actor with no native socket fails before seed search',()=>{
 assert.throws(()=>pairSeedSearch(spec('mochi','basil'),options,{limit:0}),/Native pair activity unavailable: first mochi\/sniff \(available: chase\)/);
});
test('source-ready second actor with no native socket fails before seed search',()=>{
 assert.throws(()=>pairSeedSearch(spec('pip','basil'),options,{limit:0}),/Native pair activity unavailable: second basil\/watch-right \(available: soak-left\)/);
});
test('legal activities retain the explicit finite-seed-search failure',()=>{
 assert.throws(()=>pairSeedSearch(spec('mochi','pip'),options,{limit:0}),/No native pair seed in documented 0-seed search: mochi\/pip/);
});
