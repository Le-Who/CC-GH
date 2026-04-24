import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

describe("platform cleanup guard", () => {
  it("keeps retired platform names out of active files", () => {
    const result = spawnSync(process.execPath, ["scripts/check-platform-cleanup.mjs"], {
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});
