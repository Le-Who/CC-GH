/** Actual route/player code with test-only infrastructure substitutes.
 * No server, package install, Redis or DB is started. This is NOT persistence proof. */
import { registerHooks } from 'node:module';
process.env.NODE_ENV = 'test';
const sources = {
  express: `export function Router(){const router={stack:[]};for(const method of ['get','post','put','delete','use'])router[method]=(...args)=>{router.stack.push({method,path:args[0],handlers:args.slice(1)});return router;};return router;}`,
  db: `export function getDb(){return globalThis.__gardenR2TestDb??null;}`,
  socket: `export function getIO(){return globalThis.__gardenR2Socket??null;}`,
  redis: `export function isRedisEnabled(){return false;}export async function redisSetPlayer(){throw Error('Forbidden Redis access');}export async function redisGetOrLoadPlayer(){throw Error('Forbidden Redis access');}`,
};
registerHooks({
  resolve(specifier, context, next) {
    const key = specifier === 'express' ? 'express' : /(^|\/)db\.js$/.test(specifier) ? 'db' : /(^|\/)socketManager\.js$/.test(specifier) ? 'socket' : /(^|\/)redisAdapter\.js$/.test(specifier) ? 'redis' : null;
    return key ? { shortCircuit: true, url: `garden-r2-route-test:${key}` } : next(specifier, context);
  },
  load(url, context, next) {
    return url.startsWith('garden-r2-route-test:') ? { shortCircuit: true, format: 'module', source: sources[url.slice('garden-r2-route-test:'.length)] } : next(url, context);
  },
});
