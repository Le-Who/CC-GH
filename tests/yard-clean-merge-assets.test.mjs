import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {MERGE_LAB_CATALOG} from '../game-logic/merge-lab-catalog.js';

// Exact active project icons from the 57e0 source tree. These four visuals are
// still rendered by MergeLabView, so they change ownership without changing art.
const shared = {
 moon_lamp:'ed5d8d906f191fd8b73c502c9e1b8f5b54c9303c',
 fountain_bowl:'6eb4ca56c494759b275ccda06b741695c5dbe9fb',
 cloud_bed:'2a7964a75156bf52692bca6c51147afd2cbcf519',
 book_nook:'a502e3d52e92ce3158f64eb071e3d0ec7e358396',
};
test('active Merge project icons retain exact existing pixels under Merge ownership',async()=>{
 for(const [id,sha]of Object.entries(shared)){
  const rows=MERGE_LAB_CATALOG.projects.filter(project=>project.output.itemId===id);
  assert.equal(rows.length,1);assert.equal(rows[0].asset,`/games/merge-lab-v3/projects/${id}.png`);
  const bytes=await readFile(new URL(`../public${rows[0].asset}`,import.meta.url));
  const actual=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(actual,sha,'An ownership move cannot change '+id+' pixels');
 }
 assert.equal(MERGE_LAB_CATALOG.projects.some(project=>project.asset?.includes('/games/companion-yard/')),false);
 const view=await readFile(new URL('../src/games/merge/MergeLabView.js',import.meta.url),'utf8');
 assert.match(view,/src:G\.asset/,'The preserved icons must remain tied to their active Merge presentation');
});
