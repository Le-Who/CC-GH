// Observational only: no renderer, Image, fetch, store or timer replacements.
// Sampling starts before the entry script and continues at browser paint frames.
export function installEntryFrameProbe() {
  const samples = [], violations = [];
  let frames = 0, stopped = false, last = '';
  const roots = {
    garden: '.gs2-stage', blox: '.bx-stage', match3: '.m3-stage', bubbo: '.bb-stage',
    merge: '.ml-root, [data-game-shell="merge"]', trivia: '.trv2-root',
    room: '.companion-yard-layout, .cy-app', settlement: '.settlement-game-root',
  };
  const visible = node => {
    if (!node) return false;
    const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  function sample() {
    const host = document.getElementById('root');
    const main = document.querySelector('.telegram-app');
    if (host) {
      frames++;
      const hostStyle = getComputedStyle(host);
      const outer = { rootBackgroundImage: hostStyle.backgroundImage, rootBackgroundColor: hostStyle.backgroundColor };
      if (!main) {
        const state = { game: null, phase: 'pre-app', ...outer };
        if (outer.rootBackgroundImage !== 'none' && violations.length < 100) violations.push({ at: performance.now(), ...state });
        const key = JSON.stringify(state);
        if (key !== last && samples.length < 200) { samples.push({ at: performance.now(), ...state }); last = key; }
        if (!stopped) requestAnimationFrame(sample);
        return;
      }
      const game = main.dataset.activeTab, style = getComputedStyle(main);
      const root = main.querySelector(roots[game] || ':not(*)');
      const state = {
        game, ...outer, immersive: main.classList.contains('immersive-mode'),
        loading: visible(main.querySelector('.game-entry-status')),
        root: visible(root),
        legacyTopbar: game !== 'garden' && visible(main.querySelector('.topbar')),
        legacyStats: visible(main.querySelector('.stats-row')),
        legacyLoading: [...main.querySelectorAll(':scope > .loading-panel, .active-game-frame > .loading-panel')].some(visible),
        backgroundImage: style.backgroundImage, backgroundColor: style.backgroundColor,
        wrongRoots: Object.entries(roots).filter(([id, selector]) => id !== game && [...main.querySelectorAll(selector)].some(visible)).map(([id]) => id),
      };
      if (outer.rootBackgroundImage !== 'none' || (game !== 'garden' && !state.immersive) || state.legacyTopbar || state.legacyStats || state.legacyLoading || state.backgroundImage !== 'none' || state.wrongRoots.length) {
        if (violations.length < 100) violations.push({ at: performance.now(), ...state });
      }
      const key = JSON.stringify(state);
      if (key !== last && samples.length < 200) { samples.push({ at: performance.now(), ...state }); last = key; }
    }
    if (!stopped) requestAnimationFrame(sample);
  }
  window.__entryFrames = {
    read() { return { frames, samples, violations }; },
    stop() { stopped = true; return this.read(); },
  };
  requestAnimationFrame(sample);
}
