/* ═══════════════════════════════════════════════════
 *  Game Hub — Shared Effects Module (v6.2.1)
 *  Centralised visual + audio effects.
 *  Previously: perlinShake was duplicated in match3.js and blox.js.
 *  Now: single source of truth for all spFX.
 *
 *  Exports:
 *    perlinShake(el, intensity, durationMs)
 *    colorSplash(el, color, durationMs?)
 *    debounce(fn, wait)
 *    SoundEngine  — Web Audio API synthesis + Vibration API
 * ═══════════════════════════════════════════════════ */

/* ─── Perlin Noise Screen Shake ─── */
function _hashNoise(x) {
  const n = Math.sin(x * 127.1 + x * 311.7) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1; // -1..+1
}
function _smoothNoise(t) {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return _hashNoise(i) * (1 - u) + _hashNoise(i + 1) * u;
}

/**
 * Organic Perlin-noise screen shake with linear decay.
 * Compositor-only: only writes transform, never triggers layout.
 * @param {HTMLElement} el       — element to shake
 * @param {number} intensity     — max pixel displacement
 * @param {number} durationMs    — total shake duration in ms
 */
export function perlinShake(el, intensity, durationMs) {
  if (!el || document.hidden) return; // skip if tab is backgrounded
  const start = performance.now();
  const seed = Math.random() * 1000;
  function frame(now) {
    const elapsed = now - start;
    if (elapsed >= durationMs) {
      el.style.transform = "";
      return;
    }
    const decay = 1 - elapsed / durationMs;
    const t = elapsed * 0.015;
    const x = _smoothNoise(seed + t) * intensity * decay;
    const y = _smoothNoise(seed + t + 100) * intensity * decay;
    const r = _smoothNoise(seed + t + 200) * intensity * 0.15 * decay;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r.toFixed(2)}deg)`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/**
 * Brief color splash — board background flares with gem/harvest color.
 * Uses box-shadow inset so it never touches layout.
 * @param {HTMLElement} el      — element to flash
 * @param {string} color        — CSS color string (hex / hsl / rgb)
 * @param {number} durationMs   — fade-out duration (default 600ms)
 */
export function colorSplash(el, color, durationMs = 600) {
  if (!el) return;
  el.style.transition = "box-shadow 0s";
  el.style.boxShadow = `inset 0 0 60px 20px ${color}55`;
  requestAnimationFrame(() => {
    el.style.transition = `box-shadow ${durationMs}ms ease-out`;
    el.style.boxShadow = "";
  });
}

/**
 * Simple debounce — delays fn until `wait` ms after last call.
 * Returned function has a `.cancel()` method for cleanup on onLeave.
 * @param {Function} fn
 * @param {number} wait — debounce period in ms
 */
export function debounce(fn, wait) {
  let timer = null;
  function debounced(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  }
  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  debounced.flush = (...args) => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      fn(...args);
    }
  };
  return debounced;
}

/* ─── SoundEngine — Web Audio API synthesis + Vibration API ─── */
/**
 * Zero-asset audio engine: all sounds synthesised via Web Audio API.
 * No files, no network requests, no permissions needed.
 * Vibration API (navigator.vibrate) adds haptic feedback on Android.
 *
 * Volume persists in localStorage as 'hub_sfx_vol' (0–1, default 0.4).
 * Muted when volume === 0.
 */
export const SoundEngine = (() => {
  let _ctx = null;
  let _vol = parseFloat(localStorage.getItem("hub_sfx_vol") ?? "0.4");

  function _getCtx() {
    if (!_ctx) {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Browsers suspend AudioContext until user gesture
    if (_ctx.state === "suspended") _ctx.resume();
    return _ctx;
  }

  /**
   * @param {object} opts
   * @param {number}  opts.freq      — oscillator frequency (Hz)
   * @param {string}  [opts.type]    — OscillatorType: 'sine'|'square'|'triangle'|'sawtooth'
   * @param {number}  [opts.duration] — note duration (seconds)
   * @param {number}  [opts.gain]    — 0–1 per-note volume multiplier
   */
  function _playTone({
    freq = 440,
    type = "sine",
    duration = 0.1,
    gain = 0.5,
  }) {
    if (_vol <= 0) return;
    try {
      const c = _getCtx();
      const osc = c.createOscillator();
      const vol = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime);
      vol.gain.setValueAtTime(gain * _vol, c.currentTime);
      vol.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
      osc.connect(vol);
      vol.connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + duration);
    } catch (_) {
      /* AudioContext not available — ignore */
    }
  }

  function _vib(pattern) {
    navigator.vibrate?.(pattern);
  }

  return {
    /** Get / set volume (0–1). Persists to localStorage. */
    getVolume: () => _vol,
    setVolume: (v) => {
      _vol = Math.max(0, Math.min(1, v));
      localStorage.setItem("hub_sfx_vol", String(_vol));
    },

    /* ── Game events ── */
    /** Gem matches or single line clear */
    match() {
      _playTone({ freq: 660, type: "sine", duration: 0.08, gain: 0.35 });
      _vib(12);
    },
    /** Combo cascade — n increases pitch */
    combo(n = 1) {
      _playTone({
        freq: 440 + n * 80,
        type: "square",
        duration: 0.12,
        gain: 0.18,
      });
      _vib([18, 8, 18]);
    },
    /** Successful harvest */
    harvest() {
      _playTone({ freq: 880, type: "triangle", duration: 0.15, gain: 0.3 });
      _vib(22);
    },
    /** Successful merge (Gacha Merge board) */
    merge() {
      _playTone({ freq: 523, type: "sine", duration: 0.2, gain: 0.4 });
      _vib([10, 5, 30]);
    },
    /** Gacha / free pull */
    gacha() {
      _playTone({ freq: 784, type: "triangle", duration: 0.25, gain: 0.35 });
      _vib([15, 10, 25, 5, 40]);
    },
    /** Plant seed */
    plant() {
      _playTone({ freq: 440, type: "triangle", duration: 0.1, gain: 0.2 });
    },
    /** Invalid move / error */
    error() {
      _playTone({ freq: 200, type: "sawtooth", duration: 0.15, gain: 0.15 });
      _vib(45);
    },
    /** Multi-line clear (Blox) */
    multiLine() {
      _playTone({ freq: 740, type: "square", duration: 0.18, gain: 0.22 });
      _vib([20, 10, 40]);
    },
    /** Game over */
    gameOver() {
      _playTone({ freq: 180, type: "sawtooth", duration: 0.5, gain: 0.2 });
      _vib([80, 40, 80]);
    },
    /** Quest complete */
    questComplete() {
      _playTone({ freq: 660, type: "triangle", duration: 0.3, gain: 0.3 });
      _vib([20, 10, 20, 10, 40]);
    },
    /** Button click (light) */
    click() {
      _playTone({ freq: 1000, type: "sine", duration: 0.04, gain: 0.1 });
    },
  };
})();

/* ═══════════════════════════════════════════════════
 *  v7.1: Farm Juice — DOM Particle Helpers
 *  Pool-based, compositor-friendly (transform + opacity only).
 *  Max 30 particles active (per design performance budget).
 * ═══════════════════════════════════════════════════ */
const _particlePool = [];
const _PARTICLE_POOL_MAX = 30;

// [Phase 2] Global Event-Driven Garbage Collector
document.addEventListener("hub:route-leave", () => {
  for (const p of _particlePool) {
    if (p.parentElement) p.remove();
  }
  _particlePool.length = 0; // Clear references
});

function _getParticle() {
  // Recycle from pool if available
  for (const p of _particlePool) {
    if (!p.parentElement) {
      return p;
    }
  }
  if (_particlePool.length >= _PARTICLE_POOL_MAX) return null;
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;pointer-events:none;z-index:999;font-size:1rem;";
  _particlePool.push(el);
  return el;
}

/**
 * Spawn gold coin particles flying from sourceEl to the HUD gold counter.
 * @param {HTMLElement} sourceEl — element to fly coins from
 * @param {number} count — number of coins (default 3)
 */
export function spawnCoinFly(sourceEl, count = 3) {
  if (!sourceEl || document.hidden) return;
  const target =
    document.querySelector(".hud-gold") ||
    document.getElementById("hud-gold-text");
  if (!target) return;
  const srcRect = sourceEl.getBoundingClientRect();
  const tgtRect = target.getBoundingClientRect();

  for (let i = 0; i < count; i++) {
    const p = _getParticle();
    if (!p) break;
    p.textContent = "🪙";
    p.style.fontSize = "0.9rem";
    p.style.left = `${srcRect.left + srcRect.width / 2}px`;
    p.style.top = `${srcRect.top + srcRect.height / 2}px`;
    p.style.opacity = "1";
    p.style.transform = "scale(1)";
    p.style.transition = "none";
    document.body.appendChild(p);

    // OPTIMIZATION 3: Web Animations API (WAAPI)
    // Runs in compositor thread, no GC pauses from setTimeouts
    const animation = p.animate(
      [
        { transform: 'scale(1) translate(0px, 0px)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.4)`, opacity: 0.2 }
      ],
      {
        duration: 600,
        delay: i * 80,
        easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        fill: 'forwards'
      }
    );

    animation.finished.then(() => p.remove()).catch(() => p.remove());
  }
}

/**
 * Spawn water droplet particles rising from a farm plot.
 * @param {HTMLElement} plotEl — farm plot element
 * @param {number} count — number of droplets (default 3)
 */
export function spawnWaterDroplets(plotEl, count = 3) {
  if (!plotEl || document.hidden) return;
  const rect = plotEl.getBoundingClientRect();

  for (let i = 0; i < count; i++) {
    const p = _getParticle();
    if (!p) break;
    p.textContent = "💧";
    p.style.fontSize = "0.7rem";
    const xOff = (Math.random() - 0.5) * rect.width * 0.6;
    p.style.left = `${rect.left + rect.width / 2 + xOff}px`;
    p.style.top = `${rect.top + rect.height * 0.4}px`;
    p.style.opacity = "0.8";
    p.style.transform = "scale(1)";
    p.style.transition = "none";
    document.body.appendChild(p);

    // OPTIMIZATION 3: Web Animations API (WAAPI)
    const animation = p.animate(
      [
        { transform: 'scale(1) translateY(0px)', opacity: 0.8 },
        { transform: 'translateY(-22px) scale(0.4)', opacity: 0 }
      ],
      {
        duration: 700,
        delay: i * 120,
        easing: 'ease-out',
        fill: 'forwards'
      }
    );

    animation.finished.then(() => p.remove()).catch(() => p.remove());
  }
}
