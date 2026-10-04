// These reviewed opaque landscapes contain natural green foliage. The legacy
// chroma-key heuristic is for cutout sprites, not these exact native-art exports.
// An edited file or another path must return to the ordinary chroma audit.
const approvedOpaqueLandscapeHashes = Object.freeze({
  'ui/illustrated-v2/world-map-archipelago-base.webp': 'fa35cc9cfd9ecf82ca3c4f255347e8ce5c1abf61c29a859c71fdc6763dca14ad',
  'ui/illustrated-v2/expedition-thumb-drowned-ruins.webp': 'b0804dbe4ec5c26433f6ee1beaba35335841bf419b835593130d0999dd8e1a95',
});

export function isApprovedOpaqueLandscape(relativePath, sha256, hasTransparency) {
  return hasTransparency === false
    && typeof sha256 === 'string'
    && Object.hasOwn(approvedOpaqueLandscapeHashes, relativePath)
    && approvedOpaqueLandscapeHashes[relativePath] === sha256;
}
