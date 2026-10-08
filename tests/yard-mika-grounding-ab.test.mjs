import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mikaGroundingComparison} from '../src/games/companion-yard-v2/mika-qa/mika-yard-layer.mjs';
test('comparison stays inactive without its separate build gate',()=>assert.equal(mikaGroundingComparison('?mikaGrounding=combined&mikaGroundingTime=2'),null));
test('finite variant and pose admission',()=>{for(const variant of ['baseline','warm','contact','combined'])for(const t of [.2,2,3.6]){const c=mikaGroundingComparison(`?mikaGrounding=${variant}&mikaGroundingTime=${t}`,true);assert.equal(c.sampleTime,t);assert.equal(c.warm,['warm','combined'].includes(variant));assert.equal(c.contact,['contact','combined'].includes(variant));}});
test('reject malformed or broader comparison scope',()=>{for(const search of ['', '?mikaGrounding=warm&mikaGroundingTime=1','?mikaGrounding=x&mikaGroundingTime=2','?mikaGrounding=warm&mikaGrounding=contact&mikaGroundingTime=2'])assert.throws(()=>mikaGroundingComparison(search,true),/INVALID_MIKA/);});
