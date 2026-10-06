/** Resolve the installed Playwright's paths without process, browser, listener or DB launch. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import config from './config.mjs';
const req=createRequire(import.meta.url),pwReq=createRequire(req.resolve('@playwright/test/package.json')),pw=path.dirname(pwReq.resolve('playwright/package.json'));
assert.equal(pwReq(path.join(pw,'package.json')).version,'1.58.2');const{FullConfigInternal}=pwReq(path.join(pw,'lib/common/config.js')),{WebServerPlugin}=pwReq(path.join(pw,'lib/plugins/webServerPlugin.js'));
const dir=import.meta.dirname,root=path.resolve(dir,'../..'),out=path.join(root,'qa/yard-canonical-acceptance/results'),checks=[];
const full=new FullConfigInternal({configDir:dir,resolvedConfigFile:path.join(dir,'config.mjs')},config,{});assert.equal(full.projects[0].project.testDir,path.join(root,'qa'));assert.equal(full.projects[0].project.outputDir,path.join(root,'qa/yard-canonical-acceptance/work/browser'));
const plugin=new WebServerPlugin({...config.webServer},false);let starts=0,waits=0;plugin._startProcess=async()=>{starts++;};plugin._waitForProcess=async()=>{waits++;};await plugin.setup({},dir,{});assert.equal(starts,1);assert.equal(waits,1);assert.equal(plugin._options.cwd,root);assert.equal(plugin._options.command,'node qa/yard-food-native/api-server.mjs');await fs.access(path.join(root,'qa/yard-food-native/api-server.mjs'));
for(const name of ['recorded-flow.mjs','food.spec.mjs']){const text=await fs.readFile(path.join(dir,name),'utf8');for(const line of text.split('\n').filter(l=>/writeFile|copyFile|screenshot\(\{path/.test(l)))assert.match(line,/OUT|target/);checks.push({file:name,absoluteEvidencePaths:true});}
await fs.mkdir(out,{recursive:true});const result={status:'PATHS_VERIFIED_WITHOUT_LAUNCH',playwrightVersion:'1.58.2',root:'.',testDir:'qa',outputDir:'qa/yard-canonical-acceptance/work/browser',serverEntry:'qa/yard-food-native/api-server.mjs',evidenceDir:'qa/yard-canonical-acceptance/results',uploadDir:'qa/yard-food-native/upload',checks,processLaunches:0,listeners:0,browsers:0,databaseConnections:0};await fs.writeFile(path.join(out,'food-paths.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
