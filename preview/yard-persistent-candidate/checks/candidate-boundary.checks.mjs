import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,realpathSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {requireCandidateMode} from '../guard.mjs';
import {repositoryRoot,candidateRoot,readCandidateSource,candidateSourcePath} from '../source.mjs';
import {verifyProductionUntouched} from '../verify-production.mjs';
requireCandidateMode();
test('historical hub checks use their frozen store while the mandatory native lane keeps rollback regressions',()=>{
  const store='src/game-state/useGameHub.js',checks='tests/hub-account-boundaries.test.mjs';
  const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
  const archived=resolve(candidateRoot,'history/pre-room-hud/production/'+checks);
  assert.equal(candidateSourcePath(resolve(repositoryRoot,checks)),archived);
  assert.equal(hash(archived),'6df2ec23c405261ef2a19ac695c8b323264dc68cdee1808c9844d265ea646532');
  assert.equal(hash(candidateSourcePath(resolve(repositoryRoot,store))),'683272aed5b543b13ed5eec6cf4b0fae8077ffc8b2f2fa0f42a754d24c0232e9');
  assert.equal(hash(resolve(repositoryRoot,checks)),'a4cabd983aa87794a7be14576e97e89fb03d92ec359f865f8f10868dd23c06d3');
  const scripts=JSON.parse(readFileSync(resolve(repositoryRoot,'package.json'),'utf8')).scripts;
  assert.ok(scripts.test.split(/\s+/).includes(checks),'current hub regressions remain mandatory in pnpm test');
  // A fresh process has only the existing dependency adapter, never candidate
  // overlays. Inspect the actual native module loader output, not a file alias.
  const probe=`import {registerHooks} from 'node:module';import {createHash} from 'node:crypto';
    const target=${JSON.stringify(pathToFileURL(realpathSync(resolve(repositoryRoot,store))).href)};
    registerHooks({load(url,context,next){const value=next(url,context);if(url===target)console.log(createHash('sha256').update(value.source).digest('hex'));return value;}});
    await import(target);`;
  const native=spawnSync(process.execPath,['--import',resolve(candidateRoot,'helpers/yard-shared-store-loader.mjs'),'--input-type=module','--eval',probe],{
    cwd:repositoryRoot,encoding:'utf8',timeout:30000,env:{...process.env,NODE_OPTIONS:''},
  });
  assert.equal(native.status,0,native.stderr);
  assert.equal(native.stdout.trim(),'8c7e360eb0d3ced6b6ab3e2a5ebdbc04cea52fc9798b2d1369a36c727569e590');
});
test('closed production wrapper keeps legacy defaults while explicit inspection sees the candidate override',async()=>{
  const verified=verifyProductionUntouched();
  assert.equal(verified.productionYard,'closed-rollout-legacy-default');
  assert.equal(verified.rolloutEnabled,false);assert.equal(verified.migratedYard,'read-only');
  assert.deepEqual(verified.releasedActors,['mika']);
  const path=resolve(repositoryRoot,'src/app/gameChunks.jsx');
  const original=readFileSync(path,'utf8'),candidate=await readCandidateSource(path);
  assert.match(original,/companion-yard-v2\/YardReleaseGame/);
  assert.match(candidate,/companion-yard-v2\/CourtyardGame/);assert.notEqual(candidate,original);
});
test('served canonical runtime metadata equals the explicitly mapped candidate fixture',async()=>{
  const path=resolve(repositoryRoot,'public/assets/yard-mika/runtime-media.json');
  assert.equal(existsSync(path),true,'canonical media must exist before candidate acceptance');
  const module=await import(pathToFileURL(path).href,{with:{type:'json'}});
  assert.deepEqual(module.default,JSON.parse(readFileSync(path,'utf8')));assert.equal(Object.keys(module.default.turns).length,12);assert.ok(module.default.clips['mika-cushion-r1']);
});
test('candidate loader and runner refuse activation without both explicit test flags',()=>{
  for(const script of ['load-overlays.mjs','run-checks.mjs','compile-check.mjs'])for(const mode of [false,true]){
    const env={...process.env};delete env.YARD_CANDIDATE_CI;delete env.NODE_ENV;
    if(mode){env.YARD_CANDIDATE_CI='1';env.NODE_ENV='production';}
    const result=spawnSync(process.execPath,[resolve(candidateRoot,script)],{env,encoding:'utf8'});
    assert.notEqual(result.status,0,script);assert.match(result.stderr,/YARD_CANDIDATE_CI=1 and NODE_ENV=test are required/);
  }
});
