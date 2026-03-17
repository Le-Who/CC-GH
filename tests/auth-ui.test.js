import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

describe("Auth UI", () => {
  let authUi;
  let storage = {};
  let fetchCall = null;
  let reloaded = false;
  let createdDialog = null;

  beforeEach(async () => {
    storage = {};
    fetchCall = null;
    reloaded = false;
    createdDialog = null;

    globalThis.localStorage = {
      getItem: (key) => storage[key] || null,
      setItem: (key, value) => { storage[key] = String(value); },
      removeItem: (key) => { delete storage[key]; }
    };

    globalThis.fetch = async (url, options) => {
      fetchCall = { url, options };
      return {
        ok: true,
        json: async () => ({ token: "new-token", userId: "u123", username: "tester", error: "bad" })
      };
    };

    globalThis.window = {
      location: { reload: () => { reloaded = true; } }
    };

    class MockElement {
      constructor(tag) {
        this.tag = tag;
        this.events = {};
        this.dataset = { tab: "login" };
        this.classList = { toggle: () => {}, remove: () => {}, add: () => {} };
        this.value = "testval";
        this.textContent = "";
        this.disabled = false;
        this._qs = {};
      }
      addEventListener(ev, cb) { this.events[ev] = cb; }
      querySelectorAll(selector) {
        if (selector === ".auth-tab") {
          const t1 = new MockElement("tab1");
          t1.dataset.tab = "login";
          const t2 = new MockElement("tab2");
          t2.dataset.tab = "register";
          // Store these so we can trigger events on them
          this._qs[".auth-tab"] = [t1, t2];
          return [t1, t2];
        }
        return [new MockElement("tab1"), new MockElement("tab2")];
      }
      querySelector(selector) {
        if (!this._qs[selector]) this._qs[selector] = new MockElement(selector);
        return this._qs[selector];
      }
      focus() {}
      setAttribute() {}
      showModal() {}
      close() {}
      remove() {}
      appendChild() {}
    }

    globalThis.document = {
      getElementById: () => null,
      createElement: (tag) => {
        const el = new MockElement(tag);
        if (tag === "dialog") createdDialog = el;
        return el;
      },
      body: new MockElement("body")
    };

    // dynamically import with cache busting
    const url = `../src/vanilla/auth-ui.js?t=${Date.now()}`;
    authUi = await import(url);
  });

  afterEach(() => {
    delete globalThis.localStorage;
    delete globalThis.fetch;
    delete globalThis.window;
    delete globalThis.document;
  });

  it("storeAuth and getStoredAuth work", () => {
    authUi.storeAuth("token123", "user1", "alice");
    const auth = authUi.getStoredAuth();
    assert.deepEqual(auth, { token: "token123", userId: "user1", username: "alice" });
  });

  it("clearAuth removes stored data", () => {
    authUi.storeAuth("token123", "user1", "alice");
    authUi.clearAuth();
    assert.equal(authUi.getStoredAuth(), null);
  });

  it("getStoredAuth handles corrupt JSON gracefully", () => {
    storage["hub_auth_token"] = "token123";
    storage["hub_auth_user"] = "invalid json {";
    assert.equal(authUi.getStoredAuth(), null);
  });

  it("validateStoredToken returns null if no token", async () => {
    const res = await authUi.validateStoredToken();
    assert.equal(res, null);
  });

  it("validateStoredToken works with valid token", async () => {
    authUi.storeAuth("token123", "u1", "alice");
    const res = await authUi.validateStoredToken();
    assert.equal(fetchCall.url, "/api/auth/me");
    assert.equal(fetchCall.options.headers.Authorization, "Bearer token123");
    assert.deepEqual(res, { token: "token123", userId: "u123", username: "tester" });
  });

  it("validateStoredToken clears auth and returns null if 401", async () => {
    authUi.storeAuth("token123", "u1", "alice");
    globalThis.fetch = async () => ({ ok: false });
    const res = await authUi.validateStoredToken();
    assert.equal(res, null);
    assert.equal(authUi.getStoredAuth(), null);
  });

  it("validateStoredToken keeps auth on network error", async () => {
    authUi.storeAuth("token123", "u1", "alice");
    globalThis.fetch = async () => { throw new Error("Network error"); };
    const res = await authUi.validateStoredToken();
    assert.equal(res, null);
    assert.notEqual(authUi.getStoredAuth(), null);
  });

  it("logout clears auth and reloads", async () => {
    authUi.storeAuth("token123", "u1", "alice");
    await authUi.logout();
    assert.equal(authUi.getStoredAuth(), null);
    assert.equal(reloaded, true);
    assert.equal(fetchCall.url, "/api/auth/logout");
  });

  it("logout handles missing token safely", async () => {
    await authUi.logout();
    assert.equal(reloaded, true);
    assert.equal(fetchCall, null);
  });

  it("showAuthDialog can resolve as guest", async () => {
    const promise = authUi.showAuthDialog();
    assert.ok(createdDialog);
    const demoBtn = createdDialog.querySelector("#auth-demo-btn");

    // Simulate click on guest button
    demoBtn.events["click"]();

    const result = await promise;
    assert.equal(result, null);
  });

  it("showAuthDialog can resolve via form submit", async () => {
    const promise = authUi.showAuthDialog();
    const form = createdDialog.querySelector("#auth-form");

    // Simulate form submit
    await form.events["submit"]({ preventDefault: () => {} });

    const result = await promise;
    assert.deepEqual(result, { token: "new-token", userId: "u123", username: "tester" });
    assert.equal(fetchCall.url, "/api/auth/login"); // default tab is login
  });

  it("showAuthDialog handles form submit error", async () => {
    globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: "bad credentials" }) });

    // We don't await promise because it won't resolve on error, it just updates UI
    authUi.showAuthDialog();
    const form = createdDialog.querySelector("#auth-form");
    const errorEl = createdDialog.querySelector("#auth-error");

    // Simulate form submit
    await form.events["submit"]({ preventDefault: () => {} });

    assert.equal(errorEl.textContent, "bad credentials");
  });

  it("showAuthDialog handles form submit network error", async () => {
    globalThis.fetch = async () => { throw new Error("Network error"); };

    authUi.showAuthDialog();
    const form = createdDialog.querySelector("#auth-form");
    const errorEl = createdDialog.querySelector("#auth-error");

    // Simulate form submit
    await form.events["submit"]({ preventDefault: () => {} });

    assert.equal(errorEl.textContent, "Network error — check your connection");
  });

  it("showAuthDialog tab switching works", async () => {
    authUi.showAuthDialog();
    const tabs = createdDialog._qs[".auth-tab"]; // get the exact same instances
    const submitBtn = createdDialog.querySelector("#auth-submit");

    // Simulate tab click
    tabs[1].events["click"]();

    assert.equal(submitBtn.textContent, "Create Account");

    const form = createdDialog.querySelector("#auth-form");
    await form.events["submit"]({ preventDefault: () => {} });

    assert.equal(fetchCall.url, "/api/auth/register");
  });
});
