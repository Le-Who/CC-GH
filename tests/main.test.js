import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

describe("main.js", () => {
    it("verifies main.js exports and syntax", () => {
        const code = fs.readFileSync("src/vanilla/main.js", "utf8");

        // Ensure exports exist
        assert.ok(code.includes("export async function bootApp()"));
        assert.ok(code.includes("export default bootApp;"));

        // Ensure UI wiring exists
        assert.ok(code.includes('fab.addEventListener("click"'));
        assert.ok(code.includes('triviaSettingsToggle.addEventListener("click"'));
        assert.ok(code.includes('themeBtn.addEventListener("click"'));

        // Ensure HUB init logic exists
        assert.ok(code.includes("window.HUB.bootComplete = true;"));
    });
});
