import {makeLivingPlantArt,supportsLivingPlant,notifyPlantTouch,getLivingPlantMotionState,LIVING_MOTION_CHANGE,listenToMotionPreference} from './living/living-plant-art.mjs';
import React, { createContext, useContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Home, Settings, X, Plus, Info, ChevronLeft, ChevronRight, Archive, Trash2, Lock, ArrowUpCircle, Check } from 'lucide-react';
import { useGame } from './lib/GardenContext';
import { useGardenI18n } from './lib/i18n';
import { MAX_SHELVES, SPOTS_PER_SHELF, PLANT_TYPES, SHELF_UNLOCK_COSTS, formatGardenGoldAmount, toGardenGoldDisplayValue, formatGardenRate, getProduction, getUpgradeCost, getPlantUnlockLevel, getGardenWaterCooldownMs, getGardenLevelReward } from './constants';
import { buildGardenQuestSections, getGardenReadyQuestCount } from '../../../game-logic/garden-quests.js';
import { GARDEN_LEVEL_UP_EVENT, GARDEN_OPEN_QUESTS_EVENT } from './events';
import { useGameHub } from '../../game-state/useGameHub.js';
import { HudRegion, HudEditableRegion, useHudLayout } from '../../app/hud-layout/index.js';
import { openHome } from '../../app/homeNavigation.js';
import { resolveGardenComposition } from './gardenComposition.js';
import { applyGardenHostLayout } from './gardenHostLayout.js';
import { createGardenPressSession, createGardenActionGate, createGardenShelfDrag, orderGardenQuests, clampGardenPercent } from './gardenInteraction.js';
import { R2_PLANTS, R2_SHELF_COSTS, R2_SHELF_CHAPTERS, r2GoldRate, r2ChapterReward } from '../../../game-logic/garden-r2/catalog.js';
import { formatR2Gold, formatR2Rate, gardenPlantPhaseDuration } from './lib/gardenR2View.js';
import { requiresGardenReload } from './lib/gardenR2Transactions.js';
import { Art, Button, Dialog, FeedbackContext, PlantArt, Progress, art, remaining, usePlantTapAcknowledgement } from './GardenViewShared.tsx';
import { lazy, Suspense } from 'react';
import './garden-presentation.css';
const SettingsDialog=lazy(()=>import('./GardenSettingsDialog.tsx'));
const Quests=lazy(()=>import('./GardenQuests.tsx'));
const Shop=lazy(()=>import('./GardenShop.tsx'));
const Detail=lazy(()=>import('./GardenDetail.tsx'));
const GardenR2Progress=lazy(()=>import('./components/GardenR2Progress'));

function PlantSpot({
  plant,
  onDetails,
  compact,
  blocked,
  onFeedback,
  spotWidth,
  highlighted,
  deferArt = false
}: any) {
  const {
      tapPlant, r2, accountingReady
    } = useGame(),
    {
      t
    } = useGardenI18n(),
    tapRef = useRef(() => {}),
    detailsRef = useRef(onDetails),
    tapAcknowledgement = usePlantTapAcknowledgement();
  tapRef.current = async () => {
    if (blocked || (r2 && !accountingReady)) return;
    const result = await tapPlant(plant.id);
    if (r2 && result !== true) return;
    notifyPlantTouch(plant.id);
    tapAcknowledgement.acknowledge();
    onFeedback(t(plant.phase >= 3 ? 'plantDetail.tapGold' : 'plantDetail.tapGrowth'));
  };
  detailsRef.current = onDetails;
  const press = useMemo(() => createGardenPressSession({
    onTap: () => tapRef.current(),
    onDetails: () => detailsRef.current()
  }), []);
  useEffect(() => {
    const abort = () => press.cancel();
    window.addEventListener('blur', abort);
    document.addEventListener('visibilitychange', abort);
    return () => {
      abort();
      window.removeEventListener('blur', abort);
      document.removeEventListener('visibilitychange', abort);
    };
  }, [press]);
  useEffect(() => {
    if (blocked) press.cancel();
  }, [blocked, press]);
  if (!plant) return <article className="gs2-spot gs2-empty"><button type="button" className="gs2-empty-target" aria-label={t('shop.seedShop')} onClick={onDetails} disabled={blocked}><Art name="pot" /><span><Plus size={20} />{t('ui.plant')}</span></button><p>{t('ui.emptySpot')}</p></article>;
  const def = PLANT_TYPES[plant.type] || PLANT_TYPES.daisy,
    canWater = !plant.lastWatered || (r2 ? r2.serverNow : Date.now()) - plant.lastWatered >= getGardenWaterCooldownMs(plant.phase);
  return <article className="gs2-spot" data-gs2-tapped={tapAcknowledgement.active ? "true" : undefined} data-plant-id={plant.id} data-gs2-placed={highlighted ? "true" : undefined}><button type="button" className="gs2-plant-target" disabled={blocked || (!!r2 && !accountingReady)} aria-label={`${t(`plant.${def.id}`)}: ${t(plant.phase >= 3 ? 'plantDetail.tapGold' : 'plantDetail.tapGrowth')}`} onPointerDown={e => press.start(e)} onPointerMove={e => press.move(e)} onPointerUp={e => press.end(e)} onPointerCancel={() => press.cancel()} onLostPointerCapture={() => press.cancel()} onPointerLeave={() => press.cancel()} onContextMenu={e => e.preventDefault()} onClick={e => {
      if (e.detail === 0) tapRef.current();
    }}><PlantArt plant={plant} deferOffscreen={deferArt} size={Math.min(compact ? 90 : 122, Math.max(44, spotWidth - 28))} />{canWater && <span className="gs2-water-ready" aria-label={t('plantDetail.water')}><Art name="water" /></span>}</button><h3>{t(`plant.${def.id}`)}</h3><div className="gs2-plant-state">{plant.phase < 3 ? <span data-testid="garden-growth-timer">{remaining(plant, r2)}</span> : <span>{t('ui.mature')}</span>}<small>{t(r2 ? 'r2.rankShort' : 'label.levelShort')} {plant.level}</small></div><Button onClick={onDetails} disabled={blocked} className="gs2-details" aria-label={`${t('plantDetail.details')}: ${t(`plant.${def.id}`)}`} data-plant-details-button="true"><Info size={16} /><span>{t('ui.details')}</span></Button></article>;
}

export default function GardenPresentation({
  transportError = '',
  onDismissError = () => {},
  onReviewPending = null
}: any) {
  const {
      state, r2,
      accountingReady,
      unlockShelf,
      movePlantToShelf,
      renameGarden,
      levelUp,
      clearOfflineEarnings
    } = useGame(),
    {
      t
    } = useGardenI18n(),
    {
      resolvedLayout,
      viewport
    } = useHudLayout(),
    stage = useRef<HTMLDivElement>(null),
    dialogOpener = useRef<HTMLElement | null>(null),
    shelf = useRef<HTMLDivElement>(null),
    placementRequest = useRef<any>(null),
    placementFocus = useRef<string | null>(null),
    [placement, setPlacement] = useState<any>(null),
    [highlighted, setHighlighted] = useState<string | null>(null),
    [dragging, setDragging] = useState(false),
    [size, setSize] = useState({
      width: viewport.width,
      height: viewport.height
    }),
    [panel, setPanel] = useState<string | null>(null),
    [spot, setSpot] = useState<any>(null),
    [renaming, setRenaming] = useState(false),
    [draft, setDraft] = useState(''),
    [actionBusy, setBusy] = useState(false),
    [localError, setLocalError] = useState(''),
    [feedback, setFeedback] = useState(''),
    [notice, setNotice] = useState<any>(null),
    gate = useRef(createGardenActionGate()),
    seen = useRef<any>(null),
    previousR2Reward = useRef<any>(null),
    lastResult = useGameHub(s => s.lastResult);
  const busy = actionBusy;
  const run = useCallback(async (fn: any) => {
    if (gate.current.isPending()) return false;
    setBusy(true);
    setLocalError('');
    onDismissError();
    try {
      return await gate.current.run(fn);
    } catch {
      setLocalError(t('ui.actionError'));
      return false;
    } finally {
      setBusy(false);
    }
  }, [accountingReady, t, onDismissError]);
  const close = useCallback(() => {
      dialogOpener.current = null;
      placementRequest.current = null;
      placementFocus.current = null;
      setPlacement(null);
      setPanel(null);
      setSpot(null);
    }, []),
    openPanel = (kind: string, opener?: HTMLElement) => {
      dialogOpener.current = opener || document.activeElement as HTMLElement;
      setPanel(kind);
      setSpot(null);
    },
    openSpot = (s: number, p: number, id?: string, opener?: HTMLElement) => {
      // Capture before setPanel disables the shelf controls and the browser blurs them.
      dialogOpener.current = opener || (id ? stage.current?.querySelector<HTMLElement>(`[data-plant-id="${CSS.escape(id)}"] [data-plant-details-button]`) : null) || document.activeElement as HTMLElement;
      placementFocus.current = null;
      placementRequest.current = null;
      setPlacement(null);
      setSpot({
        shelfIndex: s,
        spotIndex: p,
        plantId: id
      });
      setPanel('spot');
    };
  useLayoutEffect(() => applyGardenHostLayout(
    stage.current?.closest('.telegram-app[data-active-tab="garden"]'),
    resolvedLayout
  ), [resolvedLayout]);
  useLayoutEffect(() => {
    const node = stage.current;
    if (!node) return;
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = node.getBoundingClientRect();
        setSize(o => o.width === Math.round(r.width) && o.height === Math.round(r.height) ? o : {
          width: Math.round(r.width),
          height: Math.round(r.height)
        });
      });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(node);
    window.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('resize', sync);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('resize', sync);
    };
  }, []);
  const layout = useMemo(() => resolveGardenComposition({
    ...size,
    hudLayout: resolvedLayout
  }), [size, resolvedLayout]);
  useEffect(() => {
    const q = () => {
        openPanel('quests');
        return true;
      },
      up = () => void run(levelUp);
    (window as any).__openGardenQuests = q;
    window.addEventListener(GARDEN_OPEN_QUESTS_EVENT, q);
    window.addEventListener(GARDEN_LEVEL_UP_EVENT, up);
    return () => {
      if ((window as any).__openGardenQuests === q) delete (window as any).__openGardenQuests;
      window.removeEventListener(GARDEN_OPEN_QUESTS_EVENT, q);
      window.removeEventListener(GARDEN_LEVEL_UP_EVENT, up);
    };
  }, [levelUp, run]);
  useEffect(() => {
    if (!lastResult || seen.current === lastResult) return;
    seen.current = lastResult;
    if (!String(lastResult.action || '').startsWith('garden.')) return;
    if (['GARDEN_R2_TAP_COOLDOWN','GARDEN_R2_WATER_COOLDOWN'].includes(lastResult.error)) return;
    if (lastResult.error) setLocalError(t('ui.actionError'));else if (lastResult.action === 'garden.levelUp' && lastResult.reward) setNotice({
      reward: lastResult.reward,
      level: lastResult.garden?.level || lastResult.snapshot?.garden?.level || state.level
    });
  }, [lastResult, state.level, t]);
  useEffect(() => {
    if (!r2) return;
    const previous = previousR2Reward.current;
    previousR2Reward.current = { chapter: r2.chapter, pending: r2.pendingLegacyRewardGold };
    if (!previous) return;
    let reward = previous.pending > 0 && r2.pendingLegacyRewardGold === 0 ? previous.pending : 0;
    for (let chapter = previous.chapter; chapter < r2.chapter; chapter++) reward += r2ChapterReward(chapter);
    if (reward > 0) setNotice(previousNotice => ({ reward: reward + (previousNotice?.r2 ? previousNotice.reward : 0), level: r2.chapter, r2: true }));
  }, [r2]);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(''), 1800);
    return () => clearTimeout(timer);
  }, [feedback]);
  useEffect(() => {
    if (state.name || r2) return;
    try {
      const old = localStorage.getItem('garden_shelf_name');
      if (old?.trim()) renameGarden(old);
    } catch {}
  }, [state.name, renameGarden, r2]);
  const placed = useMemo(() => new Map(state.plants.filter(p => r2 ? (p as any).isActive === true : p.spotIndex >= 0).map(p => [`${p.shelfIndex}:${p.spotIndex}`, p])), [state.plants, r2]);
  // Inventory placement keeps its picker while the local state change is verified.
  // Seed purchases keep their existing transition to the newly bought plant.
  const activePlant = spot ? spot.plantId ? state.plants.find(p => p.id === spot.plantId && (!r2 || (p as any).isActive === true)) : placed.get(`${spot.shelfIndex}:${spot.spotIndex}`) : null;
  const placePlant = async (plant: any, target: any) => {
    if (placementRequest.current || gate.current.isPending()) return false;
    const request = {
      plantId: plant.id,
      shelfIndex: target.shelfIndex,
      spotIndex: target.spotIndex
    };
    placementRequest.current = request;
    const succeeded = await run(() => movePlantToShelf(plant.id, target.shelfIndex, target.spotIndex));
    if (placementRequest.current !== request) return false;
    if (succeeded) setPlacement(request);else placementRequest.current = null;
    return succeeded;
  };
  useEffect(() => {
    if (!placement || placementRequest.current !== placement) return;
    const plant = state.plants.find(p => p.id === placement.plantId && p.shelfIndex === placement.shelfIndex && p.spotIndex === placement.spotIndex);
    if (!plant) {
      placementRequest.current = null;
      setPlacement(null);
      setLocalError(t('ui.placementError'));
      return;
    }
    close();
    placementFocus.current = plant.id;
    setHighlighted(plant.id);
    setFeedback(t('ui.placed', {
      name: t(`plant.${plant.type}`)
    }));
  }, [placement, state.plants, close, t]);
  const saveName = () => {
    renameGarden(draft);
    try {
      if (!r2) draft.trim() ? localStorage.setItem('garden_shelf_name', draft.trim()) : localStorage.removeItem('garden_shelf_name');
    } catch {}
    setRenaming(false);
  };
  const reloadRequired = requiresGardenReload(transportError);
  const accountingNeedsReview = ['GARDEN_R2_LEGACY_REVIEW_REQUIRED','GARDEN_R2_INTENT_AMBIGUOUS','GARDEN_R2_INTENT_CONFLICT','GARDEN_R2_INTENT_SUPERSEDED','GARDEN_INTENT_AMBIGUOUS','GARDEN_INTENT_CONFLICT','GARDEN_INTENT_SUPERSEDED'].includes(transportError);
  const accountingError = reloadRequired ? 'r2.reloadRequired' : accountingNeedsReview ? 'ui.accountingReview' : ['GARDEN_ACCOUNTING_CAPACITY','GARDEN_R2_ACCOUNTING_CAPACITY'].includes(transportError) ? 'ui.accountingCapacity' : ['GARDEN_CROSS_TAB_LOCK_UNAVAILABLE','GARDEN_R2_CROSS_TAB_LOCK_UNAVAILABLE'].includes(transportError) ? 'ui.accountingBrowser' : ['GARDEN_STORAGE_UNAVAILABLE','GARDEN_R2_STORAGE_UNAVAILABLE'].includes(transportError) ? 'ui.accountingStorage' : 'ui.actionError';
  const error = reloadRequired ? t('r2.reloadRequired') : localError || (transportError ? t(accountingError) : '');
  const dismissError = () => {
    setLocalError('');
    onDismissError();
  };
  const metricDigits = !layout.landscape && layout.rail < 330 ? 7 : 9;
  const shortGold = (value: number) => {
    const full = r2 ? formatR2Gold(value) : formatGardenGoldAmount(value);
    return full.length > metricDigits ? new Intl.NumberFormat('en', {
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(r2 ? value : toGardenGoldDisplayValue(value)) : full;
  };
  const goldFull = r2 ? formatR2Gold(state.gold) : formatGardenGoldAmount(state.gold),
    goldShort = shortGold(state.gold);
  const xpFull = r2?.chapter === 30 ? t('r2.chapterComplete') : `${state.xp}/${state.xpRequired}`;
  const xpShort = r2?.chapter === 30 ? xpFull : xpFull.length > metricDigits ? `${Math.floor(clampGardenPercent(state.xp / state.xpRequired * 100))}%` : xpFull;
  useEffect(() => {
    if (spot?.plantId && !state.plants.some(p => p.id === spot.plantId && p.spotIndex >= 0)) close();
  }, [spot, state.plants, close]);
  const readyCount = r2 ? r2.quests.flatMap(section => section.quests).filter(q => q.complete && q.unlocked && !q.claimed).length : getGardenReadyQuestCount(state),
    offline = !!state.offlineEarnings && state.offlineEarnings > 0,
    blocked = !!panel || !!notice || offline;
  const shelfCosts = r2 ? R2_SHELF_COSTS : SHELF_UNLOCK_COSTS;
  const shelfLocked = !!r2 && r2.chapter < R2_SHELF_CHAPTERS[state.shelvesUnlocked];
  const drag = useMemo(() => createGardenShelfDrag({
    getViewport: () => shelf.current,
    onDragging: setDragging
  }), []);
  useEffect(() => {
    const abort = () => drag.cancel();
    window.addEventListener('blur', abort);
    document.addEventListener('visibilitychange', abort);
    return () => {
      abort();
      window.removeEventListener('blur', abort);
      document.removeEventListener('visibilitychange', abort);
    };
  }, [drag]);
  useEffect(() => {
    if (blocked) {
      drag.cancel();
      placementFocus.current = null;
    }
  }, [blocked, drag]);
  useEffect(() => {
    if (!highlighted || blocked || placementFocus.current !== highlighted) return;
    const frame = requestAnimationFrame(() => {
      const viewport = shelf.current;
      const node = Array.from(viewport?.querySelectorAll<HTMLElement>('[data-plant-id]') || []).find(n => n.dataset.plantId === highlighted);
      if (!node || !viewport || placementFocus.current !== highlighted || node.closest('[inert]')) return;
      placementFocus.current = null;
      const bounds = node.getBoundingClientRect(),
        visible = viewport.getBoundingClientRect();
      if (bounds.top < visible.top) viewport.scrollTop += bounds.top - visible.top - 4;else if (bounds.bottom > visible.bottom) viewport.scrollTop += bounds.bottom - visible.bottom + 4;
      node.querySelector<HTMLElement>('.gs2-plant-target')?.focus({
        preventScroll: true
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [highlighted, blocked]);
  useEffect(() => {
    if (!highlighted) return;
    const timer = setTimeout(() => setHighlighted(null), 1800);
    return () => clearTimeout(timer);
  }, [highlighted]);
  return <FeedbackContext.Provider value={{
    error,
    busy,
    onDismiss: dismissError,
    returnFocusRef: dialogOpener
  }}><HudRegion id="gardenRoot" ref={stage} applyLayout={false} className="gs2-stage" data-gs2-arrangement={layout.landscape ? 'side' : 'stack'} data-gs2-compact={String(layout.compact)} style={{
      '--gs2-padding': `${layout.padding}px`,
      '--gs2-gap': `${layout.gap}px`,
      '--gs2-rail': `${layout.rail}px`,
      '--gs2-rack': `${layout.rackWidth}px`,
      '--gs2-row': `${layout.rowHeight}px`,
      '--gs2-plant-height': `${layout.plantHeight}px`,
      '--gs2-dialog-max': `${layout.dialogMax}px`
    } as React.CSSProperties}>
 <HudEditableRegion id="gardenBackgroundAsset" className="gs2-backdrop" aria-hidden="true"><Art name="background" /></HudEditableRegion>
 <div className="gs2-layout" data-hud-region="gardenComposition"><HudRegion id="gardenStatusRail" applyLayout={false} className="gs2-header"><div className="gs2-name-row"><HudEditableRegion id="gardenHomeButton" as="button" type="button" className="gs2-button gs2-home" aria-label={t("nav.allGames")} onClick={openHome}><span className="gs2-button-content"><Home size={24}/></span></HudEditableRegion><HudRegion id="gardenSign" applyLayout={false} className="gs2-name"><HudEditableRegion id="gardenSignAsset" className="gs2-name-art" aria-hidden="true" />{renaming ? <form onSubmit={e => {
                e.preventDefault();
                saveName();
              }}><input autoFocus aria-label={t('garden.rename')} maxLength={22} value={draft} onChange={e => setDraft(e.target.value)} onBlur={saveName} onKeyDown={e => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setRenaming(false);
                  }
                }} /></form> : <button type="button" onClick={() => {
                setDraft(state.name || t('garden.defaultName'));
                setRenaming(true);
              }} aria-label={t('garden.rename')}>{state.name || t('garden.defaultName')}</button>}</HudRegion><Button className="gs2-settings" aria-label={t('settings.open')} onClick={(event: any) => openPanel('settings', event.currentTarget)}><Settings size={24} /></Button></div><div className="gs2-metrics"><div className="gs2-metric" data-garden-gold="true" title={`${t('hud.gold')}: ${goldFull}`} aria-label={`${t('hud.gold')}: ${goldFull}`}><span><Art name="coin" />{t('hud.gold')}</span><strong>{goldShort}</strong>{r2 && <small>{formatR2Rate(r2.goldMilliPerMinute)} {t('r2.goldPerMinute')}</small>}</div><button type="button" className="gs2-metric gs2-xp" data-garden-xp="true" disabled={!state.levelReady || busy || !accountingReady} onClick={() => run(levelUp)} title={`${t('hud.level')} ${state.level} · ${t('level.progress')}: ${xpFull}`} aria-label={`${t('hud.level')} ${state.level} · ${t(state.levelReady ? (r2 ? 'r2.claimReward' : 'level.up') : 'level.progress')}: ${xpFull}`}><span><Art name="leaf" />{t('hud.level')} {state.level}</span><strong>{state.levelReady ? `+${shortGold(r2 ? r2.pendingLegacyRewardGold : getGardenLevelReward(state.level))}` : xpShort}</strong><Progress value={r2?.chapter === 30 ? 100 : state.xp / state.xpRequired * 100} />{state.levelReady && <small>{t(r2 ? 'r2.claimReward' : 'level.up')}</small>}</button><button type="button" className="gs2-metric" onClick={event => openPanel(r2 ? 'progression' : 'quests', event.currentTarget)} aria-label={t(r2 ? 'r2.title' : 'quest.open')}><span><Art name="quest" />{t(r2 ? 'r2.titleShort' : 'ui.quests')}</span><strong>{r2 ? `${r2.substrate}/${r2.substrateCapacity}` : readyCount > 0 ? readyCount : t('quest.openShort')}</strong></button></div></HudRegion>
 <HudRegion id="gardenShelf" ref={shelf} applyLayout={false} className="gs2-shelf-viewport" role="region" aria-label={t('ui.shelves')} tabIndex={0} data-no-nav-swipe="true" data-gs2-dragging={String(dragging)} onPointerDown={e => {
          if (!blocked) drag.start(e);
        }} onPointerMove={e => drag.move(e)} onPointerUp={e => drag.end(e)} onPointerCancel={e => drag.cancel(e)} onLostPointerCapture={e => drag.cancel(e)} onPointerLeave={e => drag.cancel(e)} onMouseLeave={() => drag.cancel()} onWheel={() => drag.cancel()} onDragStart={() => drag.cancel()} onClickCapture={e => drag.click(e)}><div className="gs2-rack">{Array.from({
              length: Math.min(MAX_SHELVES, state.shelvesUnlocked)
            }, (_, s) => <section className="gs2-shelf-row" key={s} aria-label={t('ui.shelf', {
              number: s + 1
            })}><div className="gs2-spots">{Array.from({
                  length: SPOTS_PER_SHELF
                }, (_, p) => {
                  const plant = placed.get(`${s}:${p}`);
                  return <PlantSpot key={p} plant={plant} deferArt={s > 0} highlighted={highlighted === plant?.id} spotWidth={layout.spotWidth} compact={layout.compact} blocked={blocked} onFeedback={setFeedback} onDetails={(event: any) => openSpot(s, p, plant?.id, event?.currentTarget)} />;
                })}</div><img className="gs2-shelf-art" data-hud-region="gardenShelfAsset" src={art('shelf')} alt="" draggable={false} /></section>)}{state.shelvesUnlocked < MAX_SHELVES && <section className="gs2-expansion"><Lock size={24} /><div><h3>{t('garden.expand')}</h3><p>{shelfLocked ? t('r2.researchRequires', { chapter: R2_SHELF_CHAPTERS[state.shelvesUnlocked] }) : t('ui.expandHelp')}</p></div><Button primary disabled={busy || !accountingReady || state.gold < shelfCosts[state.shelvesUnlocked] || shelfLocked} onClick={() => run(unlockShelf)}><Art name="coin" />{r2 ? formatR2Gold(shelfCosts[state.shelvesUnlocked]) : formatGardenGoldAmount(shelfCosts[state.shelvesUnlocked])}</Button>{state.gold < shelfCosts[state.shelvesUnlocked] && <small>{t('ui.notEnoughGold')}</small>}</section>}</div></HudRegion></div>
 {/* This reserved feedback row is internal to gardenRoot/gardenComposition. Status changes never resize the shelf. */}
 <div className="gs2-status" role={error ? 'alert' : 'status'} aria-live="polite"><span className="gs2-status-reserve" aria-hidden="true">{t('ui.help')}</span><div className="gs2-status-content">{error ? <><span className="gs2-status-error" tabIndex={0}>{error}</span>{accountingNeedsReview && onReviewPending && <Button onClick={() => onReviewPending(t('ui.accountingConfirm', { gold: '[[GOLD]]' }))}>{t('ui.accountingReviewButton')}</Button>}<Button onClick={reloadRequired ? () => window.location.reload() : dismissError} aria-label={t(reloadRequired ? 'r2.reload' : 'ui.close')}>{reloadRequired ? t('r2.reload') : <X size={16} />}</Button></> : <span>{feedback || t('ui.help')}</span>}</div></div>
 <Suspense fallback={null}>{r2 && !offline && !notice && panel === 'progression' && <GardenR2Progress Dialog={Dialog} Button={Button} onClose={close} onQuests={() => setPanel('quests')} run={run} busy={busy} />}
 {!offline && !notice && panel === 'settings' && <SettingsDialog onClose={close} />} {!offline && !notice && panel === 'quests' && <Quests onClose={close} run={run} busy={busy} />} {!offline && !notice && panel === 'spot' && spot && (activePlant && !placementRequest.current ? <Detail plantId={activePlant.id} onClose={close} onSelect={(p: any) => setSpot({
        shelfIndex: p.shelfIndex,
        spotIndex: p.spotIndex,
        plantId: p.id
      })} run={run} busy={busy} onFeedback={setFeedback} /> : spot.plantId ? null : <Shop spot={spot} onClose={close} onPlace={placePlant} run={run} busy={busy} />)}</Suspense>
 {offline && <Dialog title={t('offline.title')} kind="offline-reward" onClose={clearOfflineEarnings}><p>{t('offline.body')}</p><div className="gs2-reward"><Art name="coin" /><strong>{formatGardenGoldAmount(state.offlineEarnings!)}</strong>{!!state.offlineXp && <span>{t('offline.xp', {
              amount: state.offlineXp
            })}</span>}</div><Button primary onClick={clearOfflineEarnings}>{t('offline.collect')}</Button></Dialog>}
 {notice && !offline && <Dialog title={t('level.rewardTitle')} kind="reward" onClose={() => setNotice(null)}><p>{t(notice.r2 ? 'r2.rewardBody' : 'level.rewardBody', {
            level: notice.level
          })}</p><div className="gs2-reward"><Art name="coin" /><strong>{notice.r2 ? formatR2Gold(notice.reward) : formatGardenGoldAmount(notice.reward)}</strong></div><Button primary onClick={() => setNotice(null)}>{t('settings.done')}</Button></Dialog>}
 </HudRegion></FeedbackContext.Provider>;
}

export { Detail, Quests, SettingsDialog, Shop };
export { Dialog } from './GardenViewShared.tsx';
