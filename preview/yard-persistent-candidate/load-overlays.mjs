import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {relative,resolve} from 'node:path';
import {requireCandidateMode} from './guard.mjs';
import {overlayMap,candidateRoot,repositoryRoot} from './source.mjs';
requireCandidateMode();
function mapped(url) {
  if(!url?.startsWith('file:'))return null;
  const key=relative(repositoryRoot,fileURLToPath(url)).split('\\').join('/');
  return Object.hasOwn(overlayMap,key)?resolve(candidateRoot,overlayMap[key]):null;
}
registerHooks({
  resolve(specifier,context,next) {
    // Resolve mapped fixture/test URLs before the default resolver, including
    // runtime-media.json and virtual tests that do not exist in production.
    let url=null;
    if(specifier.startsWith('file:'))url=specifier;
    else if(specifier.startsWith('/'))url=pathToFileURL(specifier).href;
    else if(specifier.startsWith('.'))url=new URL(specifier,context.parentURL).href;
    return url&&mapped(url)?{shortCircuit:true,url}:next(specifier,context);
  },
  load(url,context,next) {
    const source=mapped(url);
    return source?{shortCircuit:true,format:new URL(url).pathname.endsWith('.json')?'json':'module',source:readFileSync(source,'utf8')}:next(url,context);
  },
});
