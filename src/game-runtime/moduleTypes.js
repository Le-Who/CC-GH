/**
 * @typedef {"hub" | "menu" | "mode-select" | "playing" | "paused" | "settings" | "result"} GameShellChromeState
 */

/**
 * @typedef {Object} BubboRunState
 * @property {Array<Array<string|null>>} board
 * @property {string} seed
 * @property {number} waveIndex
 * @property {number} rowOffset
 * @property {number} pressure
 * @property {number} pressureStep
 * @property {number} shotsLeft
 * @property {number} score
 */

/**
 * @typedef {Object} PixiPointerSessionContract
 * @property {(event: object, data?: unknown) => object|null} start
 * @property {(event: object) => object|null} move
 * @property {(event: object) => object|null} end
 * @property {(reason?: string, event?: object) => object|null} cancel
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
