import {readFileSync} from 'node:fs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {relative} from 'node:path';
import base from './vite.config.js';
import {assertEightCandidateBuild,candidateSource,candidateManifest,CANDIDATE_DIST,CANDIDATE_SOURCE_PINS,CANDIDATE_MEDIA_PINS} from './tests/helpers/yard-eight-player-candidate.mjs';
assertEightCandidateBuild();
const root=import.meta.dirname;
export default {...base,plugins:[{
 name:'isolated-eight-player-acceptance',enforce:'pre',
 load(id){const path=relative(root,id).replaceAll('\\','/');if(!Object.hasOwn(CANDIDATE_SOURCE_PINS,path))return null;return candidateSource(path,readFileSync(id,'utf8'));},
 generateBundle(){this.emitFile({type:'asset',fileName:'EIGHT-CANDIDATE-ONLY.json',source:JSON.stringify({scope:'test-only; never deploy',sourcePins:CANDIDATE_SOURCE_PINS,mediaPins:CANDIDATE_MEDIA_PINS})});},
 async writeBundle(){
  const candidateMedia={};for(const path of Object.keys(CANDIDATE_MEDIA_PINS)){const file=new URL(`./${CANDIDATE_DIST}/${path}`,import.meta.url),source=candidateManifest(path,await readFile(file,'utf8'));await writeFile(file,source);candidateMedia[path]={before:CANDIDATE_MEDIA_PINS[path],after:createHash('sha256').update(source).digest('hex'),changedFields:path.includes('yard-mochi/')?['playbackReady','runtimeActivated']:['playbackReady']};}
  await writeFile(new URL(`./${CANDIDATE_DIST}/EIGHT-CANDIDATE-ONLY.json`,import.meta.url),JSON.stringify({scope:'test-only; never deploy',sourcePins:CANDIDATE_SOURCE_PINS,mediaPins:CANDIDATE_MEDIA_PINS,candidateMedia}));
 },
},...base.plugins],build:{...base.build,outDir:CANDIDATE_DIST}};
