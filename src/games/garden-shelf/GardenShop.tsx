import React, { createContext, useContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Home, Settings, X, Plus, Info, ChevronLeft, ChevronRight, Archive, Trash2, Lock, ArrowUpCircle, Check } from 'lucide-react';
import { useGame } from './lib/GardenContext';
import { useGardenI18n } from './lib/i18n';
import { MAX_SHELVES, SPOTS_PER_SHELF, PLANT_TYPES, SHELF_UNLOCK_COSTS, formatGardenGoldAmount, toGardenGoldDisplayValue, formatGardenRate, getProduction, getUpgradeCost, getPlantUnlockLevel, getGardenWaterCooldownMs, getGardenLevelReward } from './constants';
import { R2_PLANTS, R2_SHELF_COSTS, R2_SHELF_CHAPTERS, r2GoldRate, r2ChapterReward } from '../../../game-logic/garden-r2/catalog.js';
import { formatR2Gold, formatR2Rate, gardenPlantPhaseDuration } from './lib/gardenR2View.js';
import { Art, Button, Dialog, MenuTabs, PlantArt } from './GardenViewShared.tsx';
import './garden-menus.css';

function Shop({
  spot,
  onClose,
  onPlace,
  run,
  busy
}: any) {
  const {
      state,
      buyPlant, r2,
      unlockedPlants,
      accountingReady
    } = useGame(),
    {
      t
    } = useGardenI18n(),
    [tab, setTab] = useState('shop'),
    inventory = state.plants.filter(p => r2 ? (p as any).isActive !== true : p.spotIndex === -1);
  return <Dialog title={t('ui.plant')} kind="seed-shop-inventory" onClose={onClose} navigation={<MenuTabs id="garden-shop-tabs" label={t('shop.seedShop')} value={tab} onChange={setTab} items={[{id:'shop',label:t('shop.seedShop')},{id:'inventory',label:t('shop.inventory',{count:inventory.length})}]}/>}><div id="garden-shop-tabs-panel" role="tabpanel" aria-labelledby={`garden-shop-tabs-${tab}`} className="gs2-catalog">{tab === 'shop' ? Object.values(PLANT_TYPES).map(def => {
        const unlocked = unlockedPlants.includes(def.id),
          price = r2 ? R2_PLANTS[def.id].buyGold : def.baseCost,
          affordable = state.gold >= price;
        return <article className="gs2-catalog-row" key={def.id}><PlantArt plant={{
            type: def.id,
            phase: 3
          }} size={72} /><div><h3>{t(`plant.${def.id}`)}</h3><p>{unlocked ? `${r2 ? formatR2Rate(r2GoldRate(def.id, 1, r2.masteryByType[def.id] || 0)) : formatGardenRate(def.baseProduction)} ${t(r2 ? 'r2.goldPerMinute' : 'unit.goldPerSecond')}` : t('shop.unlockAt', {
                level: getPlantUnlockLevel(def.id)
              })}</p>{unlocked && !affordable && <small>{t('ui.notEnoughGold')}</small>}</div><Button primary aria-label={`${t(`plant.${def.id}`)}: ${!unlocked ? t('shop.unlockAt', { level: getPlantUnlockLevel(def.id) }) : `${r2 ? formatR2Gold(price) : formatGardenGoldAmount(price)} ${t('hud.gold')}`}`} disabled={busy || !accountingReady || !unlocked || !affordable} onClick={() => run(() => buyPlant(def.id, spot.shelfIndex, spot.spotIndex))}>{unlocked ? <><Art name="coin" />{r2 ? formatR2Gold(price) : formatGardenGoldAmount(def.baseCost)}</> : <><Lock size={16} />{t('label.levelShort')} {getPlantUnlockLevel(def.id)}</>}</Button></article>;
      }) : inventory.length ? inventory.map(p => <article className="gs2-catalog-row" key={p.id}><PlantArt plant={p} size={72} /><div><h3>{t(`plant.${p.type}`)}</h3><p>{t('shop.phaseLevel', {
              phase: p.phase,
              level: p.level
            })}</p></div><Button primary disabled={busy || (!!r2 && !accountingReady)} onClick={() => onPlace(p, spot)}>{t('shop.place')}</Button></article>) : <div className="gs2-empty-state"><Archive size={32} /><p>{t('ui.emptyInventory')}</p><Button primary onClick={event => { const dialog=event.currentTarget.closest('[role="dialog"]'); setTab('shop'); if(event.detail===0) dialog?.querySelector<HTMLElement>('[data-menu-tab="shop"]')?.focus(); }}>{t('shop.seedShop')}</Button></div>}</div></Dialog>;
}

export default Shop;

export { Shop };
