import { useSettlementText } from './useSettlementText.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ICONS, MAP_ASSETS, UI_ASSETS, VFX_ASSETS, buildingAsset, trimmedAsset } from './assetRegistry.js';
import { DEVELOPMENTS, batchYield } from './settlementCycle.js';
import { canPay, getResearchNodeStatus, getStage, productionFrom, upgradeCost, useSettlementStore } from './useSettlementStore.js';
import { AssetIcon, HudFrame, ProgressBar, ResourceIcon, RewardBadge, formatNumber, frameStyle, resourceLabel } from './settlementViewShared.jsx';

function OverviewPanel({ resources, levels, population, stage, setPanel, constructedBuildings }) {
  const t = useSettlementText();
  const development = useSettlementStore((s) => s.settlementCycle.development);
  const passiveRows = useMemo(() => {
    const production = batchYield(productionFrom(levels, constructedBuildings), development);
    return ['food', 'wood', 'stone', 'goods', 'culture'].map((key) => ({
      id: key,
      label: resourceLabel(key),
      value: production[key] ?? 0
    }));
  }, [levels, constructedBuildings, development]);
  const morale = Math.round(resources.morale ?? 0);
  const hallLevel = levels['hearth-hall'] ?? 1;
  const cottageProgress = Math.max(0, (levels['cottage-ring'] ?? 1) - 1);
  const goals = [
    {
      id: 'lumber',
      title: 'Постройте Лесопилку',
      icon: ICONS.wood,
      value: 0,
      max: 1,
      rewardType: 'gems',
      reward: 150
    },
    {
      id: 'house',
      title: 'Улучшите Дом до ур. 3',
      icon: ICONS.store,
      value: Math.min(3, cottageProgress),
      max: 3,
      rewardType: 'gems',
      reward: 250
    }
  ];

  return (
    <div className="overview-screen">
      <HudFrame className="overview-intro-card" frame={UI_ASSETS.overviewIntroCard}>
        <AssetIcon src={ICONS.shield} alt="" size={38} />
        <div>
          <strong>{t("Развитие поселения")}</strong>
          <span>{t("Собирайте партии, доставляйте заказы и развивайте поселение.")}</span>
        </div>
      </HudFrame>

      <section className="overview-section" style={frameStyle(UI_ASSETS.overviewSectionCard)}>
        <h3>{t("Выпуск партии · каждые 20 с")}</h3>
        <div className="overview-income-grid">
          {passiveRows.map((row) => (
            <div key={row.id} className="overview-income-row">
              <ResourceIcon type={row.id} size={18} />
              <span>{t(row.label)}</span>
              <strong>+{t(row.value)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="overview-section overview-morale-section" style={frameStyle(UI_ASSETS.overviewSectionCard)}>
        <h3>{t("Мораль жителей")}</h3>
        <div className="overview-morale-row">
          <ResourceIcon type="morale" size={36} />
          <strong>{t(morale)}%</strong>
          <div>
            <ProgressBar value={morale} max={100} fill="green" label="" />
          </div>
          <button type="button" onClick={() => setPanel('council')}>{t("Подробнее")}</button>
        </div>
      </section>

      <section className="overview-section overview-goals-section" style={frameStyle(UI_ASSETS.overviewSectionCard)}>
        <h3>{t("Текущие цели")}</h3>
        <div className="overview-goal-list">
          {goals.map((goal) => (
            <div key={goal.id} className="overview-goal-row" style={frameStyle(UI_ASSETS.overviewGoalRow)}>
              <AssetIcon src={goal.icon} alt="" size={22} />
              <div>
                <span>{t(goal.title)}</span>
                <ProgressBar value={goal.value} max={goal.max} fill="green" label={t(`${goal.value} / ${goal.max}`)} />
              </div>
              <RewardBadge type={goal.rewardType} amount={goal.reward} />
            </div>
          ))}
        </div>
        <button className="overview-all-goals-button" type="button" onClick={() => setPanel('goals')}>{t("Все цели")}</button>
      </section>

      <div className="overview-stage-note">
        <ResourceIcon type="prestige" size={16} />
        <span>{t(stage.title)}{t(" · Очажный зал ")}{t(hallLevel)}{t(" ур.")}</span>
        <strong>{t(formatNumber(stage.computedPrestige))}</strong>
      </div>
    </div>
  );
}

export default OverviewPanel;

export { OverviewPanel };
