import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isBubboDanger} from '../src/game-core/bubbo/engine.js';
import {composeBubbo, bubboFieldGeometry} from '../src/games/bubbo/bubboComposition.js';
import {bubboCellCenter} from '../src/games/bubbo/bubboAim.js';

for (const [width,height] of [[320,568],[390,844],[568,320],[844,390]]) {
  for (const safe of [{},{top:24,bottom:34,left:12,right:12}]) {
    test(`loss line matches bubble lower edge at ${width}x${height} safe ${JSON.stringify(safe)}`, () => {
      const {field}=composeBubbo({width,height,safe});
      const g=bubboFieldGeometry(field.width,field.height);
      for (const [row,pressureStep,loses] of [[8,0,false],[8,.999,false],[9,0,true],[9,.001,true],[10,0,true]]) {
        const board=Array.from({length:11},()=>Array(9).fill(null));
        board[row][4]='mint';
        assert.equal(isBubboDanger(board),loses);
        const edge=bubboCellCenter(g,row,4,0,pressureStep).y+g.radius;
        assert.equal(edge >= g.dangerY-1e-8,loses,`row ${row}, pressure ${pressureStep}: edge ${edge}, line ${g.dangerY}`);
        if(row===9&&pressureStep===0) assert.ok(Math.abs(edge-g.dangerY)<1e-8,'contact is the loss threshold');
      }
      assert.ok(g.dangerY<g.cannonY,'boundary stays above cannon');
    });
  }
}
