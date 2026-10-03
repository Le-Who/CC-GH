import {makeLivingPlantArt,supportsLivingPlant,notifyPlantTouch,getLivingPlantMotionState,LIVING_MOTION_CHANGE,listenToMotionPreference} from './living/living-plant-art.mjs';
import React, { createContext, useContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Home, Settings, X, Plus, Info, ChevronLeft, ChevronRight, Archive, Trash2, Lock, ArrowUpCircle, Check } from 'lucide-react';
import { useGardenI18n } from './lib/i18n';
import { getGardenSpriteFrame, getGardenSpriteStyle, GARDEN_SHEET_PATH } from './lib/sprites';
import { MAX_SHELVES, SPOTS_PER_SHELF, PLANT_TYPES, SHELF_UNLOCK_COSTS, formatGardenGoldAmount, toGardenGoldDisplayValue, formatGardenRate, getProduction, getUpgradeCost, getPlantUnlockLevel, getGardenWaterCooldownMs, getGardenLevelReward } from './constants';
import { useDialogFocus } from '../../app/useDialogFocus.js';
import { makeDialogSiblingsInert } from '../../app/dialogFocus.js';
import { useEscapeDismiss } from '../../app/useDismissableLayer.js';
import { createGardenPressSession, createGardenActionGate, createGardenShelfDrag, orderGardenQuests, clampGardenPercent } from './gardenInteraction.js';
import { formatR2Gold, formatR2Rate, gardenPlantPhaseDuration } from './lib/gardenR2View.js';

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

function remaining(plant: any, r2?: any) {
  if (plant.phase >= 3) return '';
  const ms = Math.max(0, gardenPlantPhaseDuration(plant, r2) - plant.phaseProgress);
  return `${Math.floor(ms / 60000)}:${Math.floor(ms % 60000 / 1000).toString().padStart(2, '0')}`;
}

function Dialog({
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

export { Art, Button, Dialog, FeedbackContext, PlantArt, Progress, art, remaining, usePlantTapAcknowledgement };
