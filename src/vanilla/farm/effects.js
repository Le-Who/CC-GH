/* ═══════════════════════════════════════════════════
 *  Farm Module — Visual Effects (Particles)
 *  Dirt splash on plant, sparkle on harvest.
 *  Separate from shared effects.js (coin fly, water drops).
 * ═══════════════════════════════════════════════════ */

/** Spawn dirt splash particles when planting */
export function spawnDirtSplash(targetEl) {
  if (!targetEl || document.hidden) return;
  const rect = targetEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height - 20;

  for (let i = 0; i < 6; i++) {
    const particle = document.createElement("div");
    particle.className = "farm-dirt-particle";
    particle.style.left = `${cx}px`;
    particle.style.top = `${cy}px`;
    particle.style.setProperty("--vx", `${(Math.random() - 0.5) * 80}px`);
    particle.style.setProperty("--vy", `${-(Math.random() * 40 + 20)}px`);
    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), 600);
  }
}

/** Spawn sparkle particles when harvesting */
export function spawnFarmSparkle(targetEl) {
  if (!targetEl || document.hidden) return;
  const rect = targetEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  for (let i = 0; i < 8; i++) {
    const particle = document.createElement("div");
    particle.className = "farm-sparkle-particle";
    particle.textContent = "✨";
    particle.style.left = `${cx}px`;
    particle.style.top = `${cy}px`;
    particle.style.setProperty("--vx", `${(Math.random() - 0.5) * 100}px`);
    particle.style.setProperty("--vy", `${(Math.random() - 0.5) * 100}px`);
    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), 800);
  }
}
