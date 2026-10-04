/** Code-owned rollout only. No save, HTTP field, query, environment or client flag
 * can grant release acceptance. Source/media acceptance remains independently closed. */
export const YARD_PLAYER_RELEASE_POLICY = Object.freeze({
  revision: 'yard-player-rollout/closed-r1',
  enabled: false,
});
export function hasPersistentYardStorage(player) {
  return !!player && Object.hasOwn(player, '_yardV2');
}
export function usesPersistentYard(player) {
  return YARD_PLAYER_RELEASE_POLICY.enabled || hasPersistentYardStorage(player);
}
