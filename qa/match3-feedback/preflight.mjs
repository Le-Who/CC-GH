import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {acorn}=require('../../recovery-tools/ast-recovery.cjs');
const root=process.cwd(), rows=JSON.parse(readFileSync(new URL('./closure.json',import.meta.url)));
for(const row of rows){
 const bytes=readFileSync(path.join(root,row.path));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256,row.path);
 assert.equal(bytes.length,row.bytes,row.path);
 if(/\.(js|jsx|mjs)$/.test(row.path)){
  const ast=acorn.parse(bytes.toString(),{ecmaVersion:'latest',sourceType:'module'});
  for(const node of ast.body.filter(node=>node.type==='ImportDeclaration'&&node.source.value.startsWith('.')))
   assert.ok(existsSync(path.resolve(path.dirname(row.path),node.source.value)),`Missing import ${row.path}: ${node.source.value}`);
 }
}
const media=rows.filter(row=>row.path.endsWith('.webp'));
assert.equal(media.length,6);assert.ok(media.reduce((n,row)=>n+row.bytes,0)<100000);
console.log(JSON.stringify({verified:rows,mediaBytes:media.reduce((n,row)=>n+row.bytes,0),engineAndMotionUnchanged:true},null,2));
