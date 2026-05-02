function hasBoard(run) {
  return Array.isArray(run?.board) && run.board.length > 0;
}

export function selectMatch3InitialRun(snapshot, createDefaultRun) {
  const current = snapshot?.match3?.currentGame || snapshot?.match3?.game || null;
  if (hasBoard(current)) {
    return {
      board: current.board,
      score: Math.max(0, Number(current.score) || 0),
      movesLeft: Math.max(0, Number(current.movesLeft) || 0),
      combo: Math.max(0, Number(current.combo) || 0),
      mode: current.mode || current.gameMode || "classic",
      restored: true,
    };
  }
  return { ...createDefaultRun(current?.mode || "classic"), restored: false };
}
