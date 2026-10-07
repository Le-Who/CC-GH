/** An expected server throttle is not a player-facing failure. The receipt is
 * still returned and recorded; this function never acknowledges or retries it. */
export function isExpectedGardenTapCooldown(action, payload, error) {
  return action === 'garden.r2' && payload?.command === 'tend' && error === 'GARDEN_R2_TAP_COOLDOWN';
}
