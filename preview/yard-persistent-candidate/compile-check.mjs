/** Separate CI compile. Requires the repository's already-installed esbuild/deps.
 * No package install, browser launch, build-script call or production dist write. */
import {readFileSync} from 'node:fs';
import {relative,resolve,extname,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {requireCandidateMode} from './guard.mjs';
import {candidateRoot,repositoryRoot,overlayMap} from './source.mjs';
import {verifyProductionUntouched} from './verify-production.mjs';
requireCandidateMode();
verifyProductionUntouched();
let esbuild;
try {esbuild=await import('esbuild');}
catch(error) {throw new Error('Compile requires the normal CI-installed esbuild and project dependencies; this script never installs them',{cause:error});}
const result=await esbuild.build({
  absWorkingDir:repositoryRoot,
  entryPoints:[resolve(repositoryRoot,'src/games/companion-yard-v2/CourtyardGame.jsx')],
  bundle:true,platform:'browser',format:'esm',target:'es2022',write:false,
  outdir:resolve(candidateRoot,'compile-output-unused'),metafile:true,logLevel:'warning',
  plugins:[{name:'explicit-yard-candidate-overrides',setup(build){
    build.onLoad({filter:/\.(?:js|jsx|mjs|json)$/},args=>{
      const key=relative(repositoryRoot,args.path).split('\\').join('/');
      if(!Object.hasOwn(overlayMap,key))return;
      const extension=extname(args.path);
      return{contents:readFileSync(resolve(candidateRoot,overlayMap[key]),'utf8'),
        loader:extension==='.jsx'?'jsx':extension==='.json'?'json':'js',resolveDir:dirname(args.path)};
    });
  }}],
});
if(!result.outputFiles?.some(file=>file.path.endsWith('.js')))throw new Error('No compiled component output');
verifyProductionUntouched();
console.log(JSON.stringify({status:'candidate-compile-passed',write:false,productionDistWritten:false,
  inputCount:Object.keys(result.metafile.inputs).length,outputs:result.outputFiles.map(f=>({name:f.path.split('/').at(-1),bytes:f.contents.length,sha256:createHash('sha256').update(f.contents).digest('hex')}))},null,2));
