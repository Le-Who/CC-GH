import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {oldDomain} from './old-domain.mjs';
import {yardReleasePresentation} from '../../src/games/companion-yard-v2/release-presentation.mjs';
import {createDefaultPlayer} from '../../game-logic/player.js';

test('pinned historical service and all 79 current dependencies preserve unknown saved storage',async()=>{
 const old=await oldDomain(),saved=createDefaultPlayer('native-acquisition-source','Fixture',Date.now());saved._yardV2={format:'yard-persistent/v1',version:2,opaque:{retained:true}};const before=structuredClone(saved);
 assert.equal(old.dependencyCount,81);assert.equal(old.reject(saved,{accountId:saved.id,action:'yard.buyGoodie',payload:{goodieId:'leaf_pot'},clientActionId:'yard-v2:source-guard'}).status,409);assert.equal(old.public(saved).mutable,false);assert.deepEqual(saved,before);assert.throws(()=>old.reject(saved,{accountId:'other'}));
});
test('focused native flow preserves strict purchase, IDB, reachability and independent failure boundaries',async()=>{
 const s=await fs.readFile(new URL('./acquisition.spec.mjs',import.meta.url),'utf8'),config=await fs.readFile(new URL('./config.mjs',import.meta.url),'utf8');
 assert.match(config,/testMatch:'acquisition.spec.mjs'/);assert.match(config,/globalTimeout:220000/);assert.match(config,/maxFailures:0/);
 assert.match(s,/test\('independent focused HUD/);assert.match(s,/test\.setTimeout\(115000\)/);assert.match(s,/test\.setTimeout\(85000\)/);assert.match(s,/s\?\.ready===true&&s.viewportBlocked===false/);assert.match(s,/document\.elementFromPoint/);assert.match(s,/localStorage fallback/);assert.match(s,/indexedDB\.open/);assert.match(s,/old\.reject\(await owner\.saved\(f\),command\)/);assert.match(s,/Preserve every authenticated response field outside yardRuntime/);
 assert.match(s,/same nonce|clientActionId/);assert.match(s,/treats:80,pots:0/);assert.match(s,/treats:280,pots:0/);assert.doesNotMatch(s,/recordVideo|setState|\.setGhost|grant/);assert.match(s,/await place\(p,98,118\)/);assert.match(s,/await move\(p,0,108,122\)/);assert.match(s,/await pickup\(p,0\)/);assert.match(s,/await waitForYardReady\(p,f,\(\)=>p.reload\(\)\)/);assert.match(s,/compactOtherPanels\(p,name\)/);assert.match(s,/report.errors.length,errorStart/);assert.match(s,/scrollEnd.top>0/);
});
test('current production builds both run and historical failures remain explicitly labelled',async()=>{
 const b=await fs.readFile(new URL('./build.mjs',import.meta.url),'utf8'),proof=JSON.parse(await fs.readFile(new URL('./acquisition-reused-proof.json',import.meta.url),'utf8'));
 assert.match(b,/\[\['default','false'\],\['preview','true'\]\]/);assert.equal(proof.defaultBuildReused,false);assert.equal(proof.priorBrowser.sections.actions,'passed');assert.equal(proof.priorBrowser.sections.hud,'failed');assert.equal(proof.priorBrowser.matrix.length,11);assert.equal(proof.priorBrowser.matrix.filter(r=>r.status==='passed').length,10);assert.equal(proof.postgres.pass,9);
});

test('old storage selects real release quarantine; current HTTP reload remounts persistent UI before recovery assertion',async()=>{
 const old=await oldDomain(),saved=createDefaultPlayer('release-quarantine-fixture','Fixture',Date.now());saved._yardV2={format:'yard-persistent/v1',version:2};
 assert.equal(yardReleasePresentation({yardRuntime:old.public(saved)}),'read-only');assert.equal(yardReleasePresentation({yardRuntime:{version:1,mutable:true,status:'ready'}}),'persistent');
 const release=await fs.readFile(new URL('../../src/games/companion-yard-v2/YardReleaseGame.jsx',import.meta.url),'utf8');
 const guard=release.slice(release.indexOf("if(mode==='read-only')return"),release.indexOf('const View='));assert.match(guard,/data-yard-read-only="true"/);assert.match(guard,/onClick=\{openHome\}/);assert.doesNotMatch(guard,/Persistent|Courtyard|yardVisitStatus/);
 const s=await fs.readFile(new URL('./acquisition.spec.mjs',import.meta.url),'utf8'),quarantine=s.slice(s.indexOf('const oldRead='),s.indexOf('const resumed=')),recovery=s.slice(s.indexOf('const resumed='),s.indexOf('const final=await owner.saved(f)'));
 assert.match(quarantine,/data-yard-read-only/);assert.match(quarantine,/\.cy-app,\.companion-yard-stage.*toHaveCount\(0\)/);assert.match(quarantine,/home.click\(\{trial:true\}\)/);assert.match(quarantine,/assert.deepEqual\(reloaded.items,retained.items\)/);assert.doesNotMatch(quarantine,/yardVisitStatus|locator\('\.cy-app'\)\)\.toBeVisible/);
 assert(recovery.indexOf('await waitForYardReady')<recovery.indexOf('const recovered='));assert.match(recovery,/p.unroute\('\*\*\/api\/player\/snapshot\*',oldSnapshot\)/);assert.match(recovery,/persistent-mika-r1/);assert.doesNotMatch(recovery,/await refresh/);
});
