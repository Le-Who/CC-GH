import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {YARD_GOODIES} from '../game-logic/yard-catalog.js';
import {occupiedDecorLabels} from '../src/games/companion-yard-v2/catalog-ui.mjs';

const translations={};
for(const path of ['companion-yard/i18n.js','companion-yard-v2/i18n.js']){
 const source=(await readFile(new URL('../src/games/'+path,import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export const ','const ');
 runInNewContext(source,{registerAppTranslations:table=>{for(const[language,values]of Object.entries(table))translations[language]={...translations[language],...values};}});
}
const placed=Object.freeze([
 Object.freeze({slotId:'canonical:first',goodieId:'leaf_pot'}),
 Object.freeze({slotId:'canonical:owned-overlap',goodieId:'leaf_pot'}),
]);
for(const[language,pot,fallback]of[['ru','Горшок с листьями','Сохранённый предмет'],['en','Leaf Pot','Saved item']]){
 const t=(key,values={})=>translations[language][key].replace(/\{(\w+)\}/g,(_,name)=>values[name]);
 const name=id=>Object.hasOwn(YARD_GOODIES,id)?t(`yard.catalog.goodies.${id}.name`):t('yard.persistent.unknownItem');
 test(`${language}: occupied warning identifies the actual placed card without exposing its ID`,()=>{
  const slots=Object.freeze(['canonical:owned-overlap','canonical:first']);
  const labels=occupiedDecorLabels(slots,placed,name,t('yard.persistent.unknownItem'));
  assert.equal(labels,`${pot} · 2, ${pot} · 1`);
  const warning=t('yard.canonical.food.occupied',{slots:labels});
  assert.ok(warning.includes(labels));assert.doesNotMatch(warning,/canonical:|owned-overlap|leaf_pot/);
  assert.equal(placed[1].slotId,'canonical:owned-overlap');assert.deepEqual(slots,['canonical:owned-overlap','canonical:first']);
 });
 test(`${language}: missing and unsupported records use the localized generic fallback`,()=>{
  for(const slots of [[],null,['canonical:missing'],['leaf_pot']])assert.equal(occupiedDecorLabels(slots,placed,name,t('yard.persistent.unknownItem')),fallback);
  assert.equal(occupiedDecorLabels(['canonical:owned-overlap'],[],name,fallback),fallback);
  const unknown=Object.freeze([Object.freeze({slotId:'canonical:unknown',goodieId:'future_internal_item'})]);
  assert.equal(occupiedDecorLabels(['canonical:unknown'],unknown,name,fallback),`${fallback} · 1`);
  const warning=t('yard.canonical.food.occupied',{slots:occupiedDecorLabels(['canonical:missing'],placed,name,fallback)});
  assert.ok(warning.includes(fallback));assert.doesNotMatch(warning,/canonical:|missing|future_internal_item/);
 });
}
