import {roots,resolveSource,pip} from './config.mjs';
import {pathToFileURL,fileURLToPath} from 'node:url';
export async function resolve(specifier,context,next){
 if(specifier==='three')return {url:pathToFileURL(resolveSource(pip+'vendor/three/build/three.module.js')).href,shortCircuit:true};
 const root=roots.find(r=>context.parentURL?.startsWith(pathToFileURL(r+'/').href));
 if(root&&specifier.startsWith('.')){
  const target=fileURLToPath(new URL(specifier,context.parentURL));
  return next(pathToFileURL(resolveSource(target.slice(root.length+1))).href,context);
 }
 return next(specifier,context);
}
