import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const TRANSLATION_SOURCES = [
  { name: "app translations", path: ["src", "app", "i18n.jsx"] },
  { name: "blox translations", path: ["src", "games", "blox", "i18n.js"] },
  { name: "match3 translations", path: ["src", "games", "match3", "i18n.js"] },
  { name: "bubbo translations", path: ["src", "games", "bubbo", "i18n.js"] },
  { name: "trivia translations", path: ["src", "games", "trivia", "i18n.js"] },
  { name: "farm translations", path: ["src", "games", "farm", "i18n.js"] },
  { name: "garden translations", path: ["src", "games", "garden-shelf", "lib", "i18n.tsx"] },
  { name: "merge translations", path: ["src", "games", "merge", "i18n.js"] },
  { name: "companion yard translations", path: ["src", "games", "companion-yard", "i18n.js"] },
];

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
  const marker = new RegExp(`\\n\\s*["']?${language}["']?:\\s*\\{\\r?\\n`);
  const match = marker.exec(source);
  assert.ok(match, `Missing ${language} translation block`);
  const start = match.index + match[0].length;
  const end = source.indexOf("\n  }", start);
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
    for (const source of TRANSLATION_SOURCES) {
      const sourceText = readRepoFile(...source.path);
      assertSameKeys(
        source.name,
        extractTranslationKeys(sourceText, "en"),
        extractTranslationKeys(sourceText, "ru"),
      );
    }
  });

  it("defines every literal translation key used by app and game UI code", () => {
    const knownKeys = new Set();
    for (const source of TRANSLATION_SOURCES) {
      const sourceText = readRepoFile(...source.path);
      for (const key of extractTranslationKeys(sourceText, "en")) knownKeys.add(key);
    }
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
      && !file.includes(path.join("src", "games", "settlement"))
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

it("extracts quoted and unquoted language keys without requiring a final trailing comma", () => {
  for (const quote of ["", '"', "'"]) {
    const source = `const translations = {\n  ${quote}en${quote}: {\n    "example.key": "English {count}"\n  },\n  ${quote}ru${quote}: {\n    "example.key": "Русский {count}"\n  }\n};`;
    assert.deepEqual([...extractTranslationKeys(source, "en")], ["example.key"]);
    assert.deepEqual([...extractTranslationKeys(source, "ru")], ["example.key"]);
  }
});


it("player-facing copy omits implementation details and decorative setup lines", () => {
  const trivia = readRepoFile("src", "games", "trivia", "TriviaGame.jsx");
  assert.doesNotMatch(trivia, /c\('(?:subtitle|questionsLanguage|historyNote|nextHint)'\)/);
  assert.match(trivia, /visibility: seconds === 0 \? 'visible' : 'hidden'/);
  assert.match(trivia, /aria-hidden=\{seconds !== 0\}/);
  const copy = readRepoFile("src", "games", "trivia", "triviaCopy.js");
  for (const key of ["forfeitNote", "uncertainAnswer", "uncertainLifeline", "simulationBody", "expired", "once"]) {
    assert.match(copy, new RegExp(`${key}:`), key);
  }
  assert.match(copy, /Recent public duels/);
  assert.match(copy, /Недавние публичные дуэли/);
  const app = readRepoFile("src", "App.jsx");
  assert.doesNotMatch(app, /t\("app\.(?:runtime|eyebrow)"\)/);
  assert.match(app, /profileBotName &&/);
  assert.match(app, /aria-label=\{`\$\{t\(`app\.status\.\$\{status\}`\)/);
  const shared = readRepoFile("src", "app", "i18n.jsx");
  for (const state of ["booting", "syncing", "ready", "offline"]) {
    assert.equal((shared.match(new RegExp(`"app\\.status\\.${state}"`, "g")) || []).length, 2);
  }
  assert.doesNotMatch(shared, /Loading player snapshot|Loading game runtime|Игровые ассеты|Рендерер недоступен/);
});

it("transient shared connection feedback reserves every localized status label", () => {
  const app = readRepoFile("src", "App.jsx");
  const css = readRepoFile("src", "index.css");
  assert.match(app, /\["booting", "syncing", "ready", "offline"\]\.map/);
  assert.match(app, /data-current=\{state === status\} aria-hidden=\{state !== status\}/);
  assert.match(css, /\.status-dot-label\s*\{[^}]*grid-area: 1 \/ 1;[^}]*visibility: hidden;/);
  assert.match(css, /\.status-dot-label\[data-current="true"\]\s*\{[^}]*visibility: visible;/);
});

it("catalog and placement identifiers stay out of player-facing panels", () => {
  const merge = readRepoFile("src", "games", "merge", "MergeLabView.js");
  assert.doesNotMatch(merge, /className:"ml-(?:provenance|item-use|status-why)"|children:M\("version"/);
  for (const key of ["stockKnowledge", "noStock", "cost", "result", "quoteExpired", "available", "sameProjectOutput", "cropHelp", "distillHelp"]) {
    assert.match(merge, new RegExp(`(?:p|M|v|g|A)\\("${key}"`), key);
  }
  const yard = readRepoFile("src", "games", "companion-yard", "CompanionYardGame.jsx");
  assert.doesNotMatch(yard, /Math\.round\(placementDraft\.[xy]\)/);
  assert.match(yard, /yard\.cancelPlacement/);
  assert.match(yard, /yard\.confirmPlacement/);
  const settlement = readRepoFile("src", "games", "settlement", "SettlementGame.jsx");
  assert.doesNotMatch(settlement, /runtime-слоями|>field<|>buildings<|>props<|>vfx</);
});


it("busy action buttons keep their labels and routine Merge successes do not insert rows", () => {
  const trivia = readRepoFile("src", "games", "trivia", "TriviaGame.jsx");
  assert.match(trivia, /testid="trv2-start" aria-busy=/);
  assert.match(trivia, /testid="trv2-ready" aria-busy=/);
  assert.doesNotMatch(trivia, /\{state\.busy === 'start' \? c\('sending'\)/);
  const bubbo = readRepoFile("src", "games", "bubbo", "BubboPresentation.jsx");
  assert.match(bubbo, /"aria-busy":starting/);
  assert.doesNotMatch(bubbo, /t\(starting\?"bubbo\.starting"/);
  const merge = readRepoFile("src", "games", "merge", "MergeLabView.js");
  assert.match(merge, /"aria-busy":m,\s*children:v\("confirm"\)/);
  assert.match(merge, /"aria-busy":Je,\s*children:M\("mix"\)/);
  assert.doesNotMatch(merge, /text:M\(R\.type===/);
  assert.match(merge, /retry:!0,\s*text:M\("network"\)/);
});


it("important failures stay visible in bounded overlays without new focus traps or dismiss timers", () => {
  const app = readRepoFile("src", "App.jsx"), css = readRepoFile("src", "index.css");
  assert.match(app, /className="notice" role="alert"/);
  assert.match(css, /\.telegram-app > \.notice\s*\{[^}]*position: fixed;[^}]*max-height: min\(240px, 35dvh,/);
  assert.doesNotMatch(css, /\.telegram-app\.immersive-mode \.notice/);
  const mergeCss = readRepoFile("src", "games", "merge", "merge-lab.css");
  assert.match(mergeCss, /\.ml-workspace-notice\s*\{[^}]*position: absolute;[^}]*max-height:[^}]*overflow: auto;/);
  assert.match(mergeCss, /\.ml-dialog-scroll > \.ml-notice\s*\{[^}]*position: absolute;[^}]*max-height:[^}]*overflow: auto;/);
  const merge = readRepoFile("src", "games", "merge", "MergeLabView.js");
  const notice = merge.slice(merge.indexOf('function LabNotice('), merge.indexOf('function LabDialog('));
  assert.match(notice, /s\.retry&&jsxRuntime\.jsx\(LabButton/);
  assert.match(notice, /onClick:r/);
  assert.doesNotMatch(notice, /focus\(|setTimeout|role:"dialog"|aria-modal/);
});
