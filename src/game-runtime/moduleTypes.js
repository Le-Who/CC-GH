/**
 * @typedef {"menu" | "mode-select" | "playing" | "paused" | "result"} GameShellChromeState
 */

/**
 * @typedef {Object} GameSessionResult
 * @property {number} score
 * @property {number} reward
 * @property {boolean} completed
 * @property {string=} mode
 */

/**
 * Repo-native game app contract for Pixi-backed modules mounted by the React shell.
 *
 * @typedef {Object} GameModuleApp
 * @property {string} id
 * @property {(mode?: string) => Promise<void> | void} start
 * @property {() => void} pause
 * @property {() => void} resume
 * @property {(fromQuit?: boolean) => Promise<GameSessionResult | void> | GameSessionResult | void} finish
 */

export {};
