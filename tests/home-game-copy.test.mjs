import test from 'node:test';
import assert from 'node:assert/strict';
import {homeGameCopy,HOME_GAME_COPY} from '../src/app/homeGameCopy.js';
test('all visible games have concise bilingual descriptions and preserve fallback names',()=>{
 for(const language of ['en','ru'])for(const id of ['garden','blox','match3','merge','bubbo','trivia','room']){
  const copy=homeGameCopy(id,language,'Localized title');
  assert.ok(copy.description.length>=20&&copy.description.length<=100,`${language}:${id}`);
  assert.equal(copy.title,HOME_GAME_COPY[language][id].title||'Localized title');
 }
});
test('Blox explains placement and clearing, not falling pieces',()=>{
 assert.match(homeGameCopy('blox','en').description,/Place block shapes/);
 assert.match(homeGameCopy('blox','ru').description,/Размещайте фигуры/);
 assert.doesNotMatch(JSON.stringify(HOME_GAME_COPY),/tetris|тетрис|падающ/i);
});
test('unknown language and unknown game retain usable fallbacks',()=>{
 assert.deepEqual(homeGameCopy('bubbo','xx','Fallback'),homeGameCopy('bubbo','en','Fallback'));
 assert.deepEqual(homeGameCopy('unknown','ru','Translated'),{title:'Translated',description:''});
});
