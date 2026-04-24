const STORAGE_KEY = "gh_audio_enabled";

const DEFAULT_MANIFEST = {
  version: 1,
  audio: {
    sfx: {},
    music: {},
  },
};

let manifestPromise = null;
let audioCtx = null;

function getStoredEnabled() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function setStoredEnabled(enabled) {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // Storage can be unavailable in hardened embedded browsers.
  }
}

async function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch("/assets/manifest.json", { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : DEFAULT_MANIFEST))
      .catch(() => DEFAULT_MANIFEST);
  }
  return manifestPromise;
}

function ensureAudioContext() {
  if (audioCtx) return audioCtx;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  audioCtx = new AudioContextCtor();
  return audioCtx;
}

function tone(kind) {
  const presets = {
    tap: [420, 0.035, 0.035],
    success: [720, 0.06, 0.045],
    error: [160, 0.08, 0.05],
    warning: [220, 0.075, 0.045],
    merge: [520, 0.055, 0.045],
    clear: [880, 0.085, 0.05],
    harvest: [660, 0.07, 0.045],
    gacha: [960, 0.11, 0.055],
  };
  return presets[kind] || presets.tap;
}

async function playTone(kind) {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") await ctx.resume();
  const [frequency, duration, gainValue] = tone(kind);
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(gainValue, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + duration + 0.02);
}

class AudioManager {
  constructor() {
    this.enabled = getStoredEnabled();
    this.cache = new Map();
  }

  isEnabled() {
    return this.enabled;
  }

  async setEnabled(enabled) {
    this.enabled = !!enabled;
    setStoredEnabled(this.enabled);
    if (this.enabled) {
      const ctx = ensureAudioContext();
      if (ctx?.state === "suspended") await ctx.resume();
      await this.play("tap");
    }
    return this.enabled;
  }

  async toggle() {
    return this.setEnabled(!this.enabled);
  }

  async play(kind = "tap") {
    if (!this.enabled || typeof window === "undefined") return;
    const manifest = await loadManifest();
    const src = manifest?.audio?.sfx?.[kind];
    if (src) {
      try {
        let audio = this.cache.get(src);
        if (!audio) {
          audio = new Audio(src);
          audio.preload = "auto";
          this.cache.set(src, audio);
        }
        audio.currentTime = 0;
        await audio.play();
        return;
      } catch {
        // Fall back to synthesized UI tones if a custom asset is missing or blocked.
      }
    }
    await playTone(kind);
  }
}

export const audioManager = new AudioManager();
