import { readSplitGameSource } from './helpers/splitGameSources.mjs';
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SETTLEMENT_EN } from "../src/games/settlement/settlementText.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const TRANSLATION_SOURCES = [
  { name: "app translations", path: ["src", "app", "i18n.jsx"] },
  { name: "blox translations", path: ["src", "games", "blox", "i18n.js"] },
  { name: "match3 translations", path: ["src", "games", "match3", "i18n.js"] },
  { name: "bubbo translations", path: ["src", "games", "bubbo", "i18n.js"] },
  { name: "trivia translations", path: ["src", "games", "trivia", "i18n.js"] },
  { name: "garden translations", path: ["src", "games", "garden-shelf", "lib", "gardenTranslations.ts"] },
  { name: "merge translations", path: ["src", "games", "merge", "i18n.js"] },
  { name: "companion yard translations", path: ["src", "games", "companion-yard", "i18n.js"] },
  { name: "persistent yard translations", path: ["src", "games", "companion-yard-v2", "i18n.js"] },
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
    if (file.includes(path.join('src', 'games', 'settlement')) && /[А-Яа-яЁё]/.test(key)) {
      key = `settlement.text.${key.trim()}`;
    }
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
    for (const key of Object.keys(SETTLEMENT_EN)) knownKeys.add(`settlement.text.${key}`);
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
  assert.match(app, /profileBotName=\{profileBotName\}/);
  assert.match(readRepoFile("src", "app", "HomeCatalogue.jsx"), /profileBotName &&/);
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
  const settlement = readSplitGameSource(new URL("../src/games/settlement/SettlementGame.jsx", import.meta.url));
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


it("copy geometry distinguishes deliberate scrolling from control and content reflow", async () => {
  const { scrollContentRect } = await import('./e2e/helpers/scrollGeometry.js');
  const before = { control: { x: 36, y: 572.65625, width: 135, height: 44 }, pane: { x: 24, y: 94, width: 272, height: 450 }, scrollLeft: 0, scrollTop: 0 };
  const scrolled = { ...before, control: { ...before.control, y: 487.65625 }, scrollTop: 85 };
  assert.deepEqual(scrollContentRect(scrolled), scrollContentRect(before));
  // Negative controls: never normalize away a real inserted row or a resized button.
  const insertedRow = { ...scrolled, control: { ...scrolled.control, y: scrolled.control.y + 12 } };
  const changedHeight = { ...scrolled, control: { ...scrolled.control, height: 64 } };
  assert.notDeepEqual(scrollContentRect(insertedRow), scrollContentRect(before));
  assert.notDeepEqual(scrollContentRect(changedHeight), scrollContentRect(before));
  const source = readRepoFile('tests', 'e2e', 'player-copy.spec.js');
  assert.ok(source.indexOf('confirm.scrollIntoViewIfNeeded()') < source.indexOf('beforeConfirm = prepared.control'));
  assert.match(source, /expect\(geometry\.pending\)\.toEqual\(prepared\)/);
  assert.match(source, /expect\(geometry\.failed\)\.toEqual\(prepared\)/);
  assert.match(source, /beforeConfirm\);/);
});

it("the lost-reply replay browser regression follows the current concise retry label", () => {
  const spec = readRepoFile('tests', 'e2e', 'merge-v3.spec.js');
  assert.doesNotMatch(spec, /name: 'Check the same request'/);
  assert.equal((spec.match(/name: 'Check result'/g) || []).length, 3);
  for (const guard of ['requests[1]).toEqual(requests[0])', 'mergeLab.replayed).toBe(true)', 'after.merge.stock).toEqual(once.merge.stock)', 'after.merge.freeTapCharges).toBe(once.merge.freeTapCharges)']) {
    assert.ok(spec.includes(guard), guard);
  }
});

it("shared transport failures use current RU/EN copy without replacing domain warnings", async () => {
  // Exercise the actual translations and formatter without needing a React DOM.
  const source = readRepoFile('src', 'app', 'i18n.jsx').replace(
    'import { createContext, useContext } from "react";',
    'const createContext = value => value; const useContext = value => value;',
  );
  const { playerFeedbackText } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const expected = {
    en: {
      NETWORK_ERROR: 'No reply received. Check your connection, then refresh to check the result before trying again.',
      TIMEOUT: 'The reply is taking too long. Refresh to check the result before trying again.',
    },
    ru: {
      NETWORK_ERROR: 'Ответ не получен. Проверьте соединение, затем обновите страницу и проверьте результат перед повторной попыткой.',
      TIMEOUT: 'Ответ задерживается. Обновите страницу и проверьте результат перед повторной попыткой.',
    },
  };
  for (const [language, messages] of Object.entries(expected)) {
    for (const [code, text] of Object.entries(messages)) {
      assert.equal(playerFeedbackText(language, code), text);
    }
    for (const message of ['', 'Insufficient gold', 'No confirmed reply yet. Check the result before trying another action', 'GARDEN_INTENT_AMBIGUOUS']) {
      assert.equal(playerFeedbackText(language, message), message);
    }
  }
  assert.equal(playerFeedbackText('unknown', 'NETWORK_ERROR'), expected.en.NETWORK_ERROR);
  assert.equal(playerFeedbackText('en', 'NETWORK_ERROR'), expected.en.NETWORK_ERROR);
  assert.equal(playerFeedbackText('ru', 'NETWORK_ERROR'), expected.ru.NETWORK_ERROR);
});


it("persistent courtyard status and feedback use the active translator, including dynamic roles", async () => {
  const raw = readRepoFile("src", "games", "companion-yard-v2", "i18n.js");
  const pure = raw.replace(/^import .*;\r?\n/gm, "").replace(/^registerAppTranslations\(PERSISTENT_YARD_TRANSLATIONS\);?$/gm, "");
  const { PERSISTENT_YARD_TRANSLATIONS: translations } = await import(`data:text/javascript;base64,${Buffer.from(pure).toString("base64")}`);
  const commonRaw = readRepoFile("src", "games", "companion-yard", "i18n.js");
  const commonPure = commonRaw.replace(/^import .*;\r?\n/gm, "").replace(/^registerAppTranslations\(COMPANION_YARD_TRANSLATIONS\);?$/gm, "");
  const { COMPANION_YARD_TRANSLATIONS: common } = await import(`data:text/javascript;base64,${Buffer.from(commonPure).toString("base64")}`);
  const { YARD_VISITORS } = await import("../game-logic/yard-catalog.js");
  const { visibleStatus } = await import("../src/games/companion-yard-v2/presentation.mjs");
  const { yardFeedbackText, YARD_FEEDBACK_KEYS } = await import("../src/games/companion-yard-v2/feedback.mjs");
  const view = { mutable:true, pendingGifts:[], legacy:[], pets:[], issues:[], props:[], yard:{remodel:"meadow"}, bowls:[] };
  for (const language of ["en", "ru"]) {
    const dictionary = { ...common[language], ...translations[language] };
    const t = (key, values={}) => {
      assert.equal(typeof dictionary[key], "string", `${language}: ${key}`);
      return dictionary[key].replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
    };
    for (const role of ["rest", "settle", "wake", "play", "roam", "approach", "depart", "unknown"]) {
      for (const visitor of Object.values(YARD_VISITORS)) {
        const text = visibleStatus({...view, pets:[{visitorId:visitor.id,role}]}, t);
        assert.ok(text.includes(visitor.name));
        if (language === "en") assert.doesNotMatch(text, /[А-Яа-яЁё]/);
      }
      const unknown = visibleStatus({...view, pets:[{visitorId:"unlisted-visitor",role}]}, t);
      assert.ok(unknown.includes(common[language]["yard.visitor"]));
    }
    for (const sample of [{mutable:false}, {pendingGifts:[{}]}, {legacy:[{}]}, {issues:[{}]},
      {props:[{readiness:{status:"reposition-needed"}}]}, {yard:{remodel:"tea_house"}},
      {props:[{supported:false}]}, {bowls:[{foodId:"kibble",servings:1}]}, {}]) {
      const text = visibleStatus({...view,...sample},t);
      assert.ok(text); assert.doesNotMatch(text, /yard\.persistent|\{count\}/);
      if (language === "en") assert.doesNotMatch(text, /[А-Яа-яЁё]/);
    }
    for (const code of Object.keys(YARD_FEEDBACK_KEYS)) assert.equal(yardFeedbackText(code,t),t(YARD_FEEDBACK_KEYS[code]));
    assert.equal(yardFeedbackText("__proto__",t),"__proto__");
    assert.equal(yardFeedbackText("already translated network feedback",t),"already translated network feedback");
  }
  const component = readRepoFile("src", "games", "companion-yard-v2", "CourtyardGame.jsx");
  assert.match(component, /import '\.\/i18n\.js'/);
  assert.match(component, /const \{language,t\}=useAppI18n\(\)/);
  assert.doesNotMatch(component, /[А-Яа-яЁё]/);
});
