import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),ast=require('../recovery-tools/ast-recovery.cjs');
const {loadClosure}=require('./fixtures/pixi-mock.cjs');
const root=fileURLToPath(new URL('../',import.meta.url));
const {Match3Metric}=loadClosure(root+'src/games/match3/Match3Presentation.jsx',['Match3Metric'],{jsxRuntime},ast);
const {MATCH3_TRANSLATIONS}=loadClosure(root+'src/games/match3/i18n.js',['MATCH3_TRANSLATIONS'],{},ast);
test('record oracle is unique and exact for real metric HTML in both layout branches and languages',()=>{
 const source=readFileSync(root+'src/games/match3/Match3Presentation.jsx','utf8');
 const scoreBranches=[...source.matchAll(/jsxRuntime\.jsx\(Match3Metric, \{[^}]*?(?:\{points:props.highScore\}[^}]*?)[\s\S]*?value:formattedScore,[\s\S]*?\}\)/g)];
 assert.equal(scoreBranches.length,2,'both landscape and portrait wire the existing target and current score');
 for(const language of ['en','ru'])for(const className of ['','m3-score']){
  const label=MATCH3_TRANSLATIONS[language]['match3.scoreRecord'].replace('{points}','500');
  const html=renderToStaticMarkup(jsxRuntime.jsx(Match3Metric,{label,value:'90',className,progress:90/500}));
  assert.equal((html.match(/class="m3-metric /g)||[]).length,1);
  assert.ok(html.includes(`aria-label="${label}: 90"`));
  assert.match(html,/>90<\/strong>/);assert.ok(html.includes('width:18%'));
 }
});


test('short readable combo label retains full run-maximum meaning for assistive technology',()=>{
 for(const [label,accessibleLabel] of [['Combo','Best combo'],['Комбо','Лучшее комбо']]){
  const html=renderToStaticMarkup(jsxRuntime.jsx(Match3Metric,{label,accessibleLabel,value:2,className:'m3-combo'}));
  assert.ok(html.includes(`aria-label="${accessibleLabel}: 2"`));assert.ok(html.includes(`<span>${label}</span>`));
 }
});
