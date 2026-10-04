/** Native probability, server admission and persistence; actual frozen pixels. */
import '../tests/yard-inventory-only-loader.mjs';
import {nativePlayer,EIGHT_FIXTURE_SPECS,NOW,H} from '../tests/helpers/yard-eight-fixtures.mjs';
import {createDefaultPlayer} from '../game-logic/player.js';
import {createEightAcceptanceOptions} from '../tests/fixtures/yard-eight-canonical/acceptance.mjs';
import {ensurePersistentPlayerYard,publicPersistentYard} from '../game-logic/yard-v2/service.mjs';
import {getYardServerOptions} from '../game-logic/yard-v2/yard-media.mjs';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,dirname,relative,sep,isAbsolute,extname} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'recovery-tools/yard-canonical-eight-qa'),options=createEightAcceptanceOptions();
await mkdir(out,{recursive:true});const actors={};
for(const id of Object.keys(EIGHT_FIXTURE_SPECS)){
 const p=nativePlayer(id);for(const now of [NOW,NOW+H]){const r=ensurePersistentPlayerYard(p,{now,simulate:now>NOW,...options});if(r.status!==200)throw Error(r.error);}
 const rows=Object.values(p._yardV2.runtime.visits);if(rows.length!==1||rows[0].original.visitorId!==EIGHT_FIXTURE_SPECS[id].visitorId)throw Error(`Actual native admission missing: ${id}`);
 const row=rows[0],plan=row.mediaAdmission.plan,incoming=plan.schedule.segments.find(s=>s.kind==='route'&&s.role==='approach'),loop=plan.schedule.segments.find(s=>s.kind==='loop'),combinedStart=plan.schedule.combinedStart??plan.schedule.segments.find(s=>s.kind==='clip').startAt,combinedEnd=plan.propReleaseAt;
 const phaseTimes={approach:incoming.startAt+40,turn:incoming.startAt+(incoming.route.legs.find(l=>l.kind==='turn')?.startMs||0)+40,entry:combinedStart,rest:loop.startAt+40,wake:plan.schedule.segments.find(s=>s.kind==='clip'&&s.startAt>=loop.endAt)?.startAt||combinedEnd-40,exit:combinedEnd,leaving:row.leavesAt-40,finished:row.leavesAt};
 const snapshot={yard:structuredClone(p.yard),yardRuntime:publicPersistentYard(p,{now:row.arrivedAt,...options})};if(!snapshot.yardRuntime.visits[0].renderCompatible)throw Error(`Incompatible native source: ${id}`);
 const finished=JSON.parse(JSON.stringify(p));ensurePersistentPlayerYard(finished,{now:row.leavesAt,simulate:true,...options});
 actors[id]={seed:p.id,record:row,snapshot,closedSnapshot:{yard:p.yard,yardRuntime:publicPersistentYard(p,{now:row.arrivedAt,...getYardServerOptions()})},finishedSnapshot:{yard:finished.yard,yardRuntime:publicPersistentYard(finished,{now:row.leavesAt,...options})},times:phaseTimes};
 console.log(JSON.stringify({id,seed:p.id,minutes:(row.leavesAt-row.arrivedAt)/60000,clipId:plan.clipId,conditionReceipt:plan.conditionReceipt||null}));
}
const joint={};
for(const [first,id]of [['pip','mixed-timed-pip-2316'],['pebble','mixed-timed-pebble-737']]){
 const p=createDefaultPlayer(id,'Native joint acceptance',NOW);Object.assign(p.yard,{remodel:'meadow',expansion:{level:1},placedGoodies:[{slotId:'leaf',goodieId:'leaf_pot',x:60,y:35,rotationZ:0,condition:'new',uses:0},{slotId:'snack',goodieId:'snack_table',x:50,y:65,rotationZ:0,condition:'new',uses:0}]});p.yard.bowls[0]={id:'bowl-1',foodId:'berry_plate',servings:2,placedAt:NOW,expiresAt:NOW+5*H};
 for(const now of [NOW,NOW+H,NOW+2*H]){const r=ensurePersistentPlayerYard(p,{now,simulate:now>NOW,...options});if(r.status!==200)throw Error(r.error);}
 const records=Object.values(p._yardV2.runtime.visits);if(records.length!==2||p.yard.activeVisitors.length!==2||records[0].original.visitorId!==`${first==='pip'?'pip_hamster':'pebble_pup'}`)throw Error('Actual joint native visits missing');
 const last=records[1],plan=last.mediaAdmission.plan,approach=plan.schedule.segments.find(s=>s.role==='approach'),loop=plan.schedule.segments.find(s=>s.kind==='loop'),finished=Math.max(...records.map(r=>r.leavesAt));
 const times={approach:approach.startAt+40,rest:loop.startAt+40,firstRelease:records[0].mediaAdmission.plan.propReleaseAt,firstCompletion:records[0].leavesAt,finished};
 const checkpoints=[...new Set([NOW+2*H,...Object.values(times),...records.flatMap(r=>[r.mediaAdmission.plan.propReleaseAt-1,r.mediaAdmission.plan.propReleaseAt+1,r.leavesAt-1,r.leavesAt+1])])].sort((a,b)=>a-b),snapshots=[];
 for(const at of checkpoints){const saved=structuredClone(p);ensurePersistentPlayerYard(saved,{now:at,simulate:true,...options});snapshots.push({at,snapshot:{yard:saved.yard,yardRuntime:publicPersistentYard(saved,{now:at,...options})}});}
 const snapshot=snapshots[0].snapshot;joint[`${first}-first`]={seed:id,records,snapshots,snapshot,closedSnapshot:snapshot,finishedSnapshot:snapshots.find(s=>s.at===finished).snapshot,times};
 console.log('EIGHT_REGISTRY_NATIVE_JOINT',JSON.stringify({first,seed:id,visitorIds:records.map(r=>r.original.visitorId),minutes:records.map(r=>(r.leavesAt-r.arrivedAt)/60000),simultaneousActive:p.yard.activeVisitors.length}));
}
const mochi110=JSON.parse(await readFile(resolve(out,'mochi110-witness.json'),'utf8'));delete mochi110.player;
await writeFile(resolve(out,'fixture.json'),JSON.stringify({scope:'Eight native single-species witnesses, native Mochi110 and two Pip/Pebble native joint witnesses with all eight profiles registered. Full family/maximal joint acceptance remains separate.',releaseAccepted:false,actorProfiles:options.actorProfiles,actors,joint,extraWitnesses:{mochi110}})+'\n');
const visited=new Set(),files=[];
async function collect(path){path=resolve(path);if(visited.has(path))return;visited.add(path);const local=relative(root,path);if(local==='..'||local.startsWith('..'+sep)||isAbsolute(local))throw Error('Source closure escaped project');const bytes=await readFile(path),name=local.split(sep).join('/');files.push({path:name,sha256:createHash('sha256').update(bytes).digest('hex')});if(!['.mjs','.js'].includes(extname(path)))return;for(const m of bytes.toString().matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"]([^'"]+)['"]/g)){if(!m[1].startsWith('.'))throw Error(`Nonlocal browser source: ${m[1]}`);await collect(resolve(dirname(path),m[1]));}}
await collect(resolve(root,'src/games/companion-yard-v2/scene.mjs'));await collect(resolve(root,'src/games/companion-yard-v2/courtyard.css'));
await writeFile(resolve(out,'SOURCE-CLOSURE.json'),JSON.stringify({runtimeActivated:false,files:files.sort((a,b)=>a.path.localeCompare(b.path))},null,2)+'\n');
const mediaFiles=[];
async function collectMedia(dir,prefix){for(const e of await readdir(dir,{withFileTypes:true})){const name=prefix+'/'+e.name;if(e.isDirectory())await collectMedia(resolve(dir,e.name),name);else{const bytes=await readFile(resolve(dir,e.name));mediaFiles.push({path:name,repositoryPath:relative(root,resolve(dir,e.name)).split(sep).join('/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}}
for(const family of ['mika','mochi','pebble','pip'])await collectMedia(resolve(root,'public/assets/yard-'+family),'assets/yard-'+family);
for(const family of ['family','fox','turtles'])await collectMedia(resolve(root,'recovery-tools/yard-family-frozen/assets/yard-'+family),'assets/yard-'+family);
mediaFiles.sort((a,b)=>a.path.localeCompare(b.path));await writeFile(resolve(out,'MEDIA-CLOSURE.json'),JSON.stringify({runtimeActivated:false,files:mediaFiles},null,2)+'\n');
