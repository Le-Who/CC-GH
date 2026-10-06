import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import postcss from 'postcss';
import {supportsCleanViewport,CLEAN_STAGE_MIN} from '../src/games/companion-yard-v2/pip-prototype/projection.mjs';

const source=await fs.readFile(process.env.YARD_COMPACT_CSS_SOURCE||new URL('../src/games/companion-yard-v2/courtyard.css',import.meta.url),'utf8');
const css=postcss.parse(source),compact='(min-aspect-ratio:8/5) and (max-height:360px)';
const landscapeDialog='(orientation:landscape) and (min-aspect-ratio:8/5) and (max-height:550px)';
const root='.cy-app[data-canonical-items="true"]';
function matches(params,{width,height}){
 return params.split(',').some(branch=>[...branch.matchAll(/\(([^:()]+):([^()]+)\)/g)].every(([,key,raw])=>{
  const value=raw.trim();key=key.trim();
  if(key==='orientation')return value===(width>=height?'landscape':'portrait');
  if(key==='prefers-reduced-motion')return false;
  const [a,b]=value.split('/').map(Number),expected=b?a/b:Number.parseFloat(value),actual=key.includes('aspect-ratio')?width/height:key.includes('width')?width:height;
  return key.startsWith('min-')?actual>=expected:actual<=expected;
 }));
}
function declarations(tree,selectors,viewport){
 const result={};tree.walkRules(rule=>{
  if(!rule.selectors.some(s=>selectors.includes(s)))return;
  for(let node=rule.parent;node?.type!=='root';node=node.parent)if(node.type==='atrule'&&node.name==='media'&&!matches(node.params,viewport))return;
  for(const node of rule.nodes)if(node.type==='decl')result[node.prop]=node.value;
 });return result;
}
const viewport={width:568,height:320};
const effective=(selectors,v=viewport)=>declarations(css,selectors,v);
const dialogWidth=(value,width)=>value.startsWith('min(')?Math.min(Number.parseFloat(value.slice(4)),width-16):value.startsWith('calc(')?width-16:Number.parseFloat(value);

test('compact canonical stage includes the real outer shell gutter and retains its unchanged live minimum',async()=>{
 const shell=postcss.parse(await fs.readFile(new URL('../src/index.css',import.meta.url),'utf8'));
 const padding=declarations(shell,['.telegram-app.play-mode.immersive-mode'],viewport).padding;
 const gutter=padding.match(/calc\((\d+)px \+ var\(--safe-top\)\) (\d+)px calc\((\d+)px \+ var\(--safe-bottom\)\)/);assert.ok(gutter,'actual shared shell gutter is part of the budget');
 const app=effective(['.cy-app',root]),header=Number(app['grid-template'].match(/"header nav" (\d+)px/)[1]);
 const status=Number.parseFloat(effective(['.cy-status',root+' .cy-status'])['min-height']);
 const controls=Number.parseFloat(effective(['.cy-pip-controls[data-active="true"]',root+' .cy-pip-controls[data-active="true"]']).height);
 const rail=Number(app['grid-template'].match(/ (\d+)px$/)[1]);
 const stage={width:viewport.width-2*Number(gutter[2])-rail,height:viewport.height-Number(gutter[1])-Number(gutter[3])-header-status-controls};
 assert.deepEqual(stage,{width:480,height:194});assert.deepEqual(CLEAN_STAGE_MIN,{width:280,height:192});assert.equal(supportsCleanViewport(stage.width,stage.height),true);
 assert.equal(Number.parseFloat(effective(['.cy-app button'])['min-height']),44);assert.equal(header,44);assert.equal(effective(['.cy-header',root+' .cy-header']).padding,'0 8px');
});

test('compact item scrolling owns a full-height column beside actions instead of below a shrinking footer',()=>{
 const dialog=effective(['.cy-dialog',root+' .cy-dialog','.cy-dialog[open]',root+' .cy-dialog[open]']);
 assert.equal(dialog.display,'grid');assert.equal(dialogWidth(dialog.width,568),552);
 const rows=[...dialog['grid-template'].matchAll(/"[^"]+" (\d+)px/g)].map(m=>Number(m[1]));assert.deepEqual(rows,[44,48]);
 assert.match(dialog['grid-template'],/"content actions" minmax\(0,1fr\)/);
 const panelHeight=320-12-2*Number.parseFloat(dialog['border-width'])-rows.reduce((a,b)=>a+b,0);
 assert.equal(panelHeight,192);
 const panel=effective(['.cy-panel',root+' .cy-dialog>.cy-panel']),actions=effective(['.cy-selected-actions',root+' .cy-dialog>.cy-selected-actions']);
 assert.equal(panel['grid-area'],'content');assert.equal(actions['grid-area'],'actions');assert.equal(panel['overflow-y'],'auto');assert.equal(actions['overflow-y'],'auto');
 const card=effective(['.cy-dialog .cy-catalog-choice',root+' .cy-dialog .cy-catalog-choice']);
 const preview=effective(['.cy-preview-art',root+' .cy-catalog-choice>.cy-preview-art']);
 const fullRow=Number.parseFloat(preview.height)+2*Number.parseFloat(card.padding)+2*Number.parseFloat(card['border-width']);
 assert.equal(card.display,'grid');assert.ok(Number.parseFloat(card['min-height'])>=fullRow);assert.ok(panelHeight>=fullRow);
 assert.match(card['grid-template'],/"art name".*"art detail"/);
});

test('phone-landscape placed actions retain their full column and text width at844x390',()=>{
 const v={width:844,height:390},dialog=effective(['.cy-dialog',root+' .cy-dialog','.cy-dialog[open]',root+' .cy-dialog[open]'],v);
 assert.equal(dialog.display,'grid');assert.equal(dialogWidth(dialog.width,v.width),640);
 const column=Number(dialog['grid-template'].match(/ (\d+)px$/)[1]);
 const actions=effective(['.cy-selected-actions',root+' .cy-dialog>.cy-selected-actions'],v);
 const buttons=effective(['.cy-app button','.cy-dialog button','.cy-selected-actions button',root+' .cy-selected-actions button'],v);
 const row=effective(['.cy-row-actions','.cy-selected-actions .cy-row-actions',root+' .cy-selected-actions .cy-row-actions'],v);
 assert.equal(row['flex-direction'],'column');assert.equal(row['flex-wrap'],'nowrap');
 const inset=Number.parseFloat(actions.padding.split(' ').at(-1)),border=Number.parseFloat(actions['border-left']),buttonPadding=Number.parseFloat(buttons.padding);
 assert.equal(column-inset-border-2*buttonPadding,151,'each action retains151px available text width');
 assert.equal(Number.parseFloat(buttons['min-height']),44);
 assert.equal(Number(effective(['.cy-app',root],v)['grid-template'].match(/"header nav" (\d+)px/)[1]),56,'common landscape header stays unchanged');
});

test('landscape dialog overrides leave portrait, tablet, desktop and legacy profiles unchanged',()=>{
 const baseline=css.clone();baseline.walkAtRules('media',rule=>{if(rule.params===compact||rule.params===landscapeDialog)rule.remove();});
 const targets=[['.cy-app',root],['.cy-header',root+' .cy-header'],['.cy-dialog',root+' .cy-dialog','.cy-dialog[open]',root+' .cy-dialog[open]'],['.cy-selected-actions',root+' .cy-dialog>.cy-selected-actions']];
 for(const [width,height]of[[320,568],[360,800],[390,844],[414,896],[768,1024],[1024,768],[1280,720],[375,812]])for(const selectors of targets){const v={width,height};assert.deepEqual(declarations(css,selectors,v),declarations(baseline,selectors,v),`${width}x${height}`);}
 for(const v of[viewport,{width:844,height:390}])for(const selectors of targets.map(rows=>rows.filter(s=>!s.includes('data-canonical-items'))))assert.deepEqual(declarations(css,selectors,v),declarations(baseline,selectors,v));
});
