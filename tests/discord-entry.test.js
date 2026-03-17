/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Discord SDK Entry Point Tests
 *  Verifies that DiscordSDK is correctly assigned to window
 *  Run:  node --test tests/discord-entry.test.js
 * ═══════════════════════════════════════════════════════
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Discord Entry Point", () => {
  it("should assign DiscordSDK to the global window object", async () => {
    // 1. Setup browser-like environment
    globalThis.window = {};

    // 2. Import the entry point
    // We use a cache-busting query to ensure it runs even if imported elsewhere
    await import("../src/discord-entry.js?t=" + Date.now());

    // 3. Verify assignment
    assert.ok(globalThis.window.DiscordSDK, "window.DiscordSDK should be defined");

    // Cleanup
    delete globalThis.window;
  });
});
