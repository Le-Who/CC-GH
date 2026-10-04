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
  const cycle = useSettlementStore((s) => s.settlementCycle);
  const nextDevelopment = DEVELOPMENTS[cycle.development];

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
          <div className="overview-goal-row" style={frameStyle(UI_ASSETS.overviewGoalRow)}>
            <AssetIcon src={ICONS.store} alt="" size={22} />
            <div>
              <span>{t("Доставленные заказы")}</span>
              <strong>{t(cycle.deliveries)}</strong>
            </div>
          </div>
          <div className="overview-goal-row" style={frameStyle(UI_ASSETS.overviewGoalRow)}>
            <AssetIcon src={ICONS.shield} alt="" size={22} />
            <div>
              <span>{t(nextDevelopment ? "Развивайте поселение во вкладке «Развитие»." : "Деревня процветает")}</span>
              <ProgressBar value={cycle.development} max={DEVELOPMENTS.length} fill="green" label={t(`${cycle.development} / ${DEVELOPMENTS.length}`)} />
            </div>
          </div>
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
