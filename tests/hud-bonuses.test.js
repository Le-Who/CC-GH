import assert from "node:assert/strict";
import test from "node:test";
import {
  calcBloxReward,
  calcBubboReward,
  calcGoldReward,
} from "../game-logic.js";
import {
  createTriviaLifelineState,
  getRewardChestProgress,
  selectTriviaAudiencePoll,
  selectTriviaFiftyFiftyAnswers,
  spendTriviaLifeline,
} from "../game-logic/hud-bonuses.js";

test("reward chest progress unlocks deterministic bonus tiers", () => {
  assert.deepEqual(
    getRewardChestProgress(0),
    { tier: "none", unlocked: 0, progress: 0, nextThreshold: 500, bonus: 0 },
  );
  assert.deepEqual(
    getRewardChestProgress(700),
    { tier: "bronze", unlocked: 1, progress: 0.2, nextThreshold: 1500, bonus: 25 },
  );
  assert.deepEqual(
    getRewardChestProgress(3200),
    { tier: "gold", unlocked: 3, progress: 1, nextThreshold: 3000, bonus: 150 },
  );
});

test("reward chest bonuses are included in settled game rewards", () => {
  assert.equal(calcBloxReward(700), 119);
  assert.equal(calcGoldReward(700), 53);
  assert.equal(calcGoldReward(1500), 125);
  assert.equal(calcBubboReward(3200), 383);
});

test("trivia lifelines spend once and keep remaining charges explicit", () => {
  const initial = createTriviaLifelineState();
  const spent = spendTriviaLifeline(initial, "fifty");
  assert.equal(spent.allowed, true);
  assert.deepEqual(spent.next, { fifty: 0, reveal: 1, audience: 1 });

  const blocked = spendTriviaLifeline(spent.next, "fifty");
  assert.equal(blocked.allowed, false);
  assert.deepEqual(blocked.next, { fifty: 0, reveal: 1, audience: 1 });
});

test("50-50 lifeline hides deterministic wrong answers without exposing the correct one", () => {
  const hidden = selectTriviaFiftyFiftyAnswers({
    correctAnswer: "Mars",
    wrongAnswers: ["Mercury", "Venus", "Jupiter"],
  });
  assert.deepEqual(hidden, ["Mercury", "Venus"]);
  assert.ok(!hidden.includes("Mars"));
});

test("audience lifeline returns a bounded poll weighted toward the correct answer", () => {
  const poll = selectTriviaAudiencePoll({
    correctAnswer: "Mars",
    answers: ["Venus", "Jupiter", "Mars", "Saturn"],
  });
  assert.deepEqual(Object.keys(poll).sort(), ["Jupiter", "Mars", "Saturn", "Venus"]);
  assert.equal(Object.values(poll).reduce((sum, value) => sum + value, 0), 100);
  assert.ok(poll.Mars > poll.Venus);
  assert.ok(poll.Mars < 100);
});
