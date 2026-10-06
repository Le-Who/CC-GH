import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const SERVICE_SIGNATURES=Object.freeze([
 'export function ensurePersistentPlayerYard(player,{now=Date.now(),simulate=false,...options}={}) {',
 'export function executePersistentYardAction(player,action,payload={}, {now=Date.now(),actionId,...options}={}) {',
 'export function publicPersistentYard(player,{now=Date.now(),scene,...options}={}) {'
]);
export function fixtureServiceSource(source,expectedSha,optionsURL){
 assert.match(expectedSha,/^[a-f0-9]{64}$/);assert.equal(createHash('sha256').update(source).digest('hex'),expectedSha,'Reviewed service bytes required');
 assert(optionsURL.startsWith('file:')&&optionsURL.endsWith('/qa/yard-food-native/fixture-options.mjs'));
 let patched=source;for(const signature of SERVICE_SIGNATURES){assert.equal(patched.split(signature).length,2);patched=patched.replace(signature,signature+'\n  options=__foodFixtureOptions(player,options);');}
 return `import {fixtureOptions as __foodFixtureOptions} from ${JSON.stringify(optionsURL)};\n`+patched;
}
