import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  assetUrl,
  resolveAssetUrl,
  runtimeAssetSrc,
} from "../src/game-runtime/assetBundles.js";

describe("runtime asset URL resolution", () => {
  const previousBuildId = globalThis.__APP_BUILD_ID__;
  const previousAssetBaseUrl = globalThis.__ASSET_BASE_URL__;

  beforeEach(() => {
    globalThis.__APP_BUILD_ID__ = "build-a";
    globalThis.__ASSET_BASE_URL__ = "";
  });

  afterEach(() => {
    globalThis.__APP_BUILD_ID__ = previousBuildId;
    globalThis.__ASSET_BASE_URL__ = previousAssetBaseUrl;
  });

  it("keeps build id cache busting on legacy /games assets only", () => {
    assert.equal(assetUrl("/games/bubbo-bubbo/images/bubble-blue.png"), "/games/bubbo-bubbo/images/bubble-blue.png?v=build-a");
    assert.equal(assetUrl("/assets-runtime/bubbo/bubble-blue.1234abcd.webp"), "/assets-runtime/bubbo/bubble-blue.1234abcd.webp");
  });

  it("uses generated content-hashed assets before legacy fallbacks", () => {
    const runtimeManifest = {
      assets: {
        "bubbo.bubble.blue": {
          type: "image",
          src: "/assets-runtime/bubbo/bubble-blue.1234abcd.webp",
          fallback: "/assets-runtime/bubbo/bubble-blue.5678abcd.png",
        },
      },
    };

    assert.equal(
      runtimeAssetSrc(runtimeManifest, "bubbo.bubble.blue"),
      "/assets-runtime/bubbo/bubble-blue.1234abcd.webp",
    );
    assert.equal(
      resolveAssetUrl("bubbo.bubble.blue", {
        runtimeManifest,
        legacyPath: "/games/bubbo-bubbo/images/bubble-blue.png",
      }),
      "/assets-runtime/bubbo/bubble-blue.1234abcd.webp",
    );
    assert.equal(
      resolveAssetUrl("bubbo.bubble.missing", {
        runtimeManifest,
        legacyPath: "/games/bubbo-bubbo/images/bubble-blue.png",
      }),
      "/games/bubbo-bubbo/images/bubble-blue.png?v=build-a",
    );
    assert.equal(
      resolveAssetUrl("gachaMerge.items.thread", {
        runtimeManifest,
        legacyPath: "",
      }),
      "",
    );
  });

  it("applies the optional asset base URL to generated runtime assets", () => {
    globalThis.__ASSET_BASE_URL__ = "https://assets.example.test";

    assert.equal(
      assetUrl("/assets-runtime/bubbo/bubble-blue.1234abcd.webp"),
      "https://assets.example.test/assets-runtime/bubbo/bubble-blue.1234abcd.webp",
    );
    assert.equal(
      assetUrl("/games/bubbo-bubbo/images/bubble-blue.png"),
      "/games/bubbo-bubbo/images/bubble-blue.png?v=build-a",
    );
  });
});
