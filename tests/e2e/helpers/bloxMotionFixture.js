import { PIECES } from '../../../game-logic/blox-pieces.js';
import { createEmptyBoard, previewBloxPlacement, DEFAULT_BLOX_ROTATE_CHARGES } from '../../../game-logic/blox-engine.js';

/** A reachable saved run, not a hand-painted board or synthetic clear result.
 * Two catalog i4 pieces legally occupy row 4; the remaining catalog h2 fills
 * the last two cells. The browser submits that final move through BloxGame.
 * This fixture does not replace browser engines, randomness, clocks or motion.
 */
export function createBloxLineClearFixture() {
  const tray = ['i4', 'i4', 'h2'].map(id => {
    const piece = PIECES.find(candidate => candidate.id === id);
    if (!piece) throw new Error(`Missing production Blox piece: ${id}`);
    return { piece: structuredClone(piece), placed: false };
  });
  const initial = { board: createEmptyBoard(), tray, score: 0, linesCleared: 0,
    rotateCharges: DEFAULT_BLOX_ROTATE_CHARGES, highScore: 0, gameActive: true };
  const setupPlacements = [{ pieceIdx: 0, row: 4, col: 0 }, { pieceIdx: 1, row: 4, col: 4 }];
  let savedState = initial;
  for (const placement of setupPlacements) {
    const next = previewBloxPlacement(savedState, placement);
    if (!next.valid || next.clear.cleared) throw new Error('Blox fixture setup must be legal and cannot clear early');
    savedState = next.state;
  }
  return { initial, setupPlacements, savedState, placement: { pieceIdx: 2, row: 4, col: 8 } };
}
