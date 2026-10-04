/** Presentation-only camera calibration. Never converts or writes saved coordinates. */
const point = (value, name) => {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) throw new Error(`Invalid ${name}`);
  return value;
};
const positive = (value, name) => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${name}`);
  return value;
};

export function cameraBasis(direction) {
  if (!Array.isArray(direction) || direction.length !== 3 || direction.some(n => !Number.isFinite(n))) throw new Error('Invalid camera direction');
  const [x, y, z] = direction, h = Math.hypot(x, y), length = Math.hypot(h, z);
  const elevation = z / length;
  if (!Number.isFinite(h) || !Number.isFinite(length) || !h || !Number.isFinite(elevation) || elevation < 1e-6) throw new Error('Camera must have a stable downward ground projection');
  return {right: [-y / h, x / h, 0], down: [x / h * elevation, y / h * elevation, -h / length]};
}

function worldOnCamera(position, basis, worldOrigin, unitsPerWorld) {
  point(position, 'world position');
  const z = position.z ?? 0;
  if (!Number.isFinite(z)) throw new Error('Invalid world height');
  // XY is persisted logical yard space; Z is the source's Blender-world height.
  const x = (position.x - worldOrigin.x) / unitsPerWorld, y = (position.y - worldOrigin.y) / unitsPerWorld;
  return {x: basis.right[0] * x + basis.right[1] * y, y: basis.down[0] * x + basis.down[1] * y + basis.down[2] * z};
}

export function maskBoundaryPoints(rows) {
  if (!Array.isArray(rows) || rows.length !== 51) throw new Error('Expected the source-owned 2-unit yard mask');
  return rows.flatMap((row, index) => {
    if (!Array.isArray(row)) throw new Error('Invalid mask row');
    return row.flatMap(interval => {
      if (!Array.isArray(interval) || interval.length !== 2 || !interval.every(Number.isFinite)
        || interval[0] < 0 || interval[1] > 100 || interval[0] >= interval[1]) throw new Error('Invalid mask interval');
      return interval.map(x => ({x, y: index * 2}));
    });
  });
}

/** A rectangle validator samples both bounding rows. Intersect adjacent rows so
 * the guide never paints a ledge that its footprint validator will reject. */
export function conservativeMaskStrips(rows) {
  maskBoundaryPoints(rows);
  return rows.slice(0, -1).flatMap((row, index) => row.flatMap(([left, right]) => rows[index + 1].flatMap(([nextLeft, nextRight]) => {
    const x = Math.max(left, nextLeft), end = Math.min(right, nextRight);
    return end > x ? [{x, y: index * 2, width: end - x, height: 2}] : [];
  })));
}

/** Fit the real ground into an authored art rectangle using one uniform scale. */
export function calibrateGround({cameraDirection, maskRows, artSize, groundArea, worldOrigin = {x: 50, y: 60}, unitsPerWorld = 8, revision}) {
  const basis = cameraBasis(cameraDirection);
  point(worldOrigin, 'world origin'); point(groundArea, 'ground area');
  positive(unitsPerWorld, 'world units'); positive(artSize?.width, 'art width'); positive(artSize?.height, 'art height');
  positive(groundArea.width, 'ground width'); positive(groundArea.height, 'ground height');
  if (!revision || groundArea.x < 0 || groundArea.y < 0 || groundArea.x + groundArea.width > artSize.width
    || groundArea.y + groundArea.height > artSize.height) throw new Error('Ground area must fit the authored artwork');
  const points = maskBoundaryPoints(maskRows).map(p => worldOnCamera(p, basis, worldOrigin, unitsPerWorld));
  if (!points.length) throw new Error('Empty ground mask');
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  const pixelsPerWorld = Math.min(groundArea.width / positive(maxX - minX, 'projected width'), groundArea.height / positive(maxY - minY, 'projected height'));
  return {
    revision, cameraDirection: [...cameraDirection], worldOrigin: {...worldOrigin}, unitsPerWorld,
    artSize: {...artSize}, pixelsPerWorld,
    artOrigin: {x: groundArea.x + (groundArea.width - (maxX - minX) * pixelsPerWorld) / 2 - minX * pixelsPerWorld,
      y: groundArea.y + (groundArea.height - (maxY - minY) * pixelsPerWorld) / 2 - minY * pixelsPerWorld},
  };
}

/** The image, sprites, ground overlay and pointer inverse all share this affine map.
 * A viewport adapter supplies the single uniform artwork scale and offset; it must
 * not independently apply CSS object-fit:cover to the background. */
export function createCalibratedProjection(calibration, {width, height, artScale, artOffset = {x: 0, y: 0}}) {
  positive(width, 'viewport width'); positive(height, 'viewport height'); positive(artScale, 'artwork scale'); point(artOffset, 'artwork offset');
  const {cameraDirection, worldOrigin, unitsPerWorld, pixelsPerWorld, artOrigin, artSize, revision} = calibration;
  if (!revision) throw new Error('A named render calibration is required');
  const basis = cameraBasis(cameraDirection);
  point(worldOrigin, 'world origin'); point(artOrigin, 'art origin'); positive(unitsPerWorld, 'world units'); positive(pixelsPerWorld, 'pixel scale');
  positive(artSize?.width, 'art width'); positive(artSize?.height, 'art height');
  const ppu = positive(pixelsPerWorld * artScale, 'scaled pixel size');
  const center = {x: artOffset.x + artOrigin.x * artScale, y: artOffset.y + artOrigin.y * artScale};
  const [r, s] = basis.right, [u, v] = basis.down, determinant = r * v - s * u;
  const project = position => {const p = worldOnCamera(position, basis, worldOrigin, unitsPerWorld); return {x: center.x + ppu * p.x, y: center.y + ppu * p.y};};
  const unproject = position => {
    point(position, 'screen position');
    const a = (position.x - center.x) / ppu, b = (position.y - center.y) / ppu;
    return {x: worldOrigin.x + unitsPerWorld * (a * v - s * b) / determinant, y: worldOrigin.y + unitsPerWorld * (r * b - a * u) / determinant};
  };
  return {width, height, ppu, basis, calibrationRevision: revision, project, unproject,
    artwork: {left: artOffset.x, top: artOffset.y, width: artSize.width * artScale, height: artSize.height * artScale, scale: artScale}};
}

/** Arrow movement follows screen direction after any camera azimuth change. */
export function offsetWorldPoint(projection, position, delta) {
  point(delta, 'screen offset');
  const screen = projection.project(position);
  return projection.unproject({x: screen.x + delta.x, y: screen.y + delta.y});
}

/** Fail closed before mixing a new camera with old perspective atlas pixels. */
export function assertRenderCalibration(calibration, mediaCalibration) {
  if (!mediaCalibration || mediaCalibration.revision !== calibration.revision
    || !Array.isArray(mediaCalibration.cameraDirection) || mediaCalibration.cameraDirection.length !== 3
    || mediaCalibration.cameraDirection.some((n, i) => n !== calibration.cameraDirection[i])
    || mediaCalibration.unitsPerWorld !== calibration.unitsPerWorld) throw new Error('Sprite pixels do not match the scene camera calibration');
  return true;
}
