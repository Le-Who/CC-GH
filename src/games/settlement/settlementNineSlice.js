// Runtime UV composition only: source pixels and source alpha remain immutable.
export function makeUvNineSlice({ sourceWidth, sourceHeight, x = 0, y = 0, width, height, corner }) {
  const values = [sourceWidth, sourceHeight, x, y, width, height, corner];
  if (values.some(value => !Number.isFinite(value)) || sourceWidth <= 0 || sourceHeight <= 0 || x < 0 || y < 0 || width <= 0 || height <= 0 || corner <= 0 || corner * 2 >= Math.min(width, height) || x + width > sourceWidth || y + height > sourceHeight) {
    throw new RangeError('Invalid source UV or nine-slice corner');
  }
  const columns = [
    { name: 'left', source: x, size: corner, target: { left: 0, width: 'var(--settlement-frame-corner, 16px)' } },
    { name: 'center', source: x + corner, size: width - corner * 2, target: { left: 'var(--settlement-frame-corner, 16px)', right: 'var(--settlement-frame-corner, 16px)' } },
    { name: 'right', source: x + width - corner, size: corner, target: { right: 0, width: 'var(--settlement-frame-corner, 16px)' } }
  ];
  const rows = [
    { name: 'top', source: y, size: corner, target: { top: 0, height: 'var(--settlement-frame-corner, 16px)' } },
    { name: 'middle', source: y + corner, size: height - corner * 2, target: { top: 'var(--settlement-frame-corner, 16px)', bottom: 'var(--settlement-frame-corner, 16px)' } },
    { name: 'bottom', source: y + height - corner, size: corner, target: { bottom: 0, height: 'var(--settlement-frame-corner, 16px)' } }
  ];
  const percentage = value => `${Number(value.toFixed(8))}%`;
  return rows.flatMap(row => columns.map(column => ({
    id: `${row.name}-${column.name}`,
    source: { x: column.source, y: row.source, width: column.size, height: row.size },
    style: {
      ...column.target,
      ...row.target,
      backgroundSize: `${percentage(sourceWidth / column.size * 100)} ${percentage(sourceHeight / row.size * 100)}`,
      backgroundPosition: `${percentage(column.source / (sourceWidth - column.size) * 100)} ${percentage(row.source / (sourceHeight - row.size) * 100)}`
    }
  })));
}

