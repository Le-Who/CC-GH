/** Bounded, presentation-only tracks. Never schedule gameplay or await animation. */
export function createFeedbackTrack(layer, { limit = 64 } = {}) {
  const tracks = new Map();
  const remove = node => { tracks.delete(node); node.parent?.removeChild(node); node.destroy?.({ children: true }); };
  return {
    add(node, { duration = 240, delay = 0, dx = 0, dy = 0, from = 1, peak = 1, to = 1, reduced = false, fade = true } = {}) {
      while (tracks.size >= limit) remove(tracks.keys().next().value);
      const track = { age: 0, duration: Math.max(1, duration), delay: Math.max(0, delay), x: node.x, y: node.y, sx: node.scale.x, sy: node.scale.y, alpha: node.alpha, dx: reduced ? 0 : dx, dy: reduced ? 0 : dy, from: reduced ? 1 : from, peak: reduced ? 1 : peak, to: reduced ? 1 : to, fade };
      node.eventMode = 'none'; node.interactiveChildren = false;
      node.scale.set(track.sx * track.from, track.sy * track.from);
      if (track.delay) node.alpha = 0;
      tracks.set(node, track); layer.addChild(node); return node;
    },
    tick(deltaMS = 1000 / 60) {
      const delta = Math.min(50, Math.max(0, Number.isFinite(deltaMS) ? deltaMS : 1000 / 60));
      for (const [node, t] of tracks) {
        if (node.destroyed) { tracks.delete(node); continue; }
        t.age += delta;
        const elapsed = t.age - t.delay;
        if (elapsed < 0) continue;
        const p = Math.min(1, elapsed / t.duration), ease = 1 - (1 - p) ** 3;
        const part = p < .42 ? p / .42 : (p - .42) / .58;
        const smooth = part * part * (3 - 2 * part);
        const scale = p < .42 ? t.from + (t.peak - t.from) * smooth : t.peak + (t.to - t.peak) * smooth;
        node.x = t.x + t.dx * ease; node.y = t.y + t.dy * ease;
        node.scale.set(t.sx * scale, t.sy * scale);
        node.alpha = t.alpha * (t.fade ? 1 - p * p : 1);
        if (p >= 1) remove(node);
      }
    },
    clear() { for (const node of [...tracks.keys()]) remove(node); },
    get size() { return tracks.size; },
  };
}
