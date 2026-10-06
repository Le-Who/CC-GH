/** Import installed APIs and resolve paths only. Never launch/listen/connect. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {ciPaths,auditPushTriggers,WORKFLOW,installedPaths} from './ci-contract.mjs';
export async function auditPaths(root,packet,runnerTemp){
  const p=ciPaths(root,runnerTemp),require=createRequire(path.join(root,'package.json'));
  const projectRequire=createRequire(require.resolve('@playwright/test/package.json')),pw=projectRequire('playwright');
  const version=projectRequire('playwright/package.json').version;assert.equal(version,'1.58.2');
  const executable=pw.chromium.executablePath();assert(path.isAbsolute(executable));
  const workflow=await fs.readFile(path.join(packet,'workflow/yard-pip-quality-ab.yml'),'utf8');
  const audit=await auditPushTriggers(root,workflow);
  const build=await fs.readFile(path.join(packet,'qa/build.mjs'),'utf8'),run=await fs.readFile(path.join(packet,'qa/run.mjs'),'utf8'),finalize=await fs.readFile(path.join(packet,'qa/evidence.mjs'),'utf8');
  assert.match(build,/await fs\.mkdir\(work\)/);assert.match(build,/outDir:path\.join\(work,'dist'\)/);assert.match(run,/out=path\.join\(work,'evidence'\);await fs\.mkdir\(out\)/);
  assert.match(finalize,/qa\/yard-canonical-acceptance\/package-evidence.mjs/);assert.match(finalize,/rawDir:combined/);
  assert.match(workflow,/timeout-minutes: 10/);assert.match(workflow,/retention-days: 3/);assert.match(workflow,/compression-level: 0/);assert.match(workflow,/path: qa\/yard-pip-quality-native-packet\/upload\//);
  for(const name of['ci-build.mjs','ci-native.mjs','evidence.mjs','preflight.mjs','validate-source.mjs'])await fs.access(path.join(packet,'qa',name));
  return{status:'PATHS_VERIFIED_WITHOUT_LAUNCH',playwrightVersion:version,executablePath:executable,executableCheckedByLaunching:false,paths:p,workflow:WORKFLOW,triggerAudit:audit,processLaunches:0,listeners:0,browsers:0,databaseConnections:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const p=installedPaths();console.log(JSON.stringify(await auditPaths(p.root,p.packet,process.env.RUNNER_TEMP),null,2));}
