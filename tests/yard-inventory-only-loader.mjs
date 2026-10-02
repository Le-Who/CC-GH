/** Pure route/unit-test infrastructure. No package install, sockets, Redis or DB access.
 * Real playerManager uses its existing NODE_ENV=test in-memory path. */
import {registerHooks} from 'node:module';
process.env.NODE_ENV='test';
const code={
 express:`export function Router(){const router={stack:[]};for(const method of ['get','post','put','delete','use'])router[method]=(...args)=>{router.stack.push({method,path:args[0],handlers:args.slice(1)});return router;};return router;}`,
 db:`export function getDb(){return null;}`,
 socket:`export function getIO(){return null;}`,
 redis:`export function isRedisEnabled(){return false;} export async function redisSetPlayer(){throw new Error('Redis access forbidden in pure test');} export async function redisGetOrLoadPlayer(){throw new Error('Redis access forbidden in pure test');}`,
};
registerHooks({
 resolve(specifier,context,next){
  const key=specifier==='express'?'express':/(^|\/)db\.js$/.test(specifier)?'db':/(^|\/)socketManager\.js$/.test(specifier)?'socket':/(^|\/)redisAdapter\.js$/.test(specifier)?'redis':null;
  return key?{shortCircuit:true,url:`yard-preservation-test:${key}`}:next(specifier,context);
 },
 load(url,context,next){const key=url.startsWith('yard-preservation-test:')?url.slice('yard-preservation-test:'.length):null;
  return key?{shortCircuit:true,format:'module',source:code[key]}:next(url,context);},
});
