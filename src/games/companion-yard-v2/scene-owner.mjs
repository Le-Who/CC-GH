import {PIP_GROUNDING_PREVIEW_RECIPE} from './pip-preview-gate.mjs';
import {PresentationClock} from './presentation-clock.mjs';
import {isCanonicalItemIntent} from '../../game-state/canonicalYardProtocol.mjs';

/** A fetch/decode and its renderer must retire before any replacement allocates. */
let retirementBarrier = Promise.resolve();
const defaultMonotonicNow = () => performance.now(), clockDomains = new WeakMap();
function clockFor(now) {
 if (!clockDomains.has(now)) clockDomains.set(now, new PresentationClock(now));
 return clockDomains.get(now);
}

export function createSceneOwner(canvas, {
 loadScene, canonicalSavedVisitsAllowed = false, directHost, uiImageOwner,
 onView = () => {}, onError = () => {}, onPrototypeState = () => {}, onSceneFailure = () => {}, ...options
}) {
 let active = null, snapshot = null, view = null, disposed = false, suspended = false;
 let epoch = 0, tail = Promise.resolve(), currentMode = 'transition', canonicalSavedVisits = false;
 let canonicalActionPending = false, failureDetail = null, lastRetired = null, transitions = 0, retirements = 0;
 let ownerAccount = null, ownerSession = null, ownerObserved = false;
 const savedVisitClock = clockFor(options.now ?? defaultMonotonicNow);
 const snapshotMode = () => {
  const runtime = snapshot?.yardRuntime;
  if (ownerObserved && !runtime) return 'unavailable';
  if (runtime?.storageVersion === 3 || runtime?.canonicalVisitProtocol !== undefined) {
   return canonicalSavedVisitsAllowed && runtime.version === 1 && runtime.storageVersion === 3
    && runtime.canonicalVisitProtocol === 'yard-canonical-authoritative/v1' && !runtime.error
    && ['ready', 'reconciliation-pending'].includes(runtime.status) ? 'canonical-saved-visits' : 'unavailable';
  }
  if (runtime && (runtime.version !== 1 || runtime.error || runtime.mutable !== true || runtime.status !== 'ready'
   || runtime.storageVersion !== undefined && ![1, 2].includes(runtime.storageVersion))) return 'unavailable';
  return 'canonical-items';
 };
 const live = token => token === epoch && !disposed && !suspended;
 const child = () => !disposed && !suspended && ['canonical-items', 'canonical-saved-visits'].includes(currentMode) ? active : null;
 function hideSurface(hidden) {
  if (canvas.style) canvas.style.visibility = hidden ? 'hidden' : '';
  if (directHost?.style) directHost.style.visibility = hidden ? 'hidden' : '';
 }
 function state(extra = {}) {
  onPrototypeState({allowed: true, enabled: !disposed && !suspended, canonicalItems: true,
   canonicalSavedVisits, mode: currentMode, error: failureDetail?.message ?? null, ...extra});
 }
 function unavailableView() {
  if (view) {
   view = {...view, pets: [], mutable: false, itemMutable: false, mediaReady: false};
   onView(view);
  }
 }
 function retireChild(old) {
  let finished;
  try { finished = old.dispose(); } catch (error) { finished = Promise.reject(error); }
  const done = Promise.resolve(finished).then(() => {
   retirements++;
   try { lastRetired = old.diagnostics?.() ?? null; } catch (error) { lastRetired = {diagnosticsError: error.message}; }
   canvas.width = 0; canvas.height = 0; hideSurface(true);
  });
  retirementBarrier = Promise.all([retirementBarrier, done]).then(() => {});
  retirementBarrier.catch(() => {});
  return retirementBarrier;
 }
 function retire() {
  const old = active; active = null;
  uiImageOwner?.setAdmissionCheck(() => false);
  hideSurface(true);
  return old ? retireChild(old) : retirementBarrier;
 }
 function fail(error, context) {
  failureDetail = {mode: currentMode, name: String(error?.name || 'Error'),
   message: String(error?.message || error).slice(0, 1024), stack: String(error?.stack || '').slice(0, 4096), context: context ?? null};
  ++epoch;
  const previous = retire(); currentMode = 'unavailable';
  unavailableView(); state({phase: 'failed'});
  // Failure never allocates a substitute. A later explicit restart, account
  // boundary or page return can create only this same clean renderer.
  tail = tail.then(() => previous).catch(() => false);
  onSceneFailure(failureDetail);
  onError(Object.assign(new Error(failureDetail.message), {code: 'YARD_PIP_SCENE_FAILED'}));
 }
 function guarded(token) {
  return {...options, ownerKey: token, canonicalItems: true, canonicalSavedVisits, savedVisitClock,
   groundingRecipe: canonicalSavedVisits ? PIP_GROUNDING_PREVIEW_RECIPE : options.groundingRecipe,
   canonicalFoodPreview: canonicalSavedVisits || options.canonicalFoodPreview, canonicalActionPending, directHost, uiImageOwner,
   onPointerInterrupt: () => { if (live(token)) options.onPointerInterrupt?.(); },
   onRestartRequired: () => { if (live(token)) restart(); },
   onView: value => { if (live(token)) { view = value; onView(value); } },
   onError: error => { if (live(token)) onError(error); },
   onPrototypeState: value => { if (live(token)) state(value); },
   onFailure: (error, context) => { if (live(token)) fail(error, context); }};
 }
 function restart() {
  if (disposed || suspended) return Promise.resolve(false);
  const mode = snapshotMode(), token = ++epoch, previous = retire();
  canonicalSavedVisits = mode === 'canonical-saved-visits';
  currentMode = mode === 'unavailable' ? 'unavailable' : 'transition';
  failureDetail = null; transitions++; unavailableView();
  state({phase: mode === 'unavailable' ? 'unavailable' : 'loading'});
  tail = tail.then(() => previous).then(async () => {
   if (!live(token) || mode === 'unavailable') return false;
   try {
    const {createPipYardScene} = await loadScene();
    if (!live(token)) return false;
    currentMode = mode;
    // The retired backing is empty. The fresh scene owns surface visibility.
    hideSurface(false);
    const made = createPipYardScene(canvas, guarded(token));
    if (!live(token)) { await retireChild(made); return false; }
    active = made;
    if (snapshot) active.update(snapshot);
    return live(token);
   } catch (error) { if (live(token)) fail(error, {operation: 'create-scene'}); return false; }
  }).catch(error => { if (live(token)) fail(error, {operation: 'retire-scene'}); return false; });
  return tail;
 }
 const onHide = () => {
  suspended = true; ++epoch;
  const previous = retire(); currentMode = 'suspended'; unavailableView();
  tail = tail.then(() => previous).catch(() => false);
  state({phase: 'off'});
 };
 const onShow = event => { if (event.persisted && !disposed && suspended) { suspended = false; restart(); } };
 window.addEventListener('pagehide', onHide); window.addEventListener('pageshow', onShow);
 // React cleanup cannot await dispose; the shared retirement barrier also
 // protects fresh owners mounted while a previous renderer is still retiring.
 restart();
 return {
  update(value, {accountSession = null} = {}) {
   if (disposed) return;
   const account = value?.player?.id ?? null;
   const changed = ownerObserved && (account !== ownerAccount || accountSession !== ownerSession);
   ownerObserved = true; ownerAccount = account; ownerSession = accountSession; snapshot = value;
   const mode = snapshotMode(), serverNow = value?.yardRuntime?.serverNow;
   if (mode === 'canonical-saved-visits' && Number.isSafeInteger(serverNow) && serverNow >= 0) savedVisitClock.update(serverNow);
   if (suspended) return;
   if (changed || mode === 'unavailable' && currentMode !== 'unavailable'
    || mode !== 'unavailable' && currentMode === 'unavailable' && !failureDetail
    || mode !== 'unavailable' && canonicalSavedVisits !== (mode === 'canonical-saved-visits')) {
    if (changed) { canonicalActionPending = false; view = null; onView(null); }
    restart(); return;
   }
   child()?.update(value);
  },
  setGhost(value) {
   if (!child() || canonicalSavedVisits || value && !isCanonicalItemIntent(value)) return false;
   active.setGhost(value); return true;
  },
  point: event => child()?.point(event) ?? null,
  hit: event => child()?.hit(event) ?? null,
  offsetPoint: (point, delta) => child()?.offsetPoint(point, delta) ?? null,
  setCanonicalActionPending(value) { canonicalActionPending = !!value; child()?.setCanonicalActionPending?.(value); },
  inspectCanonicalSlot: slotId => child()?.inspectCanonicalSlot?.(slotId) ?? false,
  selectCanonicalSlot: slotId => child()?.selectCanonicalSlot?.(slotId) ?? false,
  beginPointer: () => child()?.beginPointer?.(), endPointer: () => child()?.endPointer?.(),
  checkPlacement: value => child()?.checkPlacement?.(value) ?? null,
  defaultItemAnchor: () => child()?.defaultItemAnchor?.() ?? null,
  restart,
  setCanonicalItemsEnabled: enabled => enabled === true ? restart() : Promise.resolve(false),
  diagnostics: () => ({mode: currentMode, enabled: !disposed && !suspended, canonicalItems: true,
   canonicalSavedVisitsAllowed, canonicalSavedVisits, savedServerNow: savedVisitClock.read(),
   transitioning: currentMode === 'transition', transitions, retirements,
   lastFailure: failureDetail ? structuredClone(failureDetail) : null, lastRetired,
   uiImages: uiImageOwner?.snapshot?.() ?? null, scene: active?.diagnostics?.()}),
  get ready() { return tail.then(() => active?.ready); },
  dispose() {
   if (disposed) return tail;
   disposed = true; ++epoch;
   window.removeEventListener('pagehide', onHide); window.removeEventListener('pageshow', onShow);
   const previous = retire(); currentMode = 'disposed';
   tail = tail.then(() => previous).catch(() => false); return tail;
  },
 };
}
