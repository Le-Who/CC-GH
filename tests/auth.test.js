import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { sign } from "@tma.js/init-data-node";
import {
  authenticateAuthorizationHeader,
  resolveUser,
} from "../middleware/auth.js";

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  DEV_AUTH_ENABLED: process.env.DEV_AUTH_ENABLED,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("Telegram Mini App auth", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.DEV_AUTH_ENABLED = "false";
    process.env.TELEGRAM_BOT_TOKEN = "123456:test-token";
  });

  afterEach(restoreEnv);

  it("accepts signed Telegram init data", async () => {
    const initData = sign(
      { user: { id: 42, first_name: "Ada", username: "ada" } },
      process.env.TELEGRAM_BOT_TOKEN,
      new Date(),
    );

    const auth = await authenticateAuthorizationHeader(`tma ${initData}`, {
      body: { userId: "spoofed" },
      query: {},
      headers: {},
    });

    assert.equal(auth.provider, "telegram");
    assert.equal(auth.externalId, "42");
    assert.equal(auth.username, "ada");
    assert.equal(auth.accountId, "telegram:42");
  });

  it("rejects tampered Telegram init data", async () => {
    const initData = sign(
      { user: { id: 42, first_name: "Ada" } },
      process.env.TELEGRAM_BOT_TOKEN,
      new Date(),
    ).replace("42", "43");

    await assert.rejects(
      () => authenticateAuthorizationHeader(`tma ${initData}`),
      /Signature/i,
    );
  });

  it("uses authenticated account id instead of caller-supplied userId", async () => {
    process.env.DEV_AUTH_ENABLED = "true";
    const auth = await authenticateAuthorizationHeader("dev stable-dev", {
      body: { userId: "spoofed-body-id" },
      query: { userId: "spoofed-query-id" },
      headers: {},
    });
    const req = {
      authenticatedUser: auth,
      body: { userId: "spoofed-body-id" },
      query: { userId: "spoofed-query-id" },
    };

    assert.equal(resolveUser(req).userId, "dev:stable-dev");
  });

  it("allows dev auth only outside production when enabled", async () => {
    process.env.DEV_AUTH_ENABLED = "true";
    process.env.NODE_ENV = "development";
    const auth = await authenticateAuthorizationHeader("dev local-user");
    assert.equal(auth.provider, "dev");
    assert.equal(auth.accountId, "dev:local-user");

    process.env.NODE_ENV = "production";
    await assert.rejects(
      () => authenticateAuthorizationHeader("dev local-user"),
      /disabled/i,
    );
  });
});
