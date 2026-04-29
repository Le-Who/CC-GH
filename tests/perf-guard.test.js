import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PERF_SUITES, evaluatePerfBudget, runPerfGuard } from "../scripts/perf-guard.mjs";

describe("perf:guard contract", () => {
  it("covers the current gameplay hot paths with explicit p95 and p99 tail budgets", () => {
    const ids = new Set(PERF_SUITES.map((suite) => suite.id));
    for (const required of [
      "match3.generate-board",
      "match3.resolve-valid-swap",
      "match3.star-drop-swap",
      "blox.almost-full-fit-scan",
      "blox.fit-scan",
      "merge.board-hydrate",
      "merge.apply-generator",
      "merge.apply-recipe",
      "bubbo.pressure-advance",
      "bubbo.apply-shot",
      "farm.offline-full",
      "farm.offline-24h",
      "trivia.pick-questions",
      "yard.simulate-36h",
      "yard.simulate-long-idle",
      "player.apply-migrations-current",
      "player.apply-migrations-legacy",
      "player.build-snapshot",
    ]) {
      assert.ok(ids.has(required), `missing perf suite: ${required}`);
    }

    assert.equal(ids.size, PERF_SUITES.length, "perf suite ids must be unique");
    for (const suite of PERF_SUITES) {
      assert.ok(Number.isFinite(suite.budget?.p95), `${suite.id} needs a p95 budget`);
      assert.ok(Number.isFinite(suite.budget?.max), `${suite.id} needs a p99 tail budget`);
      assert.ok(suite.budget.max >= suite.budget.p95, `${suite.id} p99 tail budget must be at least p95 budget`);
      assert.ok(suite.iterations >= 100, `${suite.id} needs enough samples for objective timing`);
      assert.equal(typeof suite.fn, "function", `${suite.id} needs a benchmark function`);
      assert.equal(typeof suite.group, "string", `${suite.id} needs a group`);
      assert.equal(typeof suite.description, "string");
    }
  });

  it("can run a focused suite and emits report summary metadata", async () => {
    const report = await runPerfGuard({
      writeReport: false,
      quiet: true,
      suiteIds: ["player.build-snapshot"],
    });

    assert.equal(report.schemaVersion, 2);
    assert.equal(report.results.length, 1);
    assert.equal(report.results[0].id, "player.build-snapshot");
    assert.equal(report.summary.totalSuites, 1);
    assert.equal(report.summary.failedSuites, 0);
    assert.ok(Array.isArray(report.summary.slowestBudgetRatios));
    assert.ok(Number.isFinite(report.results[0].stats.p99));
    assert.deepEqual(report.results[0].failures, []);
    assert.ok(Array.isArray(report.results[0].warnings));
  });

  it("can repeat focused suites and aggregates the worst round for CI gating", async () => {
    const report = await runPerfGuard({
      writeReport: false,
      quiet: true,
      suiteIds: ["match3.find-matches"],
      repeat: 2,
    });

    assert.equal(report.results.length, 1);
    assert.equal(report.results[0].rounds.length, 2);
    assert.equal(
      report.results[0].stats.p95,
      Math.max(...report.results[0].rounds.map((round) => round.p95)),
    );
    assert.equal(
      report.results[0].stats.p99,
      Math.max(...report.results[0].rounds.map((round) => round.p99)),
    );
  });

  it("reports isolated raw max spikes without failing otherwise healthy tail measurements", () => {
    const result = evaluatePerfBudget(
      { p95: 0.05, p99: 0.2, max: 3.377 },
      { p95: 0.7, max: 3 },
    );

    assert.deepEqual(result.failures, []);
    assert.deepEqual(result.warnings, ["max spike 3.377ms > 3ms"]);

    const failingTail = evaluatePerfBudget(
      { p95: 0.05, p99: 3.377, max: 3.6 },
      { p95: 0.7, max: 3 },
    );
    assert.deepEqual(failingTail.failures, ["p99 3.377ms > max budget 3ms"]);
  });

  it("keeps gameplay hot paths inside their budgets", async () => {
    const report = await runPerfGuard({ writeReport: false, quiet: true });
    const failures = report.results
      .filter((result) => !result.passed)
      .map((result) => `${result.id}: ${result.failures.join("; ")}`);
    assert.deepEqual(failures, []);
  });
});
