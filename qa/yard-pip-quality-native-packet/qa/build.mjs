// Compile one private real-app build. Does not serve, launch, install or publish.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createOverlay,sha} from './overlay.mjs';
const packet=path.resolve(import.meta.dirname,'..'),[rootArg,workArg]=process.argv.slice(2);
assert(rootArg&&workArg,'Usage: node qa/build.mjs SOURCE_ROOT NEW_WORK_DIR');
const root=path.resolve(rootArg),work=path.resolve(workArg);
assert(!work.startsWith(root+path.sep),'Private build output must be outside the integration source');
await fs.mkdir(work); // Exclusive creation: existing compiled/evidence files cannot be overwritten.
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:15000}).trim();
const paths=git(['ls-files','--','src','game-logic','scripts','vite.config.js','vite.config.mjs','index.html','package.json','pnpm-lock.yaml']).split('\n').filter(Boolean);
async function sources(){return Promise.all(paths.map(async p=>({path:p,sha256:sha(await fs.readFile(path.join(root,p)))})));}
const before=await sources(),head=git(['rev-parse','HEAD']),overlay=await createOverlay(root,packet);
process.chdir(root);process.env.NODE_ENV='production';process.env.VITE_YARD_PIP_PREVIEW='true';process.env.VITE_BUILD_ID=head;
const {build}=await import(pathToFileURL(path.join(root,'node_modules/vite/dist/node/index.js')));
const config=['vite.config.js','vite.config.mjs'].find(p=>paths.includes(p));assert(config);
await build({root,configFile:path.join(root,config),plugins:[overlay.plugin],build:{outDir:path.join(work,'dist'),emptyOutDir:false}});
assert.deepEqual(await sources(),before,'Source changed during private build');
for(const required of ['src/games/companion-yard-v2/scene-entry.mjs','src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs','src/games/companion-yard-v2/pip-prototype/prototype/optional-pip-renderer.mjs','qa/yard-pip-quality-native/browser-entry.mjs'])assert(overlay.loaded.has(required),'Overlay not compiled: '+required);
const {closeBuild}=await import(pathToFileURL(path.join(root,'qa/yard-normal-preview/closure.mjs')));
const closure=await closeBuild(root,path.join(work,'dist'),'preview');
await fs.writeFile(path.join(work,'closure.json'),JSON.stringify(closure)+'\n',{flag:'wx'});
await fs.writeFile(path.join(work,'source.json'),JSON.stringify({head,baseSources:before,overlaySources:overlay.inventory,compiledOverlay:[...overlay.loaded],privateOnly:true,defaultMode:'off',productionWiringModified:false})+'\n',{flag:'wx'});
console.log(JSON.stringify({work,head,files:closure.totalFiles,bytes:closure.totalBytes,browser:'NOT_RUN',published:false}));
