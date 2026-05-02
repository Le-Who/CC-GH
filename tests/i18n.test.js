import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...segments) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf-8");
}

function listSourceFiles(root) {
  const base = path.join(repoRoot, root);
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (/\.(jsx|tsx|js)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  };
  visit(base);
  return files;
}

function extractTranslationKeys(source, language) {
  const marker = new RegExp(`\\n\\s*${language}: \\{\\r?\\n`);
  const match = marker.exec(source);
  assert.ok(match, `Missing ${language} translation block`);
  const start = match.index + match[0].length;
  const end = source.indexOf("\n  },", start);
  assert.notEqual(end, -1, `Missing end of ${language} translation block`);
  const body = source.slice(start, end);
  return new Set([...body.matchAll(/["']([^"']+)["']\s*:/g)].map(([, key]) => key));
}

function assertSameKeys(name, left, right) {
  const onlyLeft = [...left].filter((key) => !right.has(key)).sort();
  const onlyRight = [...right].filter((key) => !left.has(key)).sort();
  assert.deepEqual(onlyLeft, [], `${name} has keys missing from ru`);
  assert.deepEqual(onlyRight, [], `${name} has keys missing from en`);
}

function collectUsedTranslationKeys() {
  const files = [
    ...listSourceFiles("src"),
    ...listSourceFiles("game-logic"),
  ];
  const keys = new Map();
  const add = (file, key) => {
    if (!key.includes(".")) return;
    if (!keys.has(key)) keys.set(key, []);
    keys.get(key).push(path.relative(repoRoot, file));
  };

  for (const file of files) {
    const source = fs.readFileSync(file, "utf-8");
    const literalTCalls = /\b(?:t|appTranslate)\(\s*["']([^"']+)["']/g;
    const literalLocalTextCalls = /\btext\(\s*["']([^"']+)["']/g;
    const literalGardenCalls = /\bgardenTranslate\([^,]+,\s*["']([^"']+)["']/g;
    const keyProps = /\b(?:labelKey|hintKey|titleKey|bodyKey|descriptionKey)\s*:\s*["']([^"']+)["']/g;
    for (const [, key] of source.matchAll(literalTCalls)) add(file, key);
    for (const [, key] of source.matchAll(literalLocalTextCalls)) add(file, key);
    for (const [, key] of source.matchAll(literalGardenCalls)) add(file, key);
    for (const [, key] of source.matchAll(keyProps)) add(file, key);
  }

  return keys;
}

describe("i18n coverage", () => {
  it("keeps English and Russian translation maps in sync", () => {
    const appSource = readRepoFile("src", "app", "i18n.jsx");
    const gardenSource = readRepoFile("src", "games", "garden-shelf", "lib", "i18n.tsx");

    assertSameKeys(
      "app translations",
      extractTranslationKeys(appSource, "en"),
      extractTranslationKeys(appSource, "ru"),
    );
    assertSameKeys(
      "garden translations",
      extractTranslationKeys(gardenSource, "en"),
      extractTranslationKeys(gardenSource, "ru"),
    );
  });

  it("defines every literal translation key used by app and game UI code", () => {
    const appSource = readRepoFile("src", "app", "i18n.jsx");
    const gardenSource = readRepoFile("src", "games", "garden-shelf", "lib", "i18n.tsx");
    const knownKeys = new Set([
      ...extractTranslationKeys(appSource, "en"),
      ...extractTranslationKeys(gardenSource, "en"),
    ]);
    const usedKeys = collectUsedTranslationKeys();
    const missing = [...usedKeys.keys()]
      .filter((key) => !knownKeys.has(key))
      .map((key) => `${key} (${[...new Set(usedKeys.get(key))].join(", ")})`)
      .sort();

    assert.deepEqual(missing, []);
  });

  it("keeps user-visible JSX text behind translation calls", () => {
    const files = listSourceFiles("src").filter((file) => (
      /\.(jsx|tsx)$/.test(file)
      && !file.endsWith(path.join("app", "i18n.jsx"))
      && !file.endsWith(path.join("garden-shelf", "lib", "i18n.tsx"))
    ));
    const rawStrings = [];

    for (const file of files) {
      const source = fs.readFileSync(file, "utf-8");
      const relative = path.relative(repoRoot, file);
      const checks = [
        { pattern: />\s*([A-Za-zА-Яа-я][^<>{}]*)\s*<\/[A-Za-z]/g, label: "text node" },
        { pattern: /\b(?:aria-label|title|alt)=["']([A-Za-zА-Яа-я][^"']*)["']/g, label: "attribute" },
      ];

      for (const [index, line] of source.split(/\r?\n/).entries()) {
        for (const { pattern, label } of checks) {
          for (const match of line.matchAll(pattern)) {
            rawStrings.push(`${relative}:${index + 1}: ${label} "${match[1].trim()}"`);
          }
        }
      }
    }

    assert.deepEqual(rawStrings.sort(), []);
  });
});
