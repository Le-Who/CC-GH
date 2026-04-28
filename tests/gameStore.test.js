import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { GameStore, useGameStore } from "../src/store/gameStore.js";
import { useGameHub } from "../src/game-state/useGameHub.js";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
}

function responseJson(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function resetHubState() {
  useGameHub.setState({
    snapshot: {
      resources: { gold: 100 },
      farm: { harvested: {}, plots: [] },
      garden: { level: 1, plants: [], shelvesUnlocked: 1 },
      yard: { currencies: { treats: 80, shinyTreats: 0 }, pendingGifts: [] },
      merge: {},
      pet: {},
    },
    status: "ready",
    message: "",
    busy: {},
    pendingActions: [],
    outboxLoaded: true,
    lastResult: null,
  });
}

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

describe("useGameHub.applyRealtimePayload", () => {
  beforeEach(() => {
    useGameHub.setState({
      snapshot: {
        resources: { gold: 100 },
        farm: { harvested: {}, plots: [] },
        garden: { level: 1, plants: [], shelvesUnlocked: 1 },
        yard: { currencies: { treats: 0, shinyTreats: 0 }, pendingGifts: [] },
        merge: {},
        pet: {},
      },
    });
  });

  it("merges Garden Shelf state from realtime sync payloads", () => {
    const garden = {
      level: 5,
      xp: 2700,
      shelvesUnlocked: 2,
      totalGoldEarned: 120,
      plants: [{ id: "p1", type: "daisy", level: 2, shelfIndex: 0, spotIndex: 1, phase: 3, phaseProgress: 0 }],
    };

    useGameHub.getState().applyRealtimePayload({ garden });

    assert.equal(useGameHub.getState().snapshot.garden.level, 5);
    assert.equal(useGameHub.getState().snapshot.garden.plants[0].id, "p1");
    assert.equal(useGameHub.getState().snapshot.resources.gold, 100);
  });

  it("merges Cozy Yard state from realtime sync payloads", () => {
    const yard = {
      currencies: { treats: 145, shinyTreats: 4 },
      pendingGifts: [{ id: "gift-1", visitorId: "mika_cat", treats: 12 }],
      petbook: { mika_cat: { visits: 2 } },
    };

    useGameHub.getState().applyRealtimePayload({ yard });

    assert.equal(useGameHub.getState().snapshot.yard.currencies.treats, 145);
    assert.equal(useGameHub.getState().snapshot.yard.pendingGifts[0].id, "gift-1");
    assert.equal(useGameHub.getState().snapshot.resources.gold, 100);
  });
});

describe("useGameHub Yard outbox", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { Telegram: null },
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createStorage(),
    });
    resetHubState();
  });

  it("keeps Yard actions pending on network errors without surfacing rollback errors", async () => {
    globalThis.fetch = async () => {
      throw new Error("offline");
    };

    const queued = await useGameHub.getState().enqueueYardAction("yard.collectGifts", {});
    const result = await useGameHub.getState().drainOutbox();
    const state = useGameHub.getState();

    assert.equal(queued.pending, true);
    assert.equal(result.error, "NETWORK_ERROR");
    assert.equal(state.pendingActions.length, 1);
    assert.equal(state.pendingActions[0].status, "pending");
    assert.equal(state.message, "");
  });

  it("removes successful Yard outbox items and applies the authoritative snapshot", async () => {
    const snapshot = {
      resources: { gold: 100 },
      farm: { harvested: {}, plots: [] },
      garden: { level: 1, plants: [], shelvesUnlocked: 1 },
      yard: { currencies: { treats: 105, shinyTreats: 1 }, pendingGifts: [] },
      merge: {},
      pet: {},
    };
    globalThis.fetch = async (path, options = {}) => {
      if (path === "/api/config") return responseJson({ devAuthEnabled: false });
      assert.equal(path, "/api/player/mutate");
      const body = JSON.parse(options.body);
      assert.equal(body.action, "yard.collectGifts");
      assert.ok(body.clientActionId);
      return responseJson({ success: true, snapshot });
    };

    await useGameHub.getState().enqueueYardAction("yard.collectGifts", {});
    const result = await useGameHub.getState().drainOutbox();
    const state = useGameHub.getState();

    assert.equal(result.success, true);
    assert.equal(state.pendingActions.length, 0);
    assert.equal(state.snapshot.yard.currencies.treats, 105);
  });

  it("restores pending Yard actions from storage and coalesces companion config to the latest intent", async () => {
    globalThis.fetch = async () => {
      throw new Error("offline");
    };

    await useGameHub.getState().enqueueYardAction("yard.configureCompanion", { name: "Mochi", species: "cat" });
    await useGameHub.getState().enqueueYardAction("yard.configureCompanion", { name: "Luna", species: "fox" });
    assert.equal(useGameHub.getState().pendingActions.length, 1);
    assert.equal(useGameHub.getState().pendingActions[0].payload.name, "Luna");

    useGameHub.setState({ pendingActions: [], outboxLoaded: false });
    await useGameHub.getState().hydrateOutbox();

    const restored = useGameHub.getState().pendingActions;
    assert.equal(restored.length, 1);
    assert.equal(restored[0].entityKey, "companion");
    assert.equal(restored[0].payload.name, "Luna");
  });
});
