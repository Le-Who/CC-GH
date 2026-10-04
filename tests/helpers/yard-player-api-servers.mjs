/** Bounded coordinator. Does not modify source, policy, accounts or production config. */
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {assertYardPlayerApiEnvironment,YARD_API_PORTS} from './yard-player-api-guard.mjs';
assertYardPlayerApiEnvironment();
// Bootstrap once before concurrent processes inspect the real schema.
const {initDb,ensureDbSchema,closeDb}=await import('../../db.js');
if(!initDb())throw Error('Real PostgreSQL required');await ensureDbSchema();await closeDb();
const children=[];let stopping=false;
function stop(){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');}
process.once('SIGTERM',stop);process.once('SIGINT',stop);process.once('exit',stop);
try{
  for(const mode of ['closed','active','activePeer']){
    const args=mode!=='closed'?['--import','./tests/helpers/yard-player-rollout-test-loader.mjs']:[];
    const child=spawn(process.execPath,[...args,'tests/helpers/yard-player-api-server.mjs',mode],{stdio:'inherit',env:{...process.env,YARD_PLAYER_WIRING_TEST:mode!=='closed'?'1':''}});children.push(child);
    child.on('error',()=>{stop();process.exitCode=1;});
    child.on('exit',code=>{if(!stopping){stop();process.exitCode=code||1;}});
    const deadline=Date.now()+60000;let ready=false;
    while(Date.now()<deadline&&!stopping){
      try{const r=await fetch(`http://127.0.0.1:${YARD_API_PORTS[mode]}/api/health`,{signal:AbortSignal.timeout(2000)});const b=await r.json();if(r.ok&&b.postgres===true){ready=true;break;}}catch{}
      await delay(250);
    }
    if(!ready)throw Error(`${mode} real API did not become ready`);
  }
  console.log('Closed and two isolated-active Yard API servers are ready');
}catch(error){stop();throw error;}
