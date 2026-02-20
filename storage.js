/**
 * ═══════════════════════════════════════════════════
 *  Game Hub — Storage Module
 *  GCS (primary) + Local Filesystem (fallback)
 *  Replicates root project's server/storage.js pattern
 * ═══════════════════════════════════════════════════
 */
import { Storage } from "@google-cloud/storage";

let bucket = null;

/**
 * Initialize storage with optional GCS bucket.
 * @param {string} bucketName — GCS bucket name (empty = local only)
 */
export function initStorage(bucketName) {
  if (bucketName) {
    const storage = new Storage(); // auto-authenticates on GCP
    bucket = storage.bucket(bucketName);
    console.log(`  ☁️  GCS bucket: ${bucketName}`);
  } else {
    console.warn(
      "  ⚠️  GCS_BUCKET not set — using LOCAL storage (data lost on redeploy!)",
    );
  }
}

/** Get the current bucket instance (or null if local-only). */
export function getBucket() {
  return bucket;
}

/**
 * Read a file from GCS.
 * @param {string} gcsPath — path within the bucket
 * @returns {Promise<string|null>}
 */
export async function gcsRead(gcsPath) {
  if (!bucket) return null;
  try {
    const [data] = await bucket.file(gcsPath).download();
    return data.toString("utf-8");
  } catch (e) {
    if (e.code === 404) return null;
    console.error(`GCS read error (${gcsPath}):`, e.message);
    return null;
  }
}

/**
 * Write content to GCS.
 * @param {string} gcsPath
 * @param {string|Buffer} content
 * @param {string} contentType
 */
export async function gcsWrite(
  gcsPath,
  content,
  contentType = "application/json",
) {
  if (!bucket) return;
  try {
    await bucket.file(gcsPath).save(content, { resumable: false, contentType });
  } catch (e) {
    console.error(`GCS write error (${gcsPath}):`, e.message);
  }
}
