export const MATCH3_TIMING = {
  swapFrames: 7,
  swapSettleFrames: 2,
  clearFrames: 6,
  motionFrames: 21,
  settleFrames: 4,
  tailFrames: 3,
};

export function estimateMatch3CascadeLockMs(stepCount = 1) {
  const steps = Math.max(1, Math.floor(Number(stepCount) || 1));
  const frames =
    MATCH3_TIMING.swapFrames +
    MATCH3_TIMING.swapSettleFrames +
    steps * (
      MATCH3_TIMING.clearFrames +
      MATCH3_TIMING.motionFrames +
      MATCH3_TIMING.settleFrames
    ) +
    MATCH3_TIMING.tailFrames;

  return Math.min(1600, Math.round((frames * 1000) / 60));
}

export function match3StepStartFrame(stepIndex = 0) {
  const index = Math.max(0, Math.floor(Number(stepIndex) || 0));
  return MATCH3_TIMING.swapFrames +
    MATCH3_TIMING.swapSettleFrames +
    index * (
      MATCH3_TIMING.clearFrames +
      MATCH3_TIMING.motionFrames +
      MATCH3_TIMING.settleFrames
    );
}
