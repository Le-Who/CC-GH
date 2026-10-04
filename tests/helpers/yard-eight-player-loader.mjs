import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {relative} from 'node:path';
import {assertEightCandidateBuild,candidateSource,CANDIDATE_DIST} from './yard-eight-player-candidate.mjs';
assertEightCandidateBuild();
const root=fileURLToPath(new URL('../../',import.meta.url));
registerHooks({load(url,context,next){
 if(!url.startsWith('file:'))return next(url,context);
 const path=relative(root,fileURLToPath(url)).replaceAll('\\','/');
 if(path==='server.js'){
  const source=readFileSync(new URL(url),'utf8'),literal='path.join(__dirname, "dist"';
  if(source.split(literal).length!==4)throw Error('Unreviewed production static-root references');
  return {shortCircuit:true,format:'module',source:source.replaceAll(literal,`path.join(__dirname, "${CANDIDATE_DIST}"`)};
 }
 const source=path.startsWith('game-logic/yard-v2/')?candidateSource(path,readFileSync(new URL(url),'utf8')):null;
 return source===null?next(url,context):{shortCircuit:true,format:path.endsWith('.json')?'json':'module',source};
}});
