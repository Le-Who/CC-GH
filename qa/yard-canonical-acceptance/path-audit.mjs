/** Resolve actual installed Playwright paths without launching a process,
 * checking a port, starting a browser/listener, or importing the API app. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import config from './config.mjs';
import {OUT,WORK} from './browser-helpers.mjs';
import {assertCanonicalPgEnvironment} from '../../tests/helpers/yard-canonical-pg-guard.mjs';
assertCanonicalPgEnvironment();
const projectRequire=createRequire(import.meta.url);
// Resolve through the pinned @playwright/test dependency, not an ambient
// executor-wide Playwright package that may have a different version.
const require=createRequire(projectRequire.resolve('@playwright/test/package.json')),pw=path.dirname(require.resolve('playwright/package.json'));
assert.equal(require(path.join(pw,'package.json')).version,'1.58.2','Review path semantics when Playwright changes');
const {FullConfigInternal}=require(path.join(pw,'lib/common/config.js'));
const {WebServerPlugin}=require(path.join(pw,'lib/plugins/webServerPlugin.js'));
const configDir=import.meta.dirname,root=path.resolve(configDir,'../..'),location={configDir,resolvedConfigFile:path.join(configDir,'config.mjs')};
const expectedOutput=path.join(configDir,'work/browser'),expectedEntry=path.join(root,'tests/helpers/yard-canonical-api-server.mjs');
assert.equal(config.webServer.command,'node tests/helpers/yard-canonical-api-server.mjs');
const checks=[],initialCwd=process.cwd();
async function resolveOnly(options){
 const plugin=new WebServerPlugin({...options},false);let starts=0,waits=0;
 // The installed setup method still resolves cwd. Neither overridden method
 // invokes launchProcess, the availability callback, fetch, sockets or timers.
 plugin._startProcess=async()=>{starts++;};plugin._waitForProcess=async()=>{waits++;};
 await plugin.setup({},configDir,{});assert.equal(starts,1);assert.equal(waits,1);
 return{cwd:plugin._options.cwd,entry:path.resolve(plugin._options.cwd,'tests/helpers/yard-canonical-api-server.mjs')};
}
try{
 for(const cwd of[root,configDir]){
  process.chdir(cwd);
  const full=new FullConfigInternal(location,config,{}),server=await resolveOnly(config.webServer);
  assert.equal(full.projects.length,1);assert.equal(full.projects[0].project.testDir,configDir);
  assert.equal(full.projects[0].project.outputDir,expectedOutput);assert.equal(server.cwd,root);assert.equal(server.entry,expectedEntry);await fs.access(server.entry);
  assert.equal(OUT,path.join(configDir,'results'));assert.equal(WORK,path.join(configDir,'work'));
  const buggy={...config,outputDir:'qa/yard-canonical-acceptance/work/browser'};
  const oldFull=new FullConfigInternal(location,buggy,{}),oldServer=await resolveOnly({...config.webServer,cwd:undefined});
  assert.equal(oldServer.cwd,configDir);assert.notEqual(oldServer.entry,expectedEntry);
  assert.equal(oldFull.projects[0].project.outputDir,path.join(configDir,'qa/yard-canonical-acceptance/work/browser'));
  checks.push({invocationDirectory:path.relative(root,cwd)||'.',serverCwd:path.relative(root,server.cwd)||'.',serverEntry:path.relative(root,server.entry),testDir:path.relative(root,full.projects[0].project.testDir),outputDir:path.relative(root,full.projects[0].project.outputDir),originalBugReproducedWithoutLaunch:true});
 }
}finally{process.chdir(initialCwd);}
const read=name=>fs.readFile(path.join(configDir,name),'utf8');
const [build,browser,helpers,evidence,preflight,seal,workflow,api,loader]=await Promise.all([
 read('build.mjs'),read('acquisition.spec.mjs'),read('browser-helpers.mjs'),read('evidence.mjs'),read('preflight.mjs'),read('seal.mjs'),
 fs.readFile(path.join(root,'.github/workflows/yard-canonical-dynamic.yml'),'utf8'),fs.readFile(expectedEntry,'utf8'),fs.readFile(path.join(root,'tests/helpers/yard-canonical-pg-loader.mjs'),'utf8'),
]);
// Audit the remaining actual path owners. Do not import build/evidence/preflight:
// those executable modules intentionally perform work when run.
assert.match(build,/root=path\.resolve\(import\.meta\.dirname,'\.\.\/\.\.'\),out=path\.join\(import\.meta\.dirname,'results'\),work=path\.join\(import\.meta\.dirname,'work'\)/);
assert.match(build,/execFileSync\('pnpm',\['run','build'\],\{cwd:root/);
assert.match(build,/execFileSync\('node',\['scripts\/yard-pip-build-closure\.mjs','dist',[\s\S]*?\{cwd:root/);
assert.match(build,/const dist=path\.join\(root,'dist'\)/);
assert.equal(config.testMatch,'acquisition.spec.mjs');
assert.doesNotMatch(browser,/recordVideo|execFileSync\('ffprobe'/);
assert.match(browser,/path\.join\(OUT,'browser.json'\)/);
assert.match(helpers,/toFile\(path\.join\(OUT,file\)\)/);
assert.match(evidence,/out=path\.join\(import\.meta\.dirname,'results'\)/);
assert.match(preflight,/assert\.equal\(process\.cwd\(\),root\)/);
assert.match(seal,/git',\['diff','--name-only',base\]/);
assert.match(api,/new URL\('\.\.\/\.\.\/dist\/index\.html',import\.meta\.url\)/);
assert.match(loader,/resolve\(process\.cwd\(\)\)!==resolve\(fileURLToPath\(root\)\)/);
assert.match(workflow,/working-directory: \$\{\{ github\.workspace \}\}/);
assert.match(workflow,/path: qa\/yard-canonical-acceptance\/results\//);
for(const line of browser.split('\n').filter(line=>/writeFile|copyFile|screenshot\(\{path/.test(line)))assert.match(line,/OUT|target/,'Browser file output must use an absolute evidence target');
assert.equal(fileURLToPath(new URL('../../dist/index.html',new URL('file://'+expectedEntry))),path.join(root,'dist/index.html'));
console.log(JSON.stringify({status:'PATHS_VERIFIED_WITHOUT_LAUNCH',playwrightVersion:'1.58.2',checks,
 evidenceDirectory:path.relative(root,OUT),nativeRecording:'not repeated; prior raw clips referenced by hash',buildOutput:'dist',artifactUpload:'qa/yard-canonical-acceptance/results/',
 coverage:['actual Playwright config and webServer cwd resolver','test discovery/output','selected acquisition spec, browser images and combined report','build subprocess cwd and dist','API entry, loader root and dist','preflight/seal/TAP/upload repository cwd'],
 processLaunches:0,listeners:0,browsers:0,databaseConnections:0,sourceGuards:'unchanged'},null,2));
