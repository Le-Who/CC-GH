import { getMergePairResult } from "../../../game-logic.js";

export function resolveMergeTapSelection({
  board = [],
  selectedCell = null,
  r,
  c,
  item = board[r]?.[c],
  trashMode = false,
} = {}) {
  if (trashMode) {
    return item
      ? { action: "trash", target: { r, c }, selectedCell }
      : { action: "noop", selectedCell };
  }
  if (!item) {
    return { action: "clear", selectedCell: null };
  }
  if (!selectedCell) {
    return { action: "select", selectedCell: { r, c } };
  }
  if (selectedCell.r === r && selectedCell.c === c) {
    return { action: "clear", selectedCell: null };
  }

  const source = board[selectedCell.r]?.[selectedCell.c];
  if (source && getMergePairResult(source, item)) {
    return {
      action: "merge",
      from: { r: selectedCell.r, c: selectedCell.c },
      to: { r, c },
      selectedCell: null,
    };
  }

  return {
    action: "miss",
    from: { r: selectedCell.r, c: selectedCell.c },
    to: { r, c },
    selectedCell: { r, c },
  };
}
