/** Explicit replay creates an isolated synthetic run; it never erases a run. */
export function demoPointerKey(base,scenario){return `${base}:turns-r2b:current:${scenario}`;}
export function demoRunId(storage,base,scenario){const id=storage.getItem(demoPointerKey(base,scenario));return /^[a-z0-9-]{1,48}$/i.test(id||'')?id:'initial';}
export function demoSaveKey(base,scenario,runId){if(!/^[a-z0-9-]{1,48}$/i.test(runId))throw Error('Invalid synthetic run ID');return `${base}:turns-r2b:${runId}:${scenario}`;}
export function beginDemoReplay(storage,{base,scenario,currentRun,encoded,runId}){
 if(runId===currentRun)throw Error('Replay must create a distinct synthetic run');
 const oldKey=demoSaveKey(base,scenario,currentRun),nextKey=demoSaveKey(base,scenario,runId);
 if(storage.getItem(nextKey)!==null)throw Error('Replay cannot overwrite an existing run');
 storage.setItem(oldKey,encoded); // Original result is retained before pointer changes.
 storage.setItem(demoPointerKey(base,scenario),runId);
 return {previousKey:oldKey,nextKey};
}
