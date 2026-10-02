/** Runs real saved-player/routes with explicit test-only infrastructure substitutes.
 * No external DB/Redis/socket/package/server is started. This is NOT persistence proof.
 * The on-disk release policy remains disabled; this loader enables it only in the test process.
 */
import {registerHooks} from 'node:module';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const stage=path.resolve(import.meta.dirname,'..');
const baseline=process.env.MERGE_LAB_BASELINE||(fs.existsSync(path.join(stage,'db.js'))?stage:'/workspace/shared/cc-gh-release-full-baseline');
const yard=process.env.MERGE_LAB_YARD_OVERLAY||(fs.existsSync(path.join(stage,'game-logic/yard.js'))?path.join(stage,'game-logic/yard.js'):'/workspace/shared/yard-inventory-preservation-release-r1/game-logic/yard.js');
process.env.NODE_ENV='test';
const code={
 express:`export function Router(){const router={stack:[]};for(const method of ['get','post','put','delete','use'])router[method]=(...args)=>{router.stack.push({method,path:args[0],handlers:args.slice(1)});return router;};return router;}`,
 db:`export function getDb(){return globalThis.__mergeTestDb??null;}`,
 socket:`export function getIO(){return null;}`,
 redis:`export function isRedisEnabled(){return false;}export async function redisSetPlayer(){throw Error('Forbidden Redis access');}export async function redisGetOrLoadPlayer(){throw Error('Forbidden Redis access');}`,
};
registerHooks({
 resolve(specifier,context,next){
  const external=specifier==='express'?'express':/(^|\/)db\.js$/.test(specifier)?'db':/(^|\/)socketManager\.js$/.test(specifier)?'socket':/(^|\/)redisAdapter\.js$/.test(specifier)?'redis':null;
  if(external)return {shortCircuit:true,url:`merge-route-test:${external}`};
  if(specifier.startsWith('.')||specifier.startsWith('file:')){
    const abs=fileURLToPath(new URL(specifier,context.parentURL));
    for(const base of [stage,baseline])if(abs.startsWith(base+'/')){
      const relative=path.relative(base,abs);
      const resolved=relative==='game-logic/yard.js'?yard:fs.existsSync(path.join(stage,relative))?path.join(stage,relative):path.join(baseline,relative);
      return next(pathToFileURL(resolved).href,context);
    }
  }
  return next(specifier,context);
 },
 load(url,context,next){
  if(url.startsWith('merge-route-test:'))return {shortCircuit:true,format:'module',source:code[url.slice('merge-route-test:'.length)]};
  if(url.endsWith('/game-logic/merge-lab-service.js')){
    const source=fs.readFileSync(fileURLToPath(url),'utf8');
    const marker=/enabled: (?:false|true), \/\/ Release composition/;
    if(!marker.test(source))throw Error('Test-only release marker changed');
    return {shortCircuit:true,format:'module',source:source.replace(marker,'enabled: true, // TEST PROCESS ONLY. Release composition')};
  }
  return next(url,context);
 },
});
