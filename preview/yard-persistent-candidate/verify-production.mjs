import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {verifyBoundaryTransfer} from './verify-boundary-transfer.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
export function verifyProductionUntouched({rootDir=root}={}) {
  const contract=JSON.parse(readFileSync(resolve(rootDir,'preview/yard-persistent-candidate/base-contract.json'),'utf8'));
  const reviewed=contract.reviewedPlayerWiringChangeSet;
  if(reviewed?.rolloutEnabled!==false||reviewed.sourceAcceptanceChanged!==false)throw Error('Reviewed closed player wiring required');
  for(const entry of [...contract.productionFiles,...reviewed.closedRolloutFiles]) {
    const data=readFileSync(resolve(rootDir,entry.path));
    if(data.length!==entry.bytes||createHash('sha256').update(data).digest('hex')!==entry.sha256)
      throw new Error(`Production path differs from candidate base ${contract.baseCommit}: ${entry.path}`);
  }
  const boundary=verifyBoundaryTransfer({rootDir});
  // A fresh native process cannot inherit the candidate/active-test import hooks.
  // Hashes pin reviewed bytes; this independent check rejects a blindly repinned open gate.
  const check=spawnSync(process.execPath,[fileURLToPath(new URL('./verify-closed-rollout.mjs',import.meta.url)),rootDir],{
    cwd:rootDir,encoding:'utf8',timeout:30000,env:{...process.env,NODE_OPTIONS:'',DATABASE_URL:'',REDIS_URL:'',YARD_CANDIDATE_CI:'',YARD_PLAYER_WIRING_TEST:''},
  });
  if(check.error||check.status!==0)throw Error(`Closed rollout verification failed: ${check.error?.message||check.stderr||check.stdout}`);
  const rollout=JSON.parse(check.stdout);
  return {baseCommit:contract.baseCommit,productionFilesChecked:contract.productionFiles.length,closedControlFilesChecked:reviewed.closedRolloutFiles.length,
    productionYard:'closed-rollout-legacy-default',...rollout,boundary};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(verifyProductionUntouched()));
