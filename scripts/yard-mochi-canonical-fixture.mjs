/** Offline, deterministic acceptance fixture built through the real server
 * pipeline. Its profile override lives only in tests, never HTTP or player data. */
import '../tests/yard-inventory-only-loader.mjs';
import {createDefaultPlayer} from '../game-logic/player.js';
import {ensurePersistentPlayerYard,publicPersistentYard} from '../game-logic/yard-v2/service.mjs';
import {createMochiAcceptanceOptions} from '../tests/fixtures/yard-mochi-canonical/acceptance.mjs';
import {getYardServerOptions} from '../game-logic/yard-v2/yard-media.mjs';
import {YARD_GOODIES} from '../game-logic/yard-v2/catalog.mjs';
import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {resolve,dirname,relative,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),out=resolve(root,'recovery-tools/yard-canonical-mochi-qa'),NOW=Date.UTC(2026,9,3,12),H=3600000;
const options=createMochiAcceptanceOptions(),p=createDefaultPlayer('mochi-canonical-20','Fixture',NOW);
p.yard.placedGoodies=[{slotId:'mouse',goodieId:'yarn_mouse',x:50,y:45,condition:'new',uses:0}];
p.yard.bowls[0]={id:'bowl-1',foodId:'berry_plate',servings:5,placedAt:NOW,expiresAt:NOW+5*H};
for(const id of Object.keys(YARD_GOODIES))p.yard.goodieInventory[id]=3;
p.yard.goodieInventory.alchemy_living_arbor=4;p.yard.goodieInventory.alchemy_echo_chimes=7;
p.yard.foodInventory={kibble:11,berry_plate:12,bonito_bowl:13};
for(const now of [NOW,NOW+H]){const result=ensurePersistentPlayerYard(p,{now,simulate:now>NOW,...options});if(result.status!==200)throw Error(result.error);}
const visit=Object.values(p._yardV2.runtime.visits).find(r=>r.original.visitorId==='mochi_bunny');if(!visit)throw Error('Deterministic Mochi fixture admission missing');
const plan=visit.mediaAdmission.plan,snapshot={yard:p.yard,yardRuntime:publicPersistentYard(p,{now:NOW+H,...options})};
const closedSnapshot={yard:p.yard,yardRuntime:publicPersistentYard(p,{now:NOW+H,...getYardServerOptions()})};
const finished=structuredClone(p);ensurePersistentPlayerYard(finished,{now:visit.leavesAt,simulate:true,...options});
await mkdir(out,{recursive:true});
const data={snapshot,closedSnapshot,finishedSnapshot:{yard:finished.yard,yardRuntime:publicPersistentYard(finished,{now:visit.leavesAt,...options})},
 acceptanceProfile:options.actorProfiles.mochi,releaseAccepted:false,
 times:{approach:plan.schedule.enterAt+500,turn:plan.schedule.enterAt+15500,beforeEntry:plan.schedule.combinedStart-50,
  entry:plan.schedule.combinedStart,inspect:plan.schedule.combinedStart+4200,rest:plan.schedule.combinedStart+10000,
  loopEnd:plan.schedule.combinedStart+11150,loopStart:plan.schedule.combinedStart+11200,
  beforeExit:plan.schedule.combinedEnd-50,exit:plan.schedule.combinedEnd,leaving:visit.leavesAt-50,finished:visit.leavesAt}};
await writeFile(resolve(out,'fixture.json'),JSON.stringify(data)+'\n');
const visited=new Set(),files=[];
async function collect(path){path=resolve(path);if(visited.has(path))return;visited.add(path);
 if(!path.startsWith(root+'/'))throw Error('Source closure escaped project');
 const bytes=await readFile(path),name=relative(root,path);await mkdir(dirname(resolve(out,'source',name)),{recursive:true});await writeFile(resolve(out,'source',name),bytes);
 files.push({path:name,sha256:createHash('sha256').update(bytes).digest('hex')});
 if(!['.mjs','.js'].includes(extname(path)))return;
 for(const match of bytes.toString().matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"]([^'"]+)['"]/g)){
  if(!match[1].startsWith('.'))throw Error(`Nonlocal browser source: ${match[1]}`);await collect(resolve(dirname(path),match[1]));
 }
}
await collect(resolve(root,'src/games/companion-yard-v2/scene.mjs'));
await collect(resolve(root,'src/games/companion-yard-v2/courtyard.css'));
await writeFile(resolve(out,'SOURCE-CLOSURE.json'),JSON.stringify({runtimeActivated:false,files:files.sort((a,b)=>a.path.localeCompare(b.path))},null,2)+'\n');
for(const id of ['yard-mika','yard-mochi'])await cp(resolve(root,'public/assets',id),resolve(out,'public/assets',id),{recursive:true});
console.log(JSON.stringify({modules:files.length,visit:visit.visitId,durationMinutes:(visit.leavesAt-visit.arrivedAt)/60000,releaseAccepted:false}));
