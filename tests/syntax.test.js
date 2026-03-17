/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Client JS Syntax Validation (v5.0.0)
 *
 *  Dynamically imports every client-side .js module to
 *  catch SyntaxErrors that Node tests would otherwise miss
 *  (client files use DOM APIs that aren't tested directly).
 *
 *  How it works: Node.js parses the module on import(),
 *  catching syntax errors BEFORE any DOM code executes.
 *
 *  Run:  node --test tests/syntax.test.js
 * ═══════════════════════════════════════════════════════
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CLIENT_JS_DIR = path.resolve(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
  "..",
  "public",
  "js",
);

// Recursively find all .js files
function findJsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findJsFiles(full));
    } else if (entry.name.endsWith(".js")) {
      results.push(full);
    }
  }
  return results;
}

const allFiles = findJsFiles(CLIENT_JS_DIR);

// Skip generated bundles (esbuild output, not hand-written)
const SKIP = ["discord-sdk-bundle.js"];

const clientFiles = allFiles.filter((f) => !SKIP.some((s) => f.endsWith(s)));

describe("Client JS Syntax Validation", () => {
  it(`found ${clientFiles.length} client JS files to validate`, () => {
    assert.ok(
      clientFiles.length >= 10,
      `Expected ≥10 client files, found ${clientFiles.length}`,
    );
  });

  for (const filePath of clientFiles) {
    const rel = path.relative(CLIENT_JS_DIR, filePath).replace(/\\/g, "/");

    it(`${rel} — parses without SyntaxError`, async () => {
      try {
        // Dynamic import triggers Node's parser.
        // DOM ReferenceErrors (document, localStorage) are expected and OK —
        // we only care about SyntaxError (parse failure).
        await import(pathToFileURL(filePath).href);
      } catch (err) {
        if (err instanceof SyntaxError) {
          assert.fail(
            `SyntaxError in ${rel}: ${err.message}\n` +
              `  This would crash the browser. Fix the syntax before deploying.`,
          );
        }
        // Non-syntax errors (ReferenceError for 'document', etc.) are fine —
        // the file parsed successfully, it just can't run without a DOM.
      }
    });
  }
});
