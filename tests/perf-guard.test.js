import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadAssetPipelineEntries } from "../scripts/assets-pipeline.config.mjs";
import { PERF_SUITES, evaluatePerfBudget, runPerfGuard } from "../scripts/perf-guard.mjs";

describe("perf:guard contract", () => {
  it("covers the current gameplay and runtime asset hot paths with explicit p95 and p99 tail budgets", () => {
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
      "player.build-first-snapshot",
      "assets.pipeline-entry-scan",
      "assets.runtime-manifest-parse",
      "assets.runtime-bundle-map",
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

  it("keeps asset pipeline perf coverage aligned with generated Pixi bundles", async () => {
    const entries = await loadAssetPipelineEntries();
    const ids = new Set(entries.map((entry) => entry.key));
    const bundles = new Map();
    for (const entry of entries) {
      if (!entry.bundle) continue;
      if (!bundles.has(entry.bundle)) bundles.set(entry.bundle, new Set());
      bundles.get(entry.bundle).add(entry.key);
    }

    for (const required of [
      "match3.special.blast",
      "match3.special.column",
      "match3.special.colour",
      "match3.special.row",
      "match3.fx.clearBurst",
      "match3.drop.gold",
      "match3.drop.seeds",
      "match3.drop.energy",
    ]) {
      assert.ok(ids.has(required), `missing pipeline entry: ${required}`);
    }

    assert.equal(bundles.get("pixi.match3")?.size, 8, "Match3 retains all semantic overlays");
    assert.equal(ids.size, entries.length, "asset pipeline entry keys must be unique");
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

  it("can run a focused runtime asset suite", async () => {
    const report = await runPerfGuard({
      writeReport: false,
      quiet: true,
      suiteIds: ["assets.runtime-bundle-map"],
      repeat: 2,
    });

    assert.equal(report.results.length, 1);
    assert.equal(report.results[0].id, "assets.runtime-bundle-map");
    assert.equal(report.results[0].group, "Runtime Assets");
    assert.equal(report.results[0].rounds.length, 2);
    assert.deepEqual(report.results[0].failures, []);
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

it("benchmarks successful current Merge mutations and both first and steady snapshots", async () => {
  const supply = await PERF_SUITES.find(suite => suite.id === "merge.apply-generator").fn();
  assert.equal(supply.status, 200);
  assert.equal(supply.body.mergeLab.ok, true);
  assert.equal(supply.body.mergeLab.replayed, false);
  assert.equal(supply.body.snapshot.merge.mergeRevision, 1);
  assert.deepEqual(supply.body.snapshot.merge.stock, { seed: 1 });
  assert.equal(supply.body.snapshot.merge.freeTapCharges, 29);
  const craft = await PERF_SUITES.find(suite => suite.id === "merge.apply-recipe").fn();
  assert.equal(craft.status, 200);
  assert.equal(craft.body.mergeLab.ok, true);
  assert.equal(craft.body.mergeLab.replayed, false);
  assert.equal(craft.body.snapshot.merge.mergeRevision, 1);
  assert.deepEqual(craft.body.snapshot.merge.stock, { sprout: 1 });
  for (const id of ["player.build-first-snapshot", "player.build-snapshot"]) {
    const suite = PERF_SUITES.find(suite => suite.id === id);
    assert.deepEqual(suite.budget, { p95: 0.8, max: 4 });
    const snapshot = await suite.fn();
    assert.equal(snapshot.merge.schemaVersion, 3);
    assert.equal(snapshot.merge.migration.mode, "clean-start");
    assert.equal(snapshot.merge.actionLedger, undefined);
  }
});
