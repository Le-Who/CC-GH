/** Code-owned rollout only. No save, HTTP field, query, environment or client flag
 * can grant release acceptance. Source/media acceptance remains independently closed. */
export const YARD_PLAYER_RELEASE_POLICY = Object.freeze({
  revision: 'yard-player-rollout/closed-r1',
  enabled: false,
  // Fill with the verified closed release build/digest in the reviewed activation commit.
  // Deployment refuses enabled rollout until that exact predecessor is healthy.
  requiredClosedPredecessor: null,
  // Historical successful deployment 37142937097, image job 111267028671.
  // The guard must still verify this exact image is the live healthy predecessor.
  requiredLegacyPredecessor: Object.freeze({
    buildId: '84d252d4bee6ed75fe8d32c07ebdef4c9270c629',
    imageDigest: 'sha256:729955b34481c629980e5a04606a88531d9ba1691e69312c9dcd366571e4380d',
  }),
});
export function hasPersistentYardStorage(player) {
  return !!player && Object.hasOwn(player, '_yardV2');
}
export function usesPersistentYard(player) {
  return YARD_PLAYER_RELEASE_POLICY.enabled || hasPersistentYardStorage(player);
}
