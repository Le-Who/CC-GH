import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {requireCandidateMode} from './guard.mjs';
import {verifyProductionUntouched} from './verify-production.mjs';
requireCandidateMode();
const root=fileURLToPath(new URL('../../',import.meta.url));
const candidate=fileURLToPath(new URL('./',import.meta.url));
console.log(JSON.stringify(verifyProductionUntouched()));
const checks=readdirSync(resolve(candidate,'checks')).filter(name=>name.endsWith('.checks.mjs')).sort().map(name=>resolve(candidate,'checks',name));
const result=spawnSync(process.execPath,[
  '--import',resolve(candidate,'load-overlays.mjs'),
  '--import',resolve(root,'tests/yard-inventory-only-loader.mjs'),
  '--import',resolve(candidate,'helpers/yard-shared-store-loader.mjs'),
  '--test',...checks,
],{cwd:root,env:process.env,stdio:'inherit'});
if(result.error)throw result.error;
verifyProductionUntouched();
process.exitCode=result.status??1;
