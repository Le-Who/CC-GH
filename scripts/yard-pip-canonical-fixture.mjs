/** Offline, deterministic acceptance fixture built through the real server
 * pipeline. Its profile override lives only in tests, never HTTP or player data. */
import '../tests/yard-inventory-only-loader.mjs';
import {createDefaultPlayer} from '../game-logic/player.js';
import {ensurePersistentPlayerYard,publicPersistentYard} from '../game-logic/yard-v2/service.mjs';
import {createPipAcceptanceOptions} from '../tests/fixtures/yard-pip-canonical/acceptance.mjs';
import {getYardServerOptions} from '../game-logic/yard-v2/yard-media.mjs';
import {YARD_GOODIES} from '../game-logic/yard-v2/catalog.mjs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,relative,extname,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),out=resolve(root,'recovery-tools/yard-canonical-pip-qa'),NOW=Date.UTC(2026,9,3,12),H=3600000;
const options=createPipAcceptanceOptions(),p=createDefaultPlayer('pip-canonical-9','Fixture',NOW);
p.yard.placedGoodies=[{slotId:'snack',goodieId:'snack_table',x:50,y:50,rotationZ:0,condition:'new',uses:0}];
p.yard.bowls[0]={id:'bowl-1',foodId:'berry_plate',servings:5,placedAt:NOW,expiresAt:NOW+5*H};
for(const id of Object.keys(YARD_GOODIES))p.yard.goodieInventory[id]=3;
p.yard.goodieInventory.alchemy_living_arbor=4;p.yard.goodieInventory.alchemy_echo_chimes=7;
p.yard.foodInventory={kibble:11,berry_plate:12,bonito_bowl:13};
for(const now of [NOW,NOW+H]){const result=ensurePersistentPlayerYard(p,{now,simulate:now>NOW,...options});if(result.status!==200)throw Error(result.error);}
const visit=Object.values(p._yardV2.runtime.visits).find(r=>r.original.visitorId==='pip_hamster');if(!visit)throw Error('Deterministic Pip fixture admission missing');
const plan=visit.mediaAdmission.plan,snapshot={yard:p.yard,yardRuntime:publicPersistentYard(p,{now:NOW+H,...options})};
const closedSnapshot={yard:p.yard,yardRuntime:publicPersistentYard(p,{now:NOW+H,...getYardServerOptions()})};
const finished=structuredClone(p);ensurePersistentPlayerYard(finished,{now:visit.leavesAt,simulate:true,...options});
await mkdir(out,{recursive:true});
const data={snapshot,closedSnapshot,finishedSnapshot:{yard:finished.yard,yardRuntime:publicPersistentYard(finished,{now:visit.leavesAt,...options})},
 acceptanceProfile:options.actorProfiles.pip,releaseAccepted:false,
 times:{approach:plan.schedule.enterAt+500,turn:plan.schedule.enterAt+plan.incoming.legs.find(l=>l.kind==='turn').startMs+40,
  beforeEntry:plan.schedule.combinedStart-40,entry:plan.schedule.combinedStart,inspect:plan.schedule.combinedStart+5200,
  back:plan.schedule.combinedStart+11520,turnAway:plan.schedule.combinedStart+14000,rest:plan.schedule.combinedStart+17920,
  loopEnd:plan.schedule.combinedStart+19160,loopStart:plan.schedule.combinedStart+19200,
  beforeExit:plan.schedule.combinedEnd-40,exit:plan.schedule.combinedEnd,leaving:visit.leavesAt-40,finished:visit.leavesAt}};
await writeFile(resolve(out,'fixture.json'),JSON.stringify(data)+'\n');
const visited=new Set(),files=[];
async function collect(path){path=resolve(path);if(visited.has(path))return;visited.add(path);
 const local=relative(root,path);if(local==='..'||local.startsWith('..'+sep)||isAbsolute(local))throw Error('Source closure escaped project');
 const bytes=await readFile(path),name=local.split(sep).join('/');
 files.push({path:name,sha256:createHash('sha256').update(bytes).digest('hex')});
 if(!['.mjs','.js'].includes(extname(path)))return;
 for(const match of bytes.toString().matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"]([^'"]+)['"]/g)){
  if(!match[1].startsWith('.'))throw Error(`Nonlocal browser source: ${match[1]}`);await collect(resolve(dirname(path),match[1]));
 }
}
await collect(resolve(root,'src/games/companion-yard-v2/scene.mjs'));
await collect(resolve(root,'src/games/companion-yard-v2/courtyard.css'));
await writeFile(resolve(out,'SOURCE-CLOSURE.json'),JSON.stringify({runtimeActivated:false,files:files.sort((a,b)=>a.path.localeCompare(b.path))},null,2)+'\n');

console.log(JSON.stringify({modules:files.length,visit:visit.visitId,durationMinutes:(visit.leavesAt-visit.arrivedAt)/60000,releaseAccepted:false}));
