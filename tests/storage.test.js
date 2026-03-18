import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { initStorage, getBucket, _resetBucket, gcsRead, gcsWrite } from "../storage.js";

class MockStorage {
  bucket(name) {
    return {
      name,
      isMock: true,
      file: (path) => ({
        download: async () => [Buffer.from(`content of ${path}`)],
        save: async (content) => {
          this.savedContent = content;
        }
      })
    };
  }
}

describe("Storage Module", () => {
  beforeEach(() => {
    _resetBucket();
  });

  it("initializes with a bucket name", () => {
    const bucketName = "test-bucket";
    initStorage(bucketName, MockStorage);
    const bucket = getBucket();
    assert.ok(bucket, "Bucket should be initialized");
    assert.strictEqual(bucket.name, bucketName);
    assert.strictEqual(bucket.isMock, true);
  });

  it("does not initialize bucket if name is empty", () => {
    initStorage("", MockStorage);
    const bucket = getBucket();
    assert.strictEqual(bucket, null, "Bucket should remain null");
  });

  it("does not initialize bucket if name is null", () => {
    initStorage(null, MockStorage);
    const bucket = getBucket();
    assert.strictEqual(bucket, null, "Bucket should remain null");
  });

  it("getBucket returns the current bucket", () => {
    assert.strictEqual(getBucket(), null);
    initStorage("another-bucket", MockStorage);
    assert.strictEqual(getBucket().name, "another-bucket");
  });

  it("_resetBucket clears the bucket", () => {
    initStorage("to-be-cleared", MockStorage);
    assert.ok(getBucket());
    _resetBucket();
    assert.strictEqual(getBucket(), null);
  });

  describe("gcsRead", () => {
    it("returns null if bucket is not initialized", async () => {
      const result = await gcsRead("some/path");
      assert.strictEqual(result, null);
    });

    it("reads content from bucket if initialized", async () => {
      initStorage("read-bucket", MockStorage);
      const result = await gcsRead("test.txt");
      assert.strictEqual(result, "content of test.txt");
    });
  });

  describe("gcsWrite", () => {
    it("does not throw if bucket is not initialized", async () => {
      await assert.doesNotReject(async () => {
        await gcsWrite("some/path", "data");
      });
    });

    it("writes content to bucket if initialized", async () => {
      initStorage("write-bucket", MockStorage);
      await gcsWrite("test.txt", "new content");
    });
  });
});
