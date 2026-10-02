import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const contract=JSON.parse(readFileSync(new URL('./base-contract.json',import.meta.url),'utf8'));
export function verifyProductionUntouched() {
  for(const entry of contract.productionFiles) {
    const data=readFileSync(resolve(root,entry.path));
    if(createHash('sha256').update(data).digest('hex')!==entry.sha256)
      throw new Error(`Production path differs from candidate base ${contract.baseCommit}: ${entry.path}`);
  }
  const chunks=readFileSync(resolve(root,'src/app/gameChunks.jsx'),'utf8');
  if(!chunks.includes('../games/companion-yard/CompanionYardGame.jsx')||chunks.includes('companion-yard-v2'))
    throw new Error('Production room must still load the legacy Yard');
  return {baseCommit:contract.baseCommit,productionFilesChecked:contract.productionFiles.length,productionYard:'legacy-active'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(verifyProductionUntouched()));
