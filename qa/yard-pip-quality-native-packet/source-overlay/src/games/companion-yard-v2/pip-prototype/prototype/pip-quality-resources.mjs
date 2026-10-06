// Explicit local A/B only. These are known buffers, not total browser/GPU RAM.
export const PIP_QUALITY_COPY = Object.freeze({
  version: 'pip-quality-copy-probe-v1', width: 390, height: 648,
  colorBytes: 390 * 648 * 4, colorPeakBytes: 390 * 648 * 8,
  geometryCPUBytes: 36, geometryGPUBytes: 36, copies: 1, draws: 1,
});
export function validatePipQualityMode(mode) {
  if (!['off', 'contact', 'identity', 'exterior'].includes(mode)) throw Error('Unknown local Pip quality probe');
  return mode;
}
export function pipQualityResourceFields(mode = 'off') {
  validatePipQualityMode(mode);
  if (mode === 'off' || mode === 'contact') return {};
  return {
    qualityProbeVersion: PIP_QUALITY_COPY.version,
    qualityCopyColorBytes: PIP_QUALITY_COPY.colorBytes,
    // Reserve old + new even on first allocation/context restoration. CSS
    // resize never replaces this fixed texture; physical release is unknown.
    qualityCopyColorPeakBytes: PIP_QUALITY_COPY.colorPeakBytes,
    qualityGeometryCPUBytes: PIP_QUALITY_COPY.geometryCPUBytes,
    qualityGeometryGPUBytes: PIP_QUALITY_COPY.geometryGPUBytes,
    qualityExtraCopies: PIP_QUALITY_COPY.copies, qualityExtraDraws: PIP_QUALITY_COPY.draws,
    qualityDriverAndProgramOverheadKnown: false,
  };
}
export function validPipQualityResourceFields(row) {
  const keys = Object.keys(row).filter(key => key.startsWith('quality'));
  if (!keys.length) return true;
  const expected = pipQualityResourceFields('identity');
  return keys.length === Object.keys(expected).length && keys.every(key => row[key] === expected[key]);
}
