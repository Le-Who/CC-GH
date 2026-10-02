const PLAYZONE_ROW_STEP = 2;

const YARD_PLAYZONE_ROWS = {
  meadow: [[],[],[],[],[],[],[],[],[],[],[[47.2,52.6]],[[38.2,64.2]],[[37,73]],[[39.1,75.4]],[[36.8,76.4]],[[28.1,75.1]],[[22.7,75.1]],[[20.5,80.2]],[[15.8,85.9]],[[14.5,87.8]],[[14.6,100]],[[12.7,95.5]],[[7.7,95.2]],[[4.2,92.3]],[[0,90.1]],[[0,89.7]],[[0,91.6]],[[0,100]],[[0,100]],[[0,100]],[[0,100]],[[0,100]],[[0,100]],[[0,100]],[[0,9.7],[10.9,100]],[[12,100]],[[11.9,100]],[[13.4,96.4]],[[13,85.4],[88.7,93.1]],[[11,86.1],[87.8,94]],[[11.8,84.2]],[[10.5,82.3]],[[10.9,84.3]],[[13,81.3]],[[19.6,75.4]],[[20.7,65.9],[67.1,71.5]],[[22.7,71.8]],[[27.5,68]],[[26.5,65.7]],[[29.2,66.8]],[[22.7,66.5]]],
  moon_garden: [[],[],[],[],[],[],[],[],[],[],[],[[13.3,21.9],[36.5,41.7]],[[15.4,40]],[[17.5,44.6]],[[19.6,59.2]],[[14.9,70.8]],[[16,70.9]],[[0,81.1]],[[0,86.9]],[[0,89.3]],[[0,100]],[[5,100]],[[7.6,100]],[[10.1,100]],[[12.9,100]],[[18,100]],[[15.7,100]],[[12.8,100]],[[0,100]],[[0,100]],[[0,100]],[[4,8.2],[10.4,100]],[[13.1,100]],[[18.6,100]],[[26.5,100]],[[27.9,92.3],[95.9,100]],[[29.2,81.2]],[[25.5,79.7]],[[28.5,79.5]],[[32.3,79.7]],[[30.7,78.2]],[[29.1,84.7],[93.4,100]],[[20.9,100]],[[19.7,91]],[[10.9,87.5]],[[6.8,84.3]],[[10.8,83]],[[17.8,81.5]],[[21.6,79.8]],[[21,76.1]],[[0,14.1],[16.5,100]]],
  tea_house: [[],[],[],[],[],[],[],[],[],[[72.8,80]],[[67.2,79.8]],[[32,38.6],[63.9,80.1]],[[27.5,39],[59.7,80.2]],[[30.4,80]],[[36.4,80.4]],[[37.8,80.3]],[[29.1,80]],[[23.3,85.1]],[[14.4,85.4]],[[6.5,85.1]],[[0,70.2],[71.5,86.8]],[[0,70.3],[78.6,83.1]],[[0,70.1]],[[0,67.7]],[[0,68.5]],[[0,67.5]],[[0,67.9]],[[0,69],[96,100]],[[0,80.6],[85.2,100]],[[0,100]],[[0,100]],[[0,100]],[[0,100]],[[0,100]],[[9.5,85],[92.7,100]],[[17.1,82.3]],[[18.7,82.8]],[[19.1,79.5]],[[24,73.3]],[[25.3,69.5]],[[26.5,68.4]],[[28.7,68.1]],[[29.5,67.6]],[[32.5,69.1]],[[35.4,67.6]],[[35.6,65.6]],[[32.5,66.9]],[[27.8,61.5],[62.6,68.4]],[[21.8,68.6]],[[0,70.8]],[[0,71.8]]],
};

function clampPercent(value, fallback = 50) {
  const number = Number(value);
  return Math.max(0, Math.min(100, Number.isFinite(number) ? number : fallback));
}

function normalizeRemodelId(remodelId) {
  const id = String(remodelId || "meadow");
  return YARD_PLAYZONE_ROWS[id] ? id : "meadow";
}

function rowIndexForY(y) {
  return Math.max(0, Math.min(50, Math.round(clampPercent(y) / PLAYZONE_ROW_STEP)));
}

function rowY(rowIndex) {
  return Math.max(0, Math.min(100, rowIndex * PLAYZONE_ROW_STEP));
}

function rowsForRemodel(remodelId) {
  return YARD_PLAYZONE_ROWS[normalizeRemodelId(remodelId)];
}

function rowContainsX(row, x, margin = 0) {
  return row.some(([left, right]) => x >= left + margin && x <= right - margin);
}

export function isYardPointInPlayzone(remodelId, x, y, options = {}) {
  const safeX = clampPercent(x);
  const rows = rowsForRemodel(remodelId);
  const row = rows[rowIndexForY(y)] || [];
  const margin = Math.max(0, Number(options.margin) || 0);
  return rowContainsX(row, safeX, margin);
}

export function clampYardPointToPlayzone(remodelId, point = {}, options = {}) {
  const safeX = clampPercent(point.x);
  const safeY = clampPercent(point.y, 70);
  const rows = rowsForRemodel(remodelId);
  const margin = Math.max(0, Number(options.margin) || 0);
  if (isYardPointInPlayzone(remodelId, safeX, safeY, { margin })) {
    return { x: safeX, y: safeY };
  }

  const preferredRow = rowIndexForY(safeY);
  let best = null;
  for (let offset = 0; offset < rows.length; offset += 1) {
    for (const rowIndex of [preferredRow - offset, preferredRow + offset]) {
      if (rowIndex < 0 || rowIndex >= rows.length) continue;
      const intervals = rows[rowIndex] || [];
      for (const [rawLeft, rawRight] of intervals) {
        const left = Math.min(rawRight, rawLeft + margin);
        const right = Math.max(left, rawRight - margin);
        const x = Math.max(left, Math.min(right, safeX));
        const y = rowY(rowIndex);
        const distance = Math.hypot(x - safeX, y - safeY);
        if (!best || distance < best.distance) best = { x, y, distance };
      }
    }
    if (best && offset > 3) break;
  }

  return best ? { x: best.x, y: best.y } : { x: 50, y: 70 };
}

export function getYardPlayzoneRows(remodelId) {
  return rowsForRemodel(remodelId).map((row) => row.map(([left, right]) => [left, right]));
}
