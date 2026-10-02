// Runs only the migrated assertions, in-process and without dependency-heavy test imports.
import assert from 'node:assert/strict';
import fs, {readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {renderArcadePresentation,findElements,textContent} from '../../tests/helpers/arcadePresentationHarness.js';
import {normalizeBubboPowerups} from '../../src/game-core/bubbo/engine.js';
const require=createRequire(import.meta.url);
const {acorn}=require('../ast-recovery.cjs');
const root=fileURLToPath(new URL('../../',import.meta.url));
const files={
 'game-ux-foundations.test.js': /Bubbo v2|Building Blox v2|playfield backgrounds with a single renderer|Match-3 v2/,
 'merge.test.js': /migrated game menus|accidental end-run|Gem Crush status/,
};
let pass=0,fail=0;
for(const[file,selected]of Object.entries(files)){
 const full=readFileSync(path.join(root,'tests',file),'utf8');
 const ast=acorn.parse(full,{ecmaVersion:'latest',sourceType:'module'});
 const context={assert,fs,path,readFileSync,normalizeBubboPowerups,renderArcadePresentation,findElements,textContent,URL,testUrl:pathToFileURL(path.join(root,'tests',file)).href,__dirname:path.join(root,'tests')};
 const readRuntime=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='readSceneRuntimeText');
 if(readRuntime)context.readSceneRuntimeText=new Function(...Object.keys(context),full.slice(readRuntime.start,readRuntime.end)+';return readSceneRuntimeText')(...Object.values(context));
 const closures=[];
 function walk(n){
  if(!n||typeof n!=='object')return;
  if(n.type==='CallExpression'&&n.callee.type==='Identifier'&&n.callee.name==='it'&&selected.test(n.arguments[0]?.value))closures.push(n);
  for(const value of Object.values(n))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);
 }walk(ast);
 for(const n of closures){
  const title=n.arguments[0].value;
  const source=full.slice(n.arguments[1].start,n.arguments[1].end).replaceAll('import.meta.url','testUrl');
  try{await new Function(...Object.keys(context),'return ('+source+')')(...Object.values(context))();console.log('PASS',file,title);pass++}
  catch(error){console.error('FAIL',file,title,error.message);fail++}
 }
}
console.log(JSON.stringify({pass,fail}));if(fail)process.exitCode=1;
