/** Verify the actual clean Yard delivery in a build or final Docker image. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertNoRetiredPublicAssets} from './retired-public-assets.mjs';
import {inspectYardAssetBudget} from './yard-ui-media-budget.mjs';

export async function verifyCleanYardDelivery(distDir) {
 const graph=JSON.parse(await readFile(path.join(distDir,'game-loading-graph.json'),'utf8'));
 const retired=/src\/games\/companion-yard\/|src\/games\/companion-yard-v2\/(?:scene|legacy-m2-background|actor-media|atlas|presentation|render-pack)\.mjs$/;
 assert.equal(graph.entries['companion-yard'],undefined,'The retired route must not be emitted');
 assert.ok(graph.entries['yard-player-entry']&&graph.entries['companion-yard-v2'],'Normal clean route is required');
 const modules=graph.chunks.flatMap(chunk=>chunk.modules);
 assert.equal(modules.some(id=>retired.test(id)),false,'An obsolete Yard renderer is still emitted');
 assert.ok(modules.includes('src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs'));
 await assertNoRetiredPublicAssets(distDir);
 const retiredUrl=/\/(?:games\/companion-yard\/|assets-runtime\/companion-yard\/|assets\/yard-(?:mika|mochi|pebble|pip|family|fox|turtles)\/)/;
 for(const chunk of graph.chunks) {
  const code=await readFile(path.join(distDir,chunk.file),'utf8');
  assert.equal(retiredUrl.test(code),false,'Retired URL in '+chunk.file);
 }
 const budget=await inspectYardAssetBudget({distDir,graph});
 assert.deepEqual(budget.failures,[],'Exact current art identities and unchanged remainder ceiling');
 return {format:'yard-clean-delivery/v1',retiredModules:0,retiredAssets:0,route:graph.entries['yard-player-entry'],ui:budget.requiredUi,activeMedia:budget.activeMedia,aggregate:budget.aggregate};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 console.log(JSON.stringify(await verifyCleanYardDelivery(path.resolve(process.argv[2]||'dist')),null,2));
}
