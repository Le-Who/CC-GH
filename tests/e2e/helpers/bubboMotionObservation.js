/** Browser-side, read-only recorder for short Bubbo reactions.
 * Install before release: a remote Playwright assertion/screenshot can outlive
 * the 420 ms burst or 1800 ms reward label even when both rendered correctly.
 * No game clocks, TTLs, RAF scheduling or app state are changed here.
 */
export function observeBubboShot(canvas, expectedShot) {
  window.__bubboShotObservation?.stop();
  const lane = canvas.closest('.bb-stage').querySelector('.bb-status');
  const oldReward = lane.querySelector('.bb-reward-feedback');
  const data = {
    expectedShot, firstResultFrame: null, maxEffects: 0, positiveSamples: 0,
    reward: null, transitions: [],
  };
  let previous = '';
  const sample = () => {
    if (Number(canvas.dataset.shots) !== expectedShot || document.hidden) return;
    const frame = JSON.parse(canvas.dataset.bubboFx);
    const now = performance.now();
    data.firstResultFrame ??= { ...frame, at: now };
    data.maxEffects = Math.max(data.maxEffects, frame.effects);
    if (frame.effects > 0) data.positiveSamples++;
    const reward = lane.querySelector('.bb-reward-feedback');
    // React keys a new result to a new node. An earlier reward still inside its
    // TTL must not satisfy the next shot's feedback contract.
    if (!data.reward && reward && reward !== oldReward) {
      const style = getComputedStyle(reward);
      const box = reward.getBoundingClientRect();
      if (style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) > 0
          && box.width > 0 && box.height > 0 && box.right > 0 && box.bottom > 0
          && box.left < innerWidth && box.top < innerHeight) {
        data.reward = { text: reward.textContent.trim(), at: now, visible: true,
          bounds: { x: box.x, y: box.y, width: box.width, height: box.height } };
      }
    }
    const signature = JSON.stringify([frame.effects, !!data.reward, frame.playing]);
    if (signature !== previous) {
      data.transitions.push({ effects: frame.effects, reward: data.reward?.text || null, playing: frame.playing, at: now });
      if (data.transitions.length > 64) data.transitions.shift();
      previous = signature;
    }
  };
  const observer = new MutationObserver(sample);
  observer.observe(canvas, { attributes: true, attributeFilter: ['data-bubbo-fx'] });
  observer.observe(lane, { subtree: true, childList: true, attributes: true, characterData: true });
  window.__bubboShotObservation = { data, stop: () => observer.disconnect() };
  sample();
}
