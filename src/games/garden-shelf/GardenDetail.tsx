import {makeLivingPlantArt,supportsLivingPlant,notifyPlantTouch,getLivingPlantMotionState,LIVING_MOTION_CHANGE,listenToMotionPreference} from './living/living-plant-art.mjs';
import React, { createContext, useContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Home, Settings, X, Plus, Info, ChevronLeft, ChevronRight, Archive, Trash2, Lock, ArrowUpCircle, Check } from 'lucide-react';
import { useGame } from './lib/GardenContext';
import { useGardenI18n } from './lib/i18n';
import { MAX_SHELVES, SPOTS_PER_SHELF, PLANT_TYPES, SHELF_UNLOCK_COSTS, formatGardenGoldAmount, toGardenGoldDisplayValue, formatGardenRate, getProduction, getUpgradeCost, getPlantUnlockLevel, getGardenWaterCooldownMs, getGardenLevelReward } from './constants';
import { createGardenPressSession, createGardenActionGate, createGardenShelfDrag, orderGardenQuests, clampGardenPercent } from './gardenInteraction.js';
import { formatR2Gold, formatR2Rate, gardenPlantPhaseDuration } from './lib/gardenR2View.js';
import { MasteryOffer } from './components/GardenR2Progress';
import { Art, Button, Dialog, PlantArt, Progress, remaining, usePlantTapAcknowledgement } from './GardenViewShared.tsx';

function Detail({
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
      movePlantToInventory, r2,
      accountingReady
    } = useGame(),
    {
      t
    } = useGardenI18n(),
    p = state.plants.find(p => p.id === plantId),
    placed = state.plants.filter(p => r2 ? (p as any).isActive === true : p.shelfIndex >= 0 && p.spotIndex >= 0).sort((a, b) => a.shelfIndex - b.shelfIndex || a.spotIndex - b.spotIndex),
    i = placed.findIndex(p => p.id === plantId),
    swipe = useRef<any>(null);
  useEffect(() => {
    if (!p || p.spotIndex < 0) onClose();
  }, [p, onClose]);
  if (!p || p.spotIndex < 0) return null;
  const def = PLANT_TYPES[p.type] || PLANT_TYPES.daisy,
    mature = p.phase >= 3,
    cost = r2 ? (p as any).nextUpgradeGold : getUpgradeCost(def.baseCost, p.level),
    canWater = !p.lastWatered || (r2 ? r2.serverNow : Date.now()) - p.lastWatered >= getGardenWaterCooldownMs(p.phase),
    waterRemaining = Math.max(0, getGardenWaterCooldownMs(p.phase) - ((r2 ? r2.serverNow : Date.now()) - (p.lastWatered || 0))),
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
    }}><p className="gs2-muted">{t(mature ? (r2 ? 'r2.mature' : 'plantDetail.mature') : 'plantDetail.growing', mature ? {
          level: p.level
        } : {
          phase: p.phase
        })}</p><div className="gs2-detail-stage">{placed.length > 1 && <Button aria-label={t('plantDetail.previous')} onClick={() => nav(-1)}><ChevronLeft /></Button>}<button type="button" className="gs2-detail-tap" data-gs2-tapped={tapAcknowledgement.active ? "true" : undefined} disabled={!!r2 && !accountingReady} onClick={async () => {
          const result = await tapPlant(p.id);
          if (r2 && result !== true) return;
          notifyPlantTouch(p.id);
          tapAcknowledgement.acknowledge();
          onFeedback(t(mature ? 'plantDetail.tapGold' : 'plantDetail.tapGrowth'));
        }} aria-label={t(mature ? 'plantDetail.tapGold' : 'plantDetail.tapGrowth')}><PlantArt plant={p} size={128} /></button>{placed.length > 1 && <Button aria-label={t('plantDetail.next')} onClick={() => nav(1)}><ChevronRight /></Button>}</div>{placed.length > 1 && <p className="gs2-center">{t('plantDetail.position', {
          current: i + 1,
          total: placed.length
        })}</p>}<p className="gs2-center">{t(mature ? 'plantDetail.tapGold' : 'plantDetail.tapGrowth')}</p><div className="gs2-detail-stat" data-testid="garden-care-level"><span>{t(r2 ? 'r2.rank' : 'label.levelShort')}</span><strong>{p.level}{r2 ? '/5' : ''}</strong></div><div className="gs2-detail-stat"><span>{t(mature ? 'plantDetail.production' : 'plantDetail.timeLeft')}</span><strong>{mature ? r2 ? `${formatR2Rate((p as any).rateMilliGoldPerMinute)} ${t('r2.goldPerMinute')}` : `${formatGardenRate(getProduction(def.baseProduction, p.level))} ${t('unit.goldPerSecond')}` : remaining(p, r2)}</strong></div>{!mature && <Progress value={p.phaseProgress / gardenPlantPhaseDuration(p, r2) * 100} label={`${Math.floor(clampGardenPercent(p.phaseProgress / gardenPlantPhaseDuration(p, r2) * 100))}%`} />}<Button primary disabled={busy || !canWater || (!!r2 && !accountingReady)} onClick={() => run(() => waterPlant(p.id))}><Art name="water" />{t(mature ? 'plantDetail.careWater' : 'plantDetail.water')}{!canWater && <span>{Math.ceil(waterRemaining / 60000)} {t('ui.min')}</span>}</Button>{mature && cost !== null && <Button primary disabled={busy || !accountingReady || state.gold < cost} onClick={() => run(() => upgradePlant(p.id))}><ArrowUpCircle size={20} /><span>{t('plantDetail.evolve')}{r2 && <small className="gs2-r2-delta">{t('r2.upgradeDelta', { amount: formatR2Rate((p as any).nextUpgradeDeltaMilliGoldPerMinute) })}</small>}</span><span className="gs2-price"><Art name="coin" />{r2 ? formatR2Gold(cost) : formatGardenGoldAmount(cost)}</span></Button>}{r2 && mature && cost === null && <p className="gs2-muted">{t('r2.rankComplete')}</p>}{r2 && <MasteryOffer plant={p} Button={Button} run={run} busy={busy} />}<div className="gs2-action-row"><Button disabled={busy || (!!r2 && !accountingReady)} onClick={() => run(() => movePlantToInventory(p.id))}><Archive size={18} />{t('plantDetail.stash')}</Button><Button disabled={busy || !accountingReady} className="gs2-danger" onClick={() => { if (!r2 || window.confirm(t('r2.confirmSale', { name: t(`plant.${p.type}`), amount: formatR2Gold((p as any).resaleGold) }))) void run(() => sellPlant(p.id)); }}><Trash2 size={18} />{t('plantDetail.sell')}{r2 && ` · ${formatR2Gold((p as any).resaleGold)} ${t('hud.gold')}`}</Button></div></div></Dialog>;
}

export default Detail;

export { Detail };
