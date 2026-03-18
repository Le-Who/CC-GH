import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { GameStore, useGameStore } from "../src/store/gameStore.js";

/* ═══════════════════════════════════════════════════
 *  GameStore Unit Tests
 * ═══════════════════════════════════════════════════ */

describe("GameStore.subscribe", () => {
  beforeEach(() => {
    // Reset the store state before each test
    useGameStore.setState({ slices: {} });
  });

  it("calls the callback when the specific slice updates", () => {
    GameStore.registerSlice("testSlice", { value: 1 });

    let callCount = 0;
    let receivedNewState = null;
    let receivedPrevState = null;

    const unsubscribe = GameStore.subscribe("testSlice", (newState, prevState) => {
      callCount++;
      receivedNewState = newState;
      receivedPrevState = prevState;
    });

    // Update the slice
    GameStore.setState("testSlice", { value: 2 });

    assert.strictEqual(callCount, 1, "Callback should have been called once");
    assert.deepEqual(receivedNewState, { value: 2 }, "Should receive the new slice state");
    assert.deepEqual(receivedPrevState, { value: 1 }, "Should receive the previous slice state");

    unsubscribe();
  });

  it("does not call the callback when a different slice updates", () => {
    GameStore.registerSlice("targetSlice", { value: 1 });
    GameStore.registerSlice("otherSlice", { value: 'A' });

    let callCount = 0;

    const unsubscribe = GameStore.subscribe("targetSlice", () => {
      callCount++;
    });

    // Update a different slice
    GameStore.setState("otherSlice", { value: 'B' });

    assert.strictEqual(callCount, 0, "Callback should not be called when another slice updates");

    unsubscribe();
  });

  it("stops calling the callback after unsubscribe is called", () => {
    GameStore.registerSlice("testSlice", { count: 0 });

    let callCount = 0;

    const unsubscribe = GameStore.subscribe("testSlice", () => {
      callCount++;
    });

    GameStore.setState("testSlice", { count: 1 });
    assert.strictEqual(callCount, 1, "Callback called on first update");

    unsubscribe();

    GameStore.setState("testSlice", { count: 2 });
    assert.strictEqual(callCount, 1, "Callback should not be called after unsubscribe");
  });

  it("only calls the callback if the slice actually changes", () => {
    GameStore.registerSlice("testSlice", { value: 'same' });

    let callCount = 0;

    const unsubscribe = GameStore.subscribe("testSlice", () => {
      callCount++;
    });

    // Trigger an update to testSlice but the state is exactly the same reference
    useGameStore.setState((prev) => ({
        slices: { ...prev.slices, testSlice: prev.slices.testSlice }
    }));

    assert.strictEqual(callCount, 0, "Callback should not be called when slice object reference hasn't changed");

    unsubscribe();
  });
});
