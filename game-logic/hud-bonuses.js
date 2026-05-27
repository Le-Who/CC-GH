export const REWARD_CHEST_THRESHOLDS = [500, 1500, 3000];
export const REWARD_CHEST_TIERS = ["none", "bronze", "silver", "gold"];
export const REWARD_CHEST_BONUSES = [0, 25, 75, 150];

export function getRewardChestProgress(value = 0, thresholds = REWARD_CHEST_THRESHOLDS) {
  const score = Math.max(0, Math.floor(Number(value) || 0));
  const unlocked = Math.min(thresholds.length, thresholds.filter((threshold) => score >= threshold).length);
  const tier = REWARD_CHEST_TIERS[unlocked] || REWARD_CHEST_TIERS.at(-1);
  const nextThreshold = thresholds[unlocked] ?? thresholds[thresholds.length - 1] ?? 0;
  const previousThreshold = unlocked > 0 ? thresholds[unlocked - 1] : 0;
  const span = Math.max(1, nextThreshold - previousThreshold);
  const rawProgress = unlocked >= thresholds.length ? 1 : (score - previousThreshold) / span;
  const progress = Math.max(0, Math.min(1, Number(rawProgress.toFixed(2))));
  return {
    tier,
    unlocked,
    progress,
    nextThreshold,
    bonus: REWARD_CHEST_BONUSES[unlocked] || 0,
  };
}

export function createTriviaLifelineState(value = {}) {
  return {
    fifty: Math.max(0, Number.isFinite(Number(value.fifty)) ? Number(value.fifty) : 1),
    reveal: Math.max(0, Number.isFinite(Number(value.reveal)) ? Number(value.reveal) : 1),
  };
}

export function spendTriviaLifeline(current, type) {
  const next = createTriviaLifelineState(current);
  if (!(type in next) || next[type] <= 0) {
    return { allowed: false, next };
  }
  next[type] -= 1;
  return { allowed: true, next };
}

export function selectTriviaFiftyFiftyAnswers(question, alreadyHidden = []) {
  if (!question) return [];
  const hiddenSet = new Set(alreadyHidden);
  const wrongAnswers = Array.isArray(question.wrongAnswers)
    ? question.wrongAnswers
    : (question.answers || []).filter((answer) => answer !== question.correctAnswer);
  return wrongAnswers
    .filter((answer) => answer && answer !== question.correctAnswer && !hiddenSet.has(answer))
    .slice(0, 2);
}
