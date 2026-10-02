// Evaluate the actual recovered render functions without importing React or mounting Pixi.
// This checks emitted UI props/callbacks; browser layout and effect lifecycles remain separate QA.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as bloxArt from "../../src/games/blox/bloxArt.js";
import * as match3Art from "../../src/games/match3/match3Art.js";
import * as bubboArt from "../../src/games/bubbo/bubboArt.js";
import { composeBlox } from "../../src/games/blox/bloxComposition.js";
import { composeMatch3 } from "../../src/games/match3/match3Composition.js";
import { composeBubbo } from "../../src/games/bubbo/bubboComposition.js";
import { bloxKeyboardIntent } from "../../src/games/blox/bloxInteraction.js";
import { remainingArcadeSafeInsets } from "../../src/app/arcadeBoundary.js";
import { remainingBubboSafeInsets } from "../../src/games/bubbo/bubboBoundary.js";
import { resolveAssetUrl } from "../../src/game-runtime/assetBundles.js";

const require = createRequire(import.meta.url);
const { acorn } = require("../../recovery-tools/ast-recovery.cjs");
const classes = { blox: "Blox", match3: "Match3", bubbo: "Bubbo" };
export const arcadeGames = Object.keys(classes);
export const arcadeArt = {
  blox: { assets: { ...bloxArt.BLOX_ART, ...bloxArt.BLOX_BLOCK_ART }, skin: bloxArt.bloxPanelSkin, button: "button", dialog: "panel", prefix: "bx" },
  match3: { assets: { ...match3Art.MATCH3_ART, ...match3Art.MATCH3_GEM_ART, ...match3Art.MATCH3_TOOL_ART }, skin: match3Art.match3PanelSkin, button: "card", dialog: "card", prefix: "m3" },
  bubbo: { assets: bubboArt.BUBBO_ART, skin: bubboArt.bubboPanelSkin, button: "button", dialog: "panel", prefix: "bb" },
};

export function renderArcadePresentation(gameId, overrides = {}, viewport = { width: 390, height: 844 }) {
  const name = classes[gameId];
  if (!name) throw new Error(`Unknown arcade game: ${gameId}`);
  const full = readFileSync(new URL(`../../src/games/${gameId}/${name}Presentation.jsx`, import.meta.url), "utf8");
  const ast = acorn.parse(full, { ecmaVersion: "latest", sourceType: "module" });
  const source = ast.body.filter((node) => !node.type.startsWith("Import") && !node.type.startsWith("Export"))
    .map((node) => full.slice(node.start, node.end)).join("\n");
  const calls = [];
  const focus = [];
  const escapes = [];
  const callback = (name) => (...args) => calls.push({ name, args });
  const modes = ["classic", "timed", "drop"].map((id) => ({ id, labelKey: `match3.mode.${id}`, hintKey: `match3.mode.${id}Hint` }));
  const props = {
    gameActive: true, paused: false, inputLocked: false, score: 420, movesLeft: 17, combo: 2,
    currentReward: 12, rewardProgress: 0.5, mode: "classic", currentMode: modes[0], modes,
    selectedGemType: "fire", activeBooster: "bomb", shuffleCharges: 1,
    boosters: { bomb: 2, lightning: 0, rainbow: 1, hammer: 3 }, leaders: [],
    selectedPiece: 0, trayPieces: 1, swapCharges: 1, highScore: 900, savedRun: null,
    starting: false, error: "", runResult: null,
    state: { board: Array.from({ length: 10 }, () => Array(10).fill(null)), tray: [{ piece: { cells: [[0, 0]] } }], score: 420, linesCleared: 3, rotateCharges: 2, gameActive: true },
    sceneState: {
      bubbo: { score: 420, shotsLeft: 17, timeLeft: 31, powerups: { bomb: 2, rainbow: 1, lightning: 0 }, activePowerup: "bomb", pressureStep: 0.5 },
      onBloxCell: callback("cell"), onBloxTray: callback("tray"),
    },
    ...Object.fromEntries(["Pause", "Resume", "Start", "New", "Finish", "Exit", "ModeChange", "Mode", "Reroll", "Shuffle", "Booster", "Rotate", "ResumeSaved", "Swap", "Power"].map((name) => [`on${name}`, callback(name)])),
    ...overrides,
  };
  const React = {
    Component: class {}, Fragment: "fragment", Suspense: "suspense",
    lazy: () => "lazy-canvas",
    useRef: (current) => ({ current }), useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
    useMemo: (fn) => fn(), useEffect() {}, useLayoutEffect() {},
  };
  const jsx = (type, props) => ({ type, props });
  const useGameEvents = (selector) => selector({ events: [] });
  useGameEvents.getState = () => ({ dismissEvent() {} });
  const context = {
    React, jsxRuntime: { jsx, jsxs: jsx, Fragment: "fragment" },
    HudRegion: "hud-region", HudEditableRegion: "hud-editable-region", BubboField: "bubbo-field",
    useAppI18n: () => ({ language: "en", t: (key, values) => values ? `${key}:${JSON.stringify(values)}` : key }),
    useHudLayout: () => ({ viewport, resolvedLayout: { viewport: { safeAreaInsets: {} }, regions: {} }, editorVisible: false }),
    useGameEvents, useDialogFocus: (_ref, options) => focus.push(options), useEscapeDismiss: (active, callback) => escapes.push({ active, callback }),
    composeBlox, composeMatch3, composeBubbo, bloxKeyboardIntent, remainingArcadeSafeInsets, remainingBubboSafeInsets, resolveAssetUrl,
    ...bloxArt, ...match3Art, ...bubboArt,
  };
  const component = vm.runInNewContext(`${source}\n${name}Presentation`, context, { filename: `${name}Presentation.jsx` });
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand);
    if (node == null || typeof node !== "object") return node;
    if (typeof node.type === "function") {
      // Error boundaries and lazy canvas engines are intentionally not mounted.
      if (node.type.prototype?.render) return expand(node.props.children);
      return expand(node.type(node.props));
    }
    return { ...node, props: { ...node.props, children: expand(node.props?.children) } };
  }
  return { tree: expand(component(props)), props, calls, focus, escapes };
}

export function findElements(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((child) => findElements(child, predicate));
  if (tree == null || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...findElements(tree.props?.children, predicate)];
}

export function textContent(tree) {
  if (Array.isArray(tree)) return tree.map(textContent).join(" ");
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  return textContent(tree.props?.children);
}
