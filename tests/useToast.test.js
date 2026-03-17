import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { toastStore } from "../src/hooks/useToast.js";

/* ═══════════════════════════════════════════════════════
 *  useToast Store Tests
 *  Run: node --test tests/useToast.test.js
 * ═══════════════════════════════════════════════════════ */

describe("useToast Store", () => {
  beforeEach(() => {
    toastStore.getState().clearAll();
  });

  afterEach(() => {
    mock.timers.reset();
  });

  it("initializes with an empty toasts array", () => {
    const state = toastStore.getState();
    assert.deepEqual(state.toasts, []);
  });

  it("adds a toast with id, message, type, and timestamp", () => {
    const store = toastStore.getState();
    store.addToast("Test message", "success");

    const state = toastStore.getState();
    assert.equal(state.toasts.length, 1);

    const toast = state.toasts[0];
    assert.ok(typeof toast.id === "number");
    assert.equal(toast.message, "Test message");
    assert.equal(toast.type, "success");
    assert.ok(typeof toast.timestamp === "number");
  });

  it("defaults type to 'info' if not provided", () => {
    const store = toastStore.getState();
    store.addToast("Default type");

    const state = toastStore.getState();
    assert.equal(state.toasts[0].type, "info");
  });

  it("maintains a maximum of 3 toasts", () => {
    const store = toastStore.getState();
    store.addToast("Message 1");
    store.addToast("Message 2");
    store.addToast("Message 3");
    store.addToast("Message 4");

    const state = toastStore.getState();
    assert.equal(state.toasts.length, 3);
    assert.equal(state.toasts[0].message, "Message 2");
    assert.equal(state.toasts[1].message, "Message 3");
    assert.equal(state.toasts[2].message, "Message 4");
  });

  it("deduplicates identical messages within 1 second", () => {
    mock.timers.enable({ apis: ["Date", "setTimeout"] });

    const store = toastStore.getState();
    store.addToast("Duplicate me");

    // Add identical message immediately
    store.addToast("Duplicate me");

    let state = toastStore.getState();
    assert.equal(state.toasts.length, 1, "Should deduplicate identical messages immediately");

    // Advance time by 500ms
    mock.timers.tick(500);
    store.addToast("Duplicate me");

    state = toastStore.getState();
    assert.equal(state.toasts.length, 1, "Should deduplicate identical messages within 1s");

    // Advance time to over 1000ms from the original toast
    mock.timers.tick(600);
    store.addToast("Duplicate me");

    state = toastStore.getState();
    assert.equal(state.toasts.length, 2, "Should allow identical messages after 1s");
  });

  it("auto-removes a toast after 2.5s", () => {
    mock.timers.enable({ apis: ["Date", "setTimeout"] });

    const store = toastStore.getState();
    store.addToast("Disappearing toast");

    let state = toastStore.getState();
    assert.equal(state.toasts.length, 1);

    // Advance time by 2.4s
    mock.timers.tick(2400);
    state = toastStore.getState();
    assert.equal(state.toasts.length, 1, "Toast should still exist at 2.4s");

    // Advance time to pass the 2.5s mark
    mock.timers.tick(101);
    state = toastStore.getState();
    assert.equal(state.toasts.length, 0, "Toast should be removed after 2.5s");
  });

  it("dismisses a specific toast by id", () => {
    const store = toastStore.getState();
    store.addToast("Toast 1");
    store.addToast("Toast 2");

    let state = toastStore.getState();
    assert.equal(state.toasts.length, 2);

    const toastToDismiss = state.toasts[0];
    store.dismiss(toastToDismiss.id);

    state = toastStore.getState();
    assert.equal(state.toasts.length, 1);
    assert.equal(state.toasts[0].message, "Toast 2");
  });

  it("clears all toasts", () => {
    const store = toastStore.getState();
    store.addToast("Toast 1");
    store.addToast("Toast 2");

    let state = toastStore.getState();
    assert.equal(state.toasts.length, 2);

    store.clearAll();

    state = toastStore.getState();
    assert.equal(state.toasts.length, 0);
  });
});
