import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {requireCandidateMode} from '../guard.mjs';
import {repositoryRoot,candidateRoot,readCandidateSource} from '../source.mjs';
import {verifyProductionUntouched} from '../verify-production.mjs';
requireCandidateMode();
test('production files keep legacy Yard while explicit static inspection sees the candidate override',async()=>{
  assert.equal(verifyProductionUntouched().productionYard,'legacy-active');
  const path=resolve(repositoryRoot,'src/app/gameChunks.jsx');
  const original=readFileSync(path,'utf8'),candidate=await readCandidateSource(path);
  assert.match(original,/companion-yard\/CompanionYardGame/);assert.doesNotMatch(original,/companion-yard-v2/);
  assert.match(candidate,/companion-yard-v2\/CourtyardGame/);assert.notEqual(candidate,original);
});
test('missing runtime metadata resolves through the explicit fixture before normal filesystem resolution',async()=>{
  const path=resolve(repositoryRoot,'public/assets/yard-mika/runtime-media.json');
  assert.equal(existsSync(path),false,'source-only subset must not publish image/runtime assets');
  const module=await import(pathToFileURL(path).href,{with:{type:'json'}});
  assert.equal(Object.keys(module.default.turns).length,12);assert.ok(module.default.clips['mika-cushion-r1']);
});
test('candidate loader and runner refuse activation without both explicit test flags',()=>{
  for(const script of ['load-overlays.mjs','run-checks.mjs','compile-check.mjs'])for(const mode of [false,true]){
    const env={...process.env};delete env.YARD_CANDIDATE_CI;delete env.NODE_ENV;
    if(mode){env.YARD_CANDIDATE_CI='1';env.NODE_ENV='production';}
    const result=spawnSync(process.execPath,[resolve(candidateRoot,script)],{env,encoding:'utf8'});
    assert.notEqual(result.status,0,script);assert.match(result.stderr,/YARD_CANDIDATE_CI=1 and NODE_ENV=test are required/);
  }
});
