/** Recovered game-only source from the owned Blox v2 r2 preview. See recovery manifest. */
import {GRID} from '../../../game-logic/blox-pieces.js';

function bloxKeyboardIntent({
  key:key,
  repeat:repeat=false
}, cell){
  const direction={
    ArrowUp:[-1, 0],
    ArrowDown:[1, 0],
    ArrowLeft:[0, -1],
    ArrowRight:[0, 1]
  }
  [key];
  return direction?{
    type:"move",
    cell:{
      row:Math.max(0, Math.min(9, cell.row+direction[0])),
      col:Math.max(0, Math.min(9, cell.col+direction[1]))
    }
  }:key==="Enter"||key===" "?{
    type:repeat?"ignore":"place",
    cell:cell
  }:key==="Escape"?{
    type:repeat?"ignore":"pause"
  }:null
}
function bloxTrayPieceLayout(piece, card, cell){
  const cells=piece?.cells?.length?piece.cells:[[0, 0]];
  const minRow=Math.min(...cells.map(([g])=>g));
  const minCol=Math.min(...cells.map(([, g])=>g));
  const rows=Math.max(...cells.map(([g])=>g))-minRow+1;
  const cols=Math.max(...cells.map(([, g])=>g))-minCol+1;
  const unit=Math.min(cell*.86, (card.width-16)/cols, (card.height-16)/rows, 52);
  return{
    unit:unit,
    rows:rows,
    cols:cols,
    left:card.left+(card.width-cols*unit)/2-minCol*unit,
    top:card.top+(card.height-rows*unit)/2-minRow*unit
  }
}

export {bloxKeyboardIntent,bloxTrayPieceLayout};
