import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PERF_SUITES, runPerfGuard } from "../scripts/perf-guard.mjs";

describe("perf:guard contract", () => {
  it("covers the current gameplay hot paths with explicit p95 and max budgets", () => {
    const ids = new Set(PERF_SUITES.map((suite) => suite.id));
    for (const required of [
      "match3.generate-board",
      "match3.resolve-valid-swap",
      "match3.star-drop-swap",
      "blox.fit-scan",
      "merge.board-hydrate",
      "bubbo.pressure-advance",
      "bubbo.apply-shot",
      "farm.offline-full",
      "trivia.pick-questions",
      "yard.simulate-36h",
    ]) {
      assert.ok(ids.has(required), `missing perf suite: ${required}`);
    }

    for (const suite of PERF_SUITES) {
      assert.ok(Number.isFinite(suite.budget?.p95), `${suite.id} needs a p95 budget`);
      assert.ok(Number.isFinite(suite.budget?.max), `${suite.id} needs a max budget`);
      assert.ok(suite.iterations >= 100, `${suite.id} needs enough samples for objective timing`);
      assert.equal(typeof suite.description, "string");
    }
  });

  it("keeps gameplay hot paths inside their budgets", async () => {
    const report = await runPerfGuard({ writeReport: false, quiet: true });
    const failures = report.results
      .filter((result) => !result.passed)
      .map((result) => `${result.id}: ${result.failures.join("; ")}`);
    assert.deepEqual(failures, []);
  });
});
