type GardenConfettiOptions = Record<string, unknown>;

let confettiModulePromise: Promise<any> | null = null;

function getConfettiModule() {
  confettiModulePromise ||= import('canvas-confetti');
  return confettiModulePromise;
}

export function shouldUseGardenLiteEffects() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(max-width: 640px), (pointer: coarse)')?.matches || false;
}

export function prefersReducedGardenMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;
}

export async function runGardenConfetti(options: GardenConfettiOptions, liteOverrides: GardenConfettiOptions = {}) {
  if (prefersReducedGardenMotion()) return;
  const module = await getConfettiModule();
  const confetti = module.default || module;
  const finalOptions = shouldUseGardenLiteEffects()
    ? {
        ...options,
        particleCount: Math.min(Number(options.particleCount) || 12, 12),
        ticks: Math.min(Number(options.ticks) || 60, 60),
        scalar: Math.min(Number(options.scalar) || 0.7, 0.7),
        ...liteOverrides,
      }
    : options;
  confetti(finalOptions);
}
