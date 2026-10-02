import {makeLivingPlantArt,supportsLivingPlant,notifyPlantTouch,getLivingPlantMotionState,LIVING_MOTION_CHANGE,listenToMotionPreference} from './living/living-plant-art.mjs';
import React, { createContext, useContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings, X, Plus, Info, ChevronLeft, ChevronRight, Archive, Trash2, Lock, ArrowUpCircle, Check } from 'lucide-react';
import { useGame } from './lib/GameContext';
import { useGardenI18n } from './lib/i18n';
import { getGardenSpriteFrame, getGardenSpriteStyle, GARDEN_SHEET_PATH } from './lib/sprites';
import { MAX_SHELVES, SPOTS_PER_SHELF, PLANT_TYPES, SHELF_UNLOCK_COSTS, PHASE_DURATIONS_MS, formatGardenGoldAmount, toGardenGoldDisplayValue, formatGardenRate, getProduction, getUpgradeCost, getPlantUnlockLevel, getGardenWaterCooldownMs, getGardenLevelReward } from './constants';
import { buildGardenQuestSections, getGardenReadyQuestCount } from '../../../game-logic/garden-quests.js';
import { GARDEN_LEVEL_UP_EVENT, GARDEN_OPEN_QUESTS_EVENT } from './events';
import { useGameHub } from '../../game-state/useGameHub.js';
import { audioManager } from '../../services/audioManager.js';
import { HudRegion, HudEditableRegion, useHudLayout } from '../../app/hud-layout/index.js';
import { useDialogFocus } from '../../app/useDialogFocus.js';
import { makeDialogSiblingsInert } from '../../app/dialogFocus.js';
import { useEscapeDismiss } from '../../app/useDismissableLayer.js';
import { resolveGardenComposition } from './gardenComposition.js';
import { applyGardenHostLayout } from './gardenHostLayout.js';
import { createGardenPressSession, createGardenActionGate, createGardenShelfDrag, orderGardenQuests, clampGardenPercent } from './gardenInteraction.js';
import './garden-presentation.css';
const FeedbackContext = createContext({
  error: '',
  busy: false,
  returnFocusRef: null as React.RefObject<HTMLElement | null> | null,
  onDismiss: () => {}
});
const art = (name: string) => `/games/garden-v2/${name}.webp`;
function Art({
  name,
  className = ''
}: {
  name: string;
  className?: string;
}) {
  return <img className={`gs2-art ${className}`} src={art(name)} alt="" draggable={false} />;
}
function Button({
  children,
  primary = false,
  className = '',
  ...props
}: any) {
  return <button type="button" className={`gs2-button${primary ? ' gs2-primary' : ''} ${className}`} {...props}><span className="gs2-button-content">{children}</span></button>;
}
function Progress({
  value,
  label
}: {
  value: number;
  label?: string;
}) {
  return <div className="gs2-progress-row"><span className="gs2-progress" role="progressbar" aria-label={label} aria-valuenow={Math.round(clampGardenPercent(value))} aria-valuemin={0} aria-valuemax={100}><i style={{
        width: `${clampGardenPercent(value)}%`
      }} /></span>{label && <b className="gs2-fraction">{label}</b>}</div>;
}
// A brief stationary highlight acknowledges input even when plants cannot move.
function usePlantTapAcknowledgement() {
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { active, acknowledge: () => {
    if (timer.current) clearTimeout(timer.current);
    setActive(true);
    timer.current = setTimeout(() => setActive(false), 450);
  } };
}
function PlantMotionStatus() {
  const { t } = useGardenI18n();
  const [mode, setMode] = useState(() => getLivingPlantMotionState());
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMode(getLivingPlantMotionState());
    document.addEventListener(LIVING_MOTION_CHANGE, update);
    const removePreferenceListener = listenToMotionPreference(media, update);
    update();
    return () => { document.removeEventListener(LIVING_MOTION_CHANGE, update); removePreferenceListener(); };
  }, []);
  return <section className="gs2-motion-setting" data-garden-motion={mode}>
    <strong>{t('settings.plantMotion')}</strong><p>{t(`settings.motion.${mode}`)}</p>
  </section>;
}
const LivingPlantArt=makeLivingPlantArt(React,LegacyPlantArt);
function PlantArt(props:any){return supportsLivingPlant(props.plant?.type)?<LivingPlantArt {...props}/>:<LegacyPlantArt {...props}/>;}
function LegacyPlantArt({
  plant,
  size = 112
}: {
  plant: any;
  size?: number;
}) {
  const def = PLANT_TYPES[plant.type] || PLANT_TYPES.daisy,
    frame = getGardenSpriteFrame(def.spriteIndex, plant.phase),
    scale = Math.min(size / frame.width, size / frame.height),
    [failed, setFailed] = useState(false);
  return <span className="gs2-plant-art" style={{
    width: size,
    height: size
  }}><img hidden src={GARDEN_SHEET_PATH} alt="" onError={() => setFailed(true)} />{failed ? <span className="gs2-image-missing"><Art name="pot" /><span>{def.name}</span></span> : <span style={getGardenSpriteStyle(def.spriteIndex, plant.phase, scale, GARDEN_SHEET_PATH)} />}</span>;
}
function remaining(plant: any) {
  if (plant.phase >= 3) return '';
  const ms = Math.max(0, PHASE_DURATIONS_MS[plant.phase] - plant.phaseProgress);
  return `${Math.floor(ms / 60000)}:${Math.floor(ms % 60000 / 1000).toString().padStart(2, '0')}`;
}
export function Dialog({
  title,
  kind,
  onClose,
  children
}: any) {
  const feedback = useContext(FeedbackContext);
  const ref = useRef<HTMLDivElement>(null),
    {
      t
    } = useGardenI18n();
  useDialogFocus(ref, { returnFocusRef: feedback.returnFocusRef });
  // The dialog is portaled to body. Its immediate sibling is only the scrim;
  // protect the real Hub (including dock shortcuts) at the portal-layer level.
  useEffect(() => {
    const layer = ref.current?.parentElement;
    return layer?.parentElement === document.body ? makeDialogSiblingsInert(layer) : undefined;
  }, []);
  useEscapeDismiss(true, onClose);
  return createPortal(<div className="gs2-modal-layer"><button type="button" tabIndex={-1} className="gs2-scrim" data-menu-blocker="true" aria-label={t('ui.close')} onClick={onClose} /><section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="gs2-dialog" data-garden-panel={kind} data-hud-region={kind === 'quests' ? 'gardenQuestSheet' : 'gardenSheet'}><header className="gs2-dialog-heading"><div className="gs2-dialog-title"><h2>{title}</h2><span className="gs2-pending" role="status" aria-live="polite">{feedback.busy ? t('ui.pending') : ''}</span></div><Button className="gs2-close" onClick={onClose} aria-label={t('ui.close')}><X size={22} /></Button></header><div className="gs2-dialog-scroll">{children}</div>{feedback.error && <div className="gs2-error-banner gs2-dialog-error" role="alert"><span tabIndex={0}>{feedback.error}</span><Button aria-label={t('ui.close')} onClick={feedback.onDismiss}><X size={18} /></Button></div>}</section></div>, document.body);
}
function PlantSpot({
  plant,
  onDetails,
  compact,
  blocked,
  onFeedback,
  spotWidth,
  highlighted
}: any) {
  const {
      tapPlant
    } = useGame(),
    {
      t
    } = useGardenI18n(),
    tapRef = useRef(() => {}),
    detailsRef = useRef(onDetails),
    tapAcknowledgement = usePlantTapAcknowledgement();
  tapRef.current = () => {
    if (blocked) return;
    tapPlant(plant.id);
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
    canWater = !plant.lastWatered || Date.now() - plant.lastWatered >= getGardenWaterCooldownMs(plant.phase);
  return <article className="gs2-spot" data-gs2-tapped={tapAcknowledgement.active ? "true" : undefined} data-plant-id={plant.id} data-gs2-placed={highlighted ? "true" : undefined}><button type="button" className="gs2-plant-target" disabled={blocked} aria-label={`${t(`plant.${def.id}`)}: ${t(plant.phase >= 3 ? 'plantDetail.tapGold' : 'plantDetail.tapGrowth')}`} onPointerDown={e => press.start(e)} onPointerMove={e => press.move(e)} onPointerUp={e => press.end(e)} onPointerCancel={() => press.cancel()} onLostPointerCapture={() => press.cancel()} onPointerLeave={() => press.cancel()} onContextMenu={e => e.preventDefault()} onClick={e => {
      if (e.detail === 0) tapRef.current();
    }}><PlantArt plant={plant} size={Math.min(compact ? 90 : 122, Math.max(44, spotWidth - 28))} />{canWater && <span className="gs2-water-ready" aria-label={t('plantDetail.water')}><Art name="water" /></span>}</button><h3>{t(`plant.${def.id}`)}</h3><div className="gs2-plant-state">{plant.phase < 3 ? <span data-testid="garden-growth-timer">{remaining(plant)}</span> : <span>{t('ui.mature')}</span>}<small>{t('label.levelShort')} {plant.level}</small></div><Button onClick={onDetails} disabled={blocked} className="gs2-details" aria-label={`${t('plantDetail.details')}: ${t(`plant.${def.id}`)}`} data-plant-details-button="true"><Info size={16} /><span>{t('ui.details')}</span></Button></article>;
}
export function SettingsDialog({
  onClose
}: any) {
  const {
      t,
      language,
      setLanguage
    } = useGardenI18n(),
    [sound, setSound] = useState(audioManager.isEnabled()),
    [busy, setBusy] = useState(false);
  return <Dialog title={t('settings.title')} kind="settings" onClose={onClose}><div className="gs2-setting"><strong>{t('settings.sound')}</strong><Button disabled={busy} aria-pressed={sound} onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          setSound(await audioManager.toggle());
        } finally {
          setBusy(false);
        }
      }}>{t(sound ? 'settings.soundOn' : 'settings.soundOff')}</Button></div><fieldset className="gs2-setting"><legend>{t('settings.language')}</legend><div className="gs2-action-row">{(['en', 'ru'] as const).map(lang => <Button key={lang} aria-pressed={language === lang} primary={language === lang} onClick={() => setLanguage(lang)}>{t(lang === 'en' ? 'settings.english' : 'settings.russian')}</Button>)}</div></fieldset><PlantMotionStatus /><Button primary onClick={onClose}>{t('settings.done')}</Button></Dialog>;
}
export function Quests({
  onClose,
  run,
  busy
}: any) {
  const {
      state,
      claimQuest,
      accountingReady
    } = useGame(),
    {
      t
    } = useGardenI18n(),
    quests = useMemo(() => orderGardenQuests(buildGardenQuestSections(state)), [state]);
  return <Dialog title={t('quest.title')} kind="quests" onClose={onClose}><p className="gs2-muted">{t('quest.subtitle')}</p><div className="gs2-quest-list">{quests.length ? quests.map(q => <article key={q.id} className="gs2-quest-card" data-quest-id={q.id} data-quest-kind={q.kind} data-quest-claimed={String(!!q.claimed)} data-quest-locked={String(!!q.locked)}><span className="gs2-kicker">{t(q.kind === 'daily' ? 'quest.daily' : 'quest.story')}</span><h3>{t(q.titleKey, q.titleVars)}</h3><p>{t(q.bodyKey, q.bodyVars)}</p><div className="gs2-quest-reward"><Art name="coin" /><strong>{formatGardenGoldAmount(q.reward)}</strong></div><Progress value={q.percent} label={t('quest.progress', {
          current: q.current,
          target: q.target
        })} />{q.endowed > 0 && <small>{t('quest.endowed', {
            count: q.endowed
          })}</small>}<Button primary disabled={busy || !accountingReady || !q.unlocked || !q.complete || q.claimed} onClick={() => run(() => claimQuest(q.id, q.reward))}>{q.claimed ? <Check size={18} /> : q.locked ? <Lock size={18} /> : <Art name="quest" />}{t(q.claimed ? 'quest.claimed' : q.locked ? 'quest.locked' : 'quest.claim')}</Button></article>) : <p>{t('ui.noQuests')}</p>}</div></Dialog>;
}
export function Shop({
  spot,
  onClose,
  onPlace,
  run,
  busy
}: any) {
  const {
      state,
      buyPlant,
      unlockedPlants,
      accountingReady
    } = useGame(),
    {
      t
    } = useGardenI18n(),
    [tab, setTab] = useState('shop'),
    inventory = state.plants.filter(p => p.spotIndex === -1);
  return <Dialog title={t('shop.seedShop')} kind="seed-shop-inventory" onClose={onClose}><div className="gs2-tabs" role="tablist" aria-label={t('shop.seedShop')}><Button role="tab" aria-selected={tab === 'shop'} primary={tab === 'shop'} onClick={() => setTab('shop')}>{t('shop.seedShop')}</Button><Button role="tab" aria-selected={tab === 'inventory'} primary={tab === 'inventory'} onClick={() => setTab('inventory')}>{t('shop.inventory', {
          count: inventory.length
        })}</Button></div><div role="tabpanel" className="gs2-catalog">{tab === 'shop' ? Object.values(PLANT_TYPES).map(def => {
        const unlocked = unlockedPlants.includes(def.id),
          affordable = state.gold >= def.baseCost;
        return <article className="gs2-catalog-row" key={def.id}><PlantArt plant={{
            type: def.id,
            phase: 3
          }} size={58} /><div><h3>{t(`plant.${def.id}`)}</h3><p>{unlocked ? t('shop.yields', {
                amount: formatGardenRate(def.baseProduction)
              }) : t('shop.unlockAt', {
                level: getPlantUnlockLevel(def.id)
              })}</p>{unlocked && !affordable && <small>{t('ui.notEnoughGold')}</small>}</div><Button primary disabled={busy || !accountingReady || !unlocked || !affordable} onClick={() => run(() => buyPlant(def.id, spot.shelfIndex, spot.spotIndex))}>{unlocked ? <><Art name="coin" />{formatGardenGoldAmount(def.baseCost)}</> : <><Lock size={16} />{t('label.levelShort')} {getPlantUnlockLevel(def.id)}</>}</Button></article>;
      }) : inventory.length ? inventory.map(p => <article className="gs2-catalog-row" key={p.id}><PlantArt plant={p} size={58} /><div><h3>{t(`plant.${p.type}`)}</h3><p>{t('shop.phaseLevel', {
              phase: p.phase,
              level: p.level
            })}</p></div><Button primary disabled={busy} onClick={() => onPlace(p, spot)}>{t('shop.place')}</Button></article>) : <div className="gs2-empty-state"><Archive size={32} /><p>{t('ui.emptyInventory')}</p></div>}</div></Dialog>;
}
export function Detail({
  plantId,
  onClose,
  onSelect,
  run,
  busy,
  onFeedback
}: any) {
  const tapAcknowledgement = usePlantTapAcknowledgement();
  const {
      state,
      tapPlant,
      waterPlant,
      sellPlant,
      upgradePlant,
      movePlantToInventory,
      accountingReady
    } = useGame(),
    {
      t
    } = useGardenI18n(),
    p = state.plants.find(p => p.id === plantId),
    placed = state.plants.filter(p => p.shelfIndex >= 0 && p.spotIndex >= 0).sort((a, b) => a.shelfIndex - b.shelfIndex || a.spotIndex - b.spotIndex),
    i = placed.findIndex(p => p.id === plantId),
    swipe = useRef<any>(null);
  useEffect(() => {
    if (!p || p.spotIndex < 0) onClose();
  }, [p, onClose]);
  if (!p || p.spotIndex < 0) return null;
  const def = PLANT_TYPES[p.type] || PLANT_TYPES.daisy,
    mature = p.phase >= 3,
    cost = getUpgradeCost(def.baseCost, p.level),
    canWater = !p.lastWatered || Date.now() - p.lastWatered >= getGardenWaterCooldownMs(p.phase),
    waterRemaining = Math.max(0, getGardenWaterCooldownMs(p.phase) - (Date.now() - (p.lastWatered || 0))),
    nav = (d: number) => {
      if (placed.length > 1) onSelect(placed[(i + d + placed.length) % placed.length]);
    };
  return <Dialog title={t(`plant.${def.id}`)} kind="plant-detail" onClose={onClose}><div className="gs2-detail" onTouchStart={e => {
      if ((e.target as HTMLElement).closest('button,input')) return;
      const q = e.touches[0];
      swipe.current = q ? {
        x: q.clientX,
        y: q.clientY
      } : null;
    }} onTouchEnd={e => {
      const q = e.changedTouches[0],
        s = swipe.current;
      swipe.current = null;
      if (s && q && Math.abs(q.clientX - s.x) > 46 && Math.abs(q.clientX - s.x) > Math.abs(q.clientY - s.y) * 1.35) nav(q.clientX < s.x ? 1 : -1);
    }} onTouchCancel={() => {
      swipe.current = null;
    }}><p className="gs2-muted">{t(mature ? 'plantDetail.mature' : 'plantDetail.growing', mature ? {
          level: p.level
        } : {
          phase: p.phase
        })}</p><div className="gs2-detail-stage">{placed.length > 1 && <Button aria-label={t('plantDetail.previous')} onClick={() => nav(-1)}><ChevronLeft /></Button>}<button type="button" className="gs2-detail-tap" data-gs2-tapped={tapAcknowledgement.active ? "true" : undefined} onClick={() => {
          tapPlant(p.id);
          notifyPlantTouch(p.id);
          tapAcknowledgement.acknowledge();
          onFeedback(t(mature ? 'plantDetail.tapGold' : 'plantDetail.tapGrowth'));
        }} aria-label={t(mature ? 'plantDetail.tapGold' : 'plantDetail.tapGrowth')}><PlantArt plant={p} size={128} /></button>{placed.length > 1 && <Button aria-label={t('plantDetail.next')} onClick={() => nav(1)}><ChevronRight /></Button>}</div>{placed.length > 1 && <p className="gs2-center">{t('plantDetail.position', {
          current: i + 1,
          total: placed.length
        })}</p>}<p className="gs2-center">{t(mature ? 'plantDetail.tapGold' : 'plantDetail.tapGrowth')}</p><div className="gs2-detail-stat" data-testid="garden-care-level"><span>{t('label.levelShort')}</span><strong>{p.level}</strong></div><div className="gs2-detail-stat"><span>{t(mature ? 'plantDetail.production' : 'plantDetail.timeLeft')}</span><strong>{mature ? `${formatGardenRate(getProduction(def.baseProduction, p.level))} ${t('unit.goldPerSecond')}` : remaining(p)}</strong></div>{!mature && <Progress value={p.phaseProgress / PHASE_DURATIONS_MS[p.phase] * 100} label={`${Math.floor(clampGardenPercent(p.phaseProgress / PHASE_DURATIONS_MS[p.phase] * 100))}%`} />}<Button primary disabled={busy || !canWater} onClick={() => run(() => waterPlant(p.id))}><Art name="water" />{t(mature ? 'plantDetail.careWater' : 'plantDetail.water')}{!canWater && <span>{Math.ceil(waterRemaining / 60000)} {t('ui.min')}</span>}</Button>{mature && <Button primary disabled={busy || !accountingReady || state.gold < cost} onClick={() => run(() => upgradePlant(p.id))}><ArrowUpCircle size={20} /><span>{t('plantDetail.evolve')}</span><span className="gs2-price"><Art name="coin" />{formatGardenGoldAmount(cost)}</span></Button>}<div className="gs2-action-row"><Button disabled={busy} onClick={() => run(() => movePlantToInventory(p.id))}><Archive size={18} />{t('plantDetail.stash')}</Button><Button disabled={busy || !accountingReady} className="gs2-danger" onClick={() => run(() => sellPlant(p.id))}><Trash2 size={18} />{t('plantDetail.sell')}</Button></div></div></Dialog>;
}
export default function GardenPresentation({
  transportError = '',
  onDismissError = () => {},
  onReviewPending = null
}: any) {
  const {
      state,
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
    if (lastResult.error) setLocalError(t('ui.actionError'));else if (lastResult.action === 'garden.levelUp' && lastResult.reward) setNotice({
      reward: lastResult.reward,
      level: lastResult.garden?.level || lastResult.snapshot?.garden?.level || state.level
    });
  }, [lastResult, state.level, t]);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(''), 1800);
    return () => clearTimeout(timer);
  }, [feedback]);
  useEffect(() => {
    if (state.name) return;
    try {
      const old = localStorage.getItem('garden_shelf_name');
      if (old?.trim()) renameGarden(old);
    } catch {}
  }, [state.name, renameGarden]);
  const placed = useMemo(() => new Map(state.plants.filter(p => p.spotIndex >= 0).map(p => [`${p.shelfIndex}:${p.spotIndex}`, p])), [state.plants]);
  // Inventory placement keeps its picker while the local state change is verified.
  // Seed purchases keep their existing transition to the newly bought plant.
  const activePlant = spot ? spot.plantId ? state.plants.find(p => p.id === spot.plantId) : placed.get(`${spot.shelfIndex}:${spot.spotIndex}`) : null;
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
      draft.trim() ? localStorage.setItem('garden_shelf_name', draft.trim()) : localStorage.removeItem('garden_shelf_name');
    } catch {}
    setRenaming(false);
  };
  const accountingNeedsReview = ['GARDEN_INTENT_AMBIGUOUS','GARDEN_INTENT_CONFLICT','GARDEN_INTENT_SUPERSEDED'].includes(transportError);
  const accountingError = accountingNeedsReview ? 'ui.accountingReview' : transportError === 'GARDEN_ACCOUNTING_CAPACITY' ? 'ui.accountingCapacity' : transportError === 'GARDEN_CROSS_TAB_LOCK_UNAVAILABLE' ? 'ui.accountingBrowser' : transportError === 'GARDEN_STORAGE_UNAVAILABLE' ? 'ui.accountingStorage' : 'ui.actionError';
  const error = localError || (transportError ? t(accountingError) : '');
  const dismissError = () => {
    setLocalError('');
    onDismissError();
  };
  const metricDigits = !layout.landscape && layout.rail < 330 ? 7 : 9;
  const shortGold = (value: number) => {
    const full = formatGardenGoldAmount(value);
    return full.length > metricDigits ? new Intl.NumberFormat('en', {
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(toGardenGoldDisplayValue(value)) : full;
  };
  const goldFull = formatGardenGoldAmount(state.gold),
    goldShort = shortGold(state.gold);
  const xpFull = `${state.xp}/${state.xpRequired}`;
  const xpShort = xpFull.length > metricDigits ? `${Math.floor(clampGardenPercent(state.xp / state.xpRequired * 100))}%` : xpFull;
  useEffect(() => {
    if (spot?.plantId && !state.plants.some(p => p.id === spot.plantId && p.spotIndex >= 0)) close();
  }, [spot, state.plants, close]);
  const readyCount = getGardenReadyQuestCount(state),
    offline = !!state.offlineEarnings && state.offlineEarnings > 0,
    blocked = !!panel || !!notice || offline;
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
 <div className="gs2-layout" data-hud-region="gardenComposition"><HudRegion id="gardenStatusRail" applyLayout={false} className="gs2-header"><div className="gs2-name-row"><HudRegion id="gardenSign" applyLayout={false} className="gs2-name"><HudEditableRegion id="gardenSignAsset" className="gs2-name-art" aria-hidden="true" />{renaming ? <form onSubmit={e => {
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
              }} aria-label={t('garden.rename')}>{state.name || t('garden.defaultName')}</button>}</HudRegion><Button className="gs2-settings" aria-label={t('settings.open')} onClick={(event: any) => openPanel('settings', event.currentTarget)}><Settings size={24} /></Button></div><div className="gs2-metrics"><div className="gs2-metric" data-garden-gold="true" title={`${t('hud.gold')}: ${goldFull}`} aria-label={`${t('hud.gold')}: ${goldFull}`}><span><Art name="coin" />{t('hud.gold')}</span><strong>{goldShort}</strong></div><button type="button" className="gs2-metric gs2-xp" data-garden-xp="true" disabled={!state.levelReady || busy || !accountingReady} onClick={() => run(levelUp)} title={`${t('level.progress')}: ${xpFull}`} aria-label={`${t(state.levelReady ? 'level.up' : 'level.progress')}: ${xpFull}`}><span><Art name="leaf" />{t('label.levelShort')} {state.level}</span><strong>{state.levelReady ? `+${shortGold(getGardenLevelReward(state.level))}` : xpShort}</strong><Progress value={state.xp / state.xpRequired * 100} />{state.levelReady && <small>{t('level.up')}</small>}</button><button type="button" className="gs2-metric" onClick={event => openPanel('quests', event.currentTarget)} aria-label={t('quest.open')}><span><Art name="quest" />{t('ui.quests')}</span><strong>{readyCount > 0 ? readyCount : t('quest.openShort')}</strong></button></div></HudRegion>
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
                  return <PlantSpot key={p} plant={plant} highlighted={highlighted === plant?.id} spotWidth={layout.spotWidth} compact={layout.compact} blocked={blocked} onFeedback={setFeedback} onDetails={(event: any) => openSpot(s, p, plant?.id, event?.currentTarget)} />;
                })}</div><img className="gs2-shelf-art" data-hud-region="gardenShelfAsset" src={art('shelf')} alt="" draggable={false} /></section>)}{state.shelvesUnlocked < MAX_SHELVES && <section className="gs2-expansion"><Lock size={24} /><div><h3>{t('garden.expand')}</h3><p>{t('ui.expandHelp')}</p></div><Button primary disabled={busy || !accountingReady || state.gold < SHELF_UNLOCK_COSTS[state.shelvesUnlocked]} onClick={() => run(unlockShelf)}><Art name="coin" />{formatGardenGoldAmount(SHELF_UNLOCK_COSTS[state.shelvesUnlocked])}</Button>{state.gold < SHELF_UNLOCK_COSTS[state.shelvesUnlocked] && <small>{t('ui.notEnoughGold')}</small>}</section>}</div></HudRegion></div>
 {/* This reserved feedback row is internal to gardenRoot/gardenComposition. Status changes never resize the shelf. */}
 <div className="gs2-status" role={error ? 'alert' : 'status'} aria-live="polite"><span className="gs2-status-reserve" aria-hidden="true">{t('ui.help')}</span><div className="gs2-status-content">{error ? <><span className="gs2-status-error" tabIndex={0}>{error}</span>{accountingNeedsReview && onReviewPending && <Button onClick={() => onReviewPending(t('ui.accountingConfirm', { gold: '[[GOLD]]' }))}>{t('ui.accountingReviewButton')}</Button>}<Button onClick={dismissError} aria-label={t('ui.close')}><X size={16} /></Button></> : <span>{feedback || t('ui.help')}</span>}</div></div>
 {!offline && !notice && panel === 'settings' && <SettingsDialog onClose={close} />} {!offline && !notice && panel === 'quests' && <Quests onClose={close} run={run} busy={busy} />} {!offline && !notice && panel === 'spot' && spot && (activePlant && !placementRequest.current ? <Detail plantId={activePlant.id} onClose={close} onSelect={(p: any) => setSpot({
        shelfIndex: p.shelfIndex,
        spotIndex: p.spotIndex,
        plantId: p.id
      })} run={run} busy={busy} onFeedback={setFeedback} /> : spot.plantId ? null : <Shop spot={spot} onClose={close} onPlace={placePlant} run={run} busy={busy} />)}
 {offline && <Dialog title={t('offline.title')} kind="offline-reward" onClose={clearOfflineEarnings}><p>{t('offline.body')}</p><div className="gs2-reward"><Art name="coin" /><strong>{formatGardenGoldAmount(state.offlineEarnings!)}</strong>{!!state.offlineXp && <span>{t('offline.xp', {
              amount: state.offlineXp
            })}</span>}</div><Button primary onClick={clearOfflineEarnings}>{t('offline.collect')}</Button></Dialog>}
 {notice && !offline && <Dialog title={t('level.rewardTitle')} kind="reward" onClose={() => setNotice(null)}><p>{t('level.rewardBody', {
            level: notice.level
          })}</p><div className="gs2-reward"><Art name="coin" /><strong>{formatGardenGoldAmount(notice.reward)}</strong></div><Button primary onClick={() => setNotice(null)}>{t('settings.done')}</Button></Dialog>}
 </HudRegion></FeedbackContext.Provider>;
}
