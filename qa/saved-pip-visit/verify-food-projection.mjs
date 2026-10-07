import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {here,resolveSource} from './config.mjs';
const {selectCanonicalFoodState}=await import(pathToFileURL(resolveSource('game-logic/yard-v2/canonical-food-contract.mjs')));
const {snapshot}=JSON.parse(fs.readFileSync(path.join(here,'qualified-inputs.json'))),cases=[];
function check(name,mutate,expected){const value=structuredClone(snapshot);mutate(value);const result=selectCanonicalFoodState(value);assert.equal(result.available,expected,name);cases.push({name,result,passed:true});}
check('genuine v3 projection preserves uses:1 and kibble',()=>{},true);
check('unversioned used target remains rejected',s=>{delete s.yardRuntime.storageVersion;delete s.yardRuntime.canonicalVisitProtocol;},false);
check('v2 used target remains rejected',s=>{s.yardRuntime.storageVersion=2;delete s.yardRuntime.canonicalVisitProtocol;},false);
check('wrong v3 presentation protocol remains rejected',s=>{s.yardRuntime.canonicalVisitProtocol='unrecognized';},false);
check('future storage version remains rejected',s=>{s.yardRuntime.storageVersion=4;},false);
check('exhausted uses:8 remains rejected',s=>{s.yardRuntime.canonicalPlacements[0].uses=8;},false);
check('legacy v2 unused target remains accepted',s=>{s.yardRuntime.storageVersion=2;delete s.yardRuntime.canonicalVisitProtocol;s.yardRuntime.canonicalPlacements[0].uses=0;},true);
fs.writeFileSync(path.join(here,'food-projection-checks.json'),JSON.stringify({passed:true,cases},null,2)+'\n');console.log(JSON.stringify({passed:true,cases:cases.length}));
