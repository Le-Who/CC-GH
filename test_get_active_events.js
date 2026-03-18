import { getActiveEvents } from './game-logic/meta.js';

console.time('getActiveEvents');
for (let i = 0; i < 100000; i++) {
  getActiveEvents();
}
console.timeEnd('getActiveEvents');
