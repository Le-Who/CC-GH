import { applyChromeGeometry as applySharedChromeGeometry } from '../shared/chrome.js';
import { VIEWPORTS, readPreviewSettings, gameQuery, viewportLabel } from './settings.js';
import { TRIVIA_PREVIEW_VERSION } from './version.js';
document.getElementById('preview-version').textContent = TRIVIA_PREVIEW_VERSION;
document.title = `Trivia · ${TRIVIA_PREVIEW_VERSION} · OFFLINE DEMO`;

const settings = readPreviewSettings(location.search);
const frame = document.getElementById('game-frame');
const shell = document.getElementById('preview-shell');
const chrome = document.getElementById('chrome');
const language = document.getElementById('language');
const fixture = document.getElementById('fixture');
const viewport = document.getElementById('viewport');
const controls = document.getElementById('demo-controls');
const toggle = document.getElementById('toggle-controls');
const sound = document.getElementById('sound');
let soundEnabled = false;
const copy = {
  en: {
    chrome: 'Optional chrome simulation', clean: 'Clean game area', telegram: 'Simulated header · 56 CSS px', 'telegram-safe': 'Test header + notch/insets · 28 + 56 + 20; landscape sides 24 CSS px',
    raw: 'Raw viewport', usable: 'Usable game area', simulation: 'Arbitrary test rectangles only, not Telegram/device specifications or a real-device result.', badge: 'SIMULATED CHROME', header: 'Telegram-like header · 56 CSS px',
    simulatedNote: 'Raw CSS viewport includes the test reserves; usable game-area dimensions are measured separately. Not a device model or screen pixels.',
    notice: 'Local simulation. No online players: duels use a simulated opponent. Join code DEMO. Memory only; reload resets.',
    language: 'Language', fixture: 'Local fixture', viewport: 'Game viewport', starter: 'New player', progress: 'Sample progress', saved: 'Saved run',
    reset: 'Reset local demo', hide: 'Hide controls', show: 'Show controls', soundOn: 'Sound: on', soundOff: 'Sound: off',
    available: 'Available area', note: 'CSS pixels · no scaling', area: 'Game area',
  },
  ru: {
    chrome: 'Симуляция интерфейса', clean: 'Чистая область игры', telegram: 'Условная шапка · 56 CSS-пикселей', 'telegram-safe': 'Тест: шапка + вырез · 28 + 56 + 20; бока 24 горизонтально',
    raw: 'Исходная область', usable: 'Доступная область игры', simulation: 'Произвольные тестовые отступы, не спецификация Telegram/устройства и не результат на настоящем устройстве.', badge: 'УСЛОВНЫЙ ИНТЕРФЕЙС', header: 'Условная шапка Telegram · 56 CSS-пикселей',
    simulatedNote: 'Исходная CSS-область включает тестовые отступы; доступная область игры измеряется отдельно. Это не модель устройства и не пиксели экрана.',
    notice: 'Локальная симуляция. Игроков онлайн нет: соперник смоделирован. Код входа DEMO. Данные только в памяти.',
    language: 'Язык', fixture: 'Локальные данные', viewport: 'Размер игры', starter: 'Новый игрок', progress: 'Пример прогресса', saved: 'Сохранённая игра',
    reset: 'Сбросить демоверсию', hide: 'Скрыть настройки', show: 'Показать настройки', soundOn: 'Звук: вкл.', soundOff: 'Звук: выкл.',
    available: 'Доступная область', note: 'CSS-пиксели · без масштабирования', area: 'Область игры',
  },
};
for (const item of VIEWPORTS) {
  const option = document.createElement('option');
  option.value = item.id;
  option.textContent = viewportLabel(item.id, settings.language);
  viewport.append(option);
}
language.value = settings.language;
fixture.value = settings.fixture;
viewport.value = settings.viewport;
chrome.value = settings.chrome;

function rememberInUrl() {
  const query = new URLSearchParams({ ...Object.fromEntries(gameQuery(settings)), viewport: settings.viewport, chrome: settings.chrome, controls: settings.controlsVisible ? 'visible' : 'hidden' });
  history.replaceState(null, '', `?${query}`);
}
function updateSize() {
  const rect = frame.getBoundingClientRect();
  const raw = shell.getBoundingClientRect();
  const labels = copy[settings.language];
  const size = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  document.getElementById('local-size').textContent = `${labels.raw}: ${Math.round(raw.width)} × ${Math.round(raw.height)} · ${labels.usable}: ${size} · DPR ${window.devicePixelRatio || 1}`;
}
function updateLabels() {
  const labels = copy[settings.language];
  document.documentElement.lang = settings.language;
  document.getElementById('notice').textContent = labels.notice;
  for (const id of ['language', 'fixture', 'viewport', 'chrome']) document.getElementById(`${id}-label`).textContent = labels[id];
  fixture.querySelector('[value="starter"]').textContent = labels.starter;
  fixture.querySelector('[value="progress"]').textContent = labels.progress;
  fixture.querySelector('[value="long-text"]').textContent = settings.language === 'ru' ? 'Длинный текст' : 'Long text stress';
  fixture.querySelector('[value="retry-start"]').textContent = settings.language === 'ru' ? 'Ошибка старта / повтор' : 'Start error / retry';
  fixture.querySelector('[value="uncertain-answer"]').textContent = settings.language === 'ru' ? 'Неясный статус ответа' : 'Uncertain answer';
  for (const option of viewport.options) option.textContent = viewportLabel(option.value, settings.language);
  for (const option of chrome.options) option.textContent = labels[option.value];
  document.getElementById('simulation-note').textContent = labels.simulation;
  document.getElementById('simulation-badge').textContent = labels.badge;
  document.getElementById('simulated-header-label').textContent = labels.header;
  document.getElementById('reset').textContent = labels.reset;
  document.getElementById('size-note').textContent = settings.chrome === 'clean' ? labels.note : labels.simulatedNote;
  toggle.textContent = settings.controlsVisible ? labels.hide : labels.show;
  toggle.setAttribute('aria-expanded', String(settings.controlsVisible));
  controls.hidden = !settings.controlsVisible;
  sound.textContent = soundEnabled ? labels.soundOn : labels.soundOff;
  sound.setAttribute('aria-pressed', String(soundEnabled));
  updateSize();
}
function applyChromeGeometry() { applySharedChromeGeometry(shell, settings.chrome); }
function updateViewport() {
  const item = VIEWPORTS.find(item => item.id === settings.viewport);
  shell.style.width = item.width ? `${item.width}px` : '100%';
  shell.style.height = item.height ? `${item.height}px` : '100%';
  applyChromeGeometry();
  document.getElementById('preview-stage').dataset.exact = item.width ? 'true' : 'false';
  updateSize();
  rememberInUrl();
}
function resetGame() {
  soundEnabled = false;
  frame.src = `./game.html?${gameQuery(settings)}`;
  rememberInUrl();
  updateLabels();
}
language.addEventListener('change', () => { settings.language = language.value; resetGame(); });
fixture.addEventListener('change', () => { settings.fixture = fixture.value; resetGame(); });
viewport.addEventListener('change', () => { settings.viewport = viewport.value; updateViewport(); });
chrome.addEventListener('change', () => { settings.chrome = chrome.value; updateViewport(); updateLabels(); });
document.getElementById('reset').addEventListener('click', resetGame);
toggle.addEventListener('click', () => {
  settings.controlsVisible = !settings.controlsVisible;
  updateLabels();
  rememberInUrl();
});
sound.addEventListener('click', () => {
  frame.contentWindow?.postMessage({ type: 'trivia-preview-sound', enabled: !soundEnabled }, location.origin);
});
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== 'trivia-preview-sound-state') return;
  soundEnabled = event.data.enabled === true;
  updateLabels();
});
const updateGeometryAndSize = () => { applyChromeGeometry(); updateSize(); };
const sizeObserver = new ResizeObserver(updateGeometryAndSize);
sizeObserver.observe(frame);
sizeObserver.observe(shell);
window.addEventListener('resize', updateGeometryAndSize);
window.addEventListener('orientationchange', updateGeometryAndSize);
window.visualViewport?.addEventListener('resize', updateGeometryAndSize);
frame.addEventListener('load', () => {
  // The game may reload itself from its exit/error screen. It always restarts muted.
  soundEnabled = false;
  updateLabels();
});
updateViewport();
resetGame();
