import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { modalStore } from "../src/hooks/useModal.js";

/* ═══════════════════════════════════════════════════════
 *  useModal Store Tests
 *  Run: node --test tests/useModal.test.js
 * ═══════════════════════════════════════════════════════ */

describe("useModal Store", () => {
  beforeEach(() => {
    modalStore.setState({ activeModal: null, modalProps: {}, _stack: [] });
  });

  it("initializes with activeModal: null, modalProps: {}, and _stack: []", () => {
    const state = modalStore.getState();
    assert.equal(state.activeModal, null);
    assert.deepEqual(state.modalProps, {});
    assert.deepEqual(state._stack, []);
  });

  describe("openModal", () => {
    it("opens a modal with given id and props", () => {
      const store = modalStore.getState();
      store.openModal("energy", { requiredEnergy: 5 });

      const state = modalStore.getState();
      assert.equal(state.activeModal, "energy");
      assert.deepEqual(state.modalProps, { requiredEnergy: 5 });
      assert.deepEqual(state._stack, []);
    });

    it("opens a modal with empty props by default", () => {
      const store = modalStore.getState();
      store.openModal("inventory");

      const state = modalStore.getState();
      assert.equal(state.activeModal, "inventory");
      assert.deepEqual(state.modalProps, {});
      assert.deepEqual(state._stack, []);
    });

    it("pushes the current modal to the stack if one is already open", () => {
      const store = modalStore.getState();

      store.openModal("first", { prop1: "val1" });
      let state = modalStore.getState();
      assert.equal(state.activeModal, "first");

      store.openModal("second", { prop2: "val2" });
      state = modalStore.getState();

      assert.equal(state.activeModal, "second");
      assert.deepEqual(state.modalProps, { prop2: "val2" });
      assert.equal(state._stack.length, 1);
      assert.deepEqual(state._stack[0], { id: "first", props: { prop1: "val1" } });

      store.openModal("third");
      state = modalStore.getState();

      assert.equal(state.activeModal, "third");
      assert.equal(state._stack.length, 2);
      assert.deepEqual(state._stack[1], { id: "second", props: { prop2: "val2" } });
    });
  });

  describe("closeModal", () => {
    it("closes the active modal and resets state when the stack is empty", () => {
      const store = modalStore.getState();
      store.openModal("energy", { requiredEnergy: 5 });

      let state = modalStore.getState();
      assert.equal(state.activeModal, "energy");

      store.closeModal();

      state = modalStore.getState();
      assert.equal(state.activeModal, null);
      assert.deepEqual(state.modalProps, {});
      assert.deepEqual(state._stack, []);
    });

    it("pops the previous modal from the stack and sets it as active", () => {
      const store = modalStore.getState();
      store.openModal("first", { prop1: "val1" });
      store.openModal("second", { prop2: "val2" });
      store.openModal("third", { prop3: "val3" });

      let state = modalStore.getState();
      assert.equal(state.activeModal, "third");
      assert.equal(state._stack.length, 2);

      store.closeModal();

      state = modalStore.getState();
      assert.equal(state.activeModal, "second");
      assert.deepEqual(state.modalProps, { prop2: "val2" });
      assert.equal(state._stack.length, 1);
      assert.deepEqual(state._stack[0], { id: "first", props: { prop1: "val1" } });

      store.closeModal();

      state = modalStore.getState();
      assert.equal(state.activeModal, "first");
      assert.deepEqual(state.modalProps, { prop1: "val1" });
      assert.equal(state._stack.length, 0);
    });
  });

  describe("closeAll", () => {
    it("resets all state and clears the stack", () => {
      const store = modalStore.getState();
      store.openModal("first", { prop1: "val1" });
      store.openModal("second", { prop2: "val2" });

      let state = modalStore.getState();
      assert.equal(state.activeModal, "second");
      assert.equal(state._stack.length, 1);

      store.closeAll();

      state = modalStore.getState();
      assert.equal(state.activeModal, null);
      assert.deepEqual(state.modalProps, {});
      assert.deepEqual(state._stack, []);
    });
  });

  describe("isOpen", () => {
    it("returns true if the specified modal is active", () => {
      const store = modalStore.getState();
      store.openModal("energy");

      const state = modalStore.getState();
      assert.equal(state.isOpen("energy"), true);
    });

    it("returns false if the specified modal is not active", () => {
      const store = modalStore.getState();
      store.openModal("energy");

      const state = modalStore.getState();
      assert.equal(state.isOpen("inventory"), false);
      assert.equal(state.isOpen("shop"), false);
    });

    it("returns false if there is no active modal", () => {
      const store = modalStore.getState();
      const state = modalStore.getState();
      assert.equal(state.isOpen("energy"), false);
    });
  });
});
