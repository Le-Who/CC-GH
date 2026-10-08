import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {yardRendererChunk} from '../scripts/yard-renderer-chunk.mjs';
import {GARDEN_RASTER} from '../src/games/companion-yard-v2/pip-prototype/garden-raster.mjs';
const root=path.resolve(import.meta.dirname,'..');
const prefix='src/games/companion-yard-v2/pip-prototype/';
test('camera and immutable raster have one exact executable owner',async()=>{
 for(const name of ['projection.mjs','garden-raster.mjs'])assert.equal(yardRendererChunk(path.join(root,prefix+name),root),'yard-pip-projection');
 for(const name of ['resources.mjs','yard-pip-scene.mjs','render-quality-profile.mjs'])assert.equal(yardRendererChunk(path.join(root,prefix+name),root),undefined);
 assert.equal(yardRendererChunk(path.join(root,prefix+'world-scale.mjs'),root),'yard-canonical-motion');
 assert.deepEqual(GARDEN_RASTER,{width:390,height:648,pixels:252720});assert.ok(Object.isFrozen(GARDEN_RASTER));
 const projection=await readFile(path.join(root,prefix+'projection.mjs'),'utf8');
 assert.match(projection,/from'\.\/garden-raster\.mjs'/);assert.doesNotMatch(projection,/from'\.\/resources\.mjs'/);
 const leaf=await readFile(path.join(root,prefix+'garden-raster.mjs'),'utf8');assert.doesNotMatch(leaf,/^import/m);
 const resources=await readFile(path.join(root,prefix+'resources.mjs'),'utf8');assert.match(resources,/export\{GARDEN_RASTER\}from'\.\/garden-raster\.mjs'/);
});
