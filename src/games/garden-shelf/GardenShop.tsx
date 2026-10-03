import React, { createContext, useContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Home, Settings, X, Plus, Info, ChevronLeft, ChevronRight, Archive, Trash2, Lock, ArrowUpCircle, Check } from 'lucide-react';
import { useGame } from './lib/GardenContext';
import { useGardenI18n } from './lib/i18n';
import { MAX_SHELVES, SPOTS_PER_SHELF, PLANT_TYPES, SHELF_UNLOCK_COSTS, formatGardenGoldAmount, toGardenGoldDisplayValue, formatGardenRate, getProduction, getUpgradeCost, getPlantUnlockLevel, getGardenWaterCooldownMs, getGardenLevelReward } from './constants';
import { R2_PLANTS, R2_SHELF_COSTS, R2_SHELF_CHAPTERS, r2GoldRate, r2ChapterReward } from '../../../game-logic/garden-r2/catalog.js';
import { formatR2Gold, formatR2Rate, gardenPlantPhaseDuration } from './lib/gardenR2View.js';
import { Art, Button, Dialog, PlantArt } from './GardenViewShared.tsx';

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
  return <Dialog title={t('shop.seedShop')} kind="seed-shop-inventory" onClose={onClose}><div className="gs2-tabs" role="tablist" aria-label={t('shop.seedShop')}><Button role="tab" aria-selected={tab === 'shop'} primary={tab === 'shop'} onClick={() => setTab('shop')}>{t('shop.seedShop')}</Button><Button role="tab" aria-selected={tab === 'inventory'} primary={tab === 'inventory'} onClick={() => setTab('inventory')}>{t('shop.inventory', {
          count: inventory.length
        })}</Button></div><div role="tabpanel" className="gs2-catalog">{tab === 'shop' ? Object.values(PLANT_TYPES).map(def => {
        const unlocked = unlockedPlants.includes(def.id),
          price = r2 ? R2_PLANTS[def.id].buyGold : def.baseCost,
          affordable = state.gold >= price;
        return <article className="gs2-catalog-row" key={def.id}><PlantArt plant={{
            type: def.id,
            phase: 3
          }} size={58} /><div><h3>{t(`plant.${def.id}`)}</h3><p>{unlocked ? t(r2 ? 'r2.yields' : 'shop.yields', {
                amount: r2 ? formatR2Rate(r2GoldRate(def.id, 1, r2.masteryByType[def.id] || 0)) : formatGardenRate(def.baseProduction)
              }) : t('shop.unlockAt', {
                level: getPlantUnlockLevel(def.id)
              })}</p>{unlocked && !affordable && <small>{t('ui.notEnoughGold')}</small>}</div><Button primary aria-label={!unlocked ? t('shop.unlockAt', { level: getPlantUnlockLevel(def.id) }) : undefined} disabled={busy || !accountingReady || !unlocked || !affordable} onClick={() => run(() => buyPlant(def.id, spot.shelfIndex, spot.spotIndex))}>{unlocked ? <><Art name="coin" />{r2 ? formatR2Gold(price) : formatGardenGoldAmount(def.baseCost)}</> : <><Lock size={16} />{t('label.levelShort')} {getPlantUnlockLevel(def.id)}</>}</Button></article>;
      }) : inventory.length ? inventory.map(p => <article className="gs2-catalog-row" key={p.id}><PlantArt plant={p} size={58} /><div><h3>{t(`plant.${p.type}`)}</h3><p>{t('shop.phaseLevel', {
              phase: p.phase,
              level: p.level
            })}</p></div><Button primary disabled={busy || (!!r2 && !accountingReady)} onClick={() => onPlace(p, spot)}>{t('shop.place')}</Button></article>) : <div className="gs2-empty-state"><Archive size={32} /><p>{t('ui.emptyInventory')}</p></div>}</div></Dialog>;
}

export default Shop;

export { Shop };
