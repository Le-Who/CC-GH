import { useSettlementText } from './useSettlementText.js';
import { ICONS, MAP_ASSETS, UI_ASSETS, VFX_ASSETS, buildingAsset, trimmedAsset } from './assetRegistry.js';
import { DEVELOPMENTS, batchYield } from './settlementCycle.js';
import { canPay, getResearchNodeStatus, getStage, productionFrom, upgradeCost, useSettlementStore } from './useSettlementStore.js';
import { AssetIcon, ProgressBar, ResourceIcon, formatDurationMs, formatNumber, frameStyle, resourceLabel } from './settlementViewShared.jsx';

function BuildingPanel({ building, level, resources, activeUpgrade, onUpgrade, onDemolish }) {
  const t = useSettlementText();
  const detail = building.detail ?? {};
  const illustratedBuildingId = building.constructionItem?.assetBuildingId ?? building.id;
  const illustratedLevel = building.constructionItem?.assetLevel ?? level;
  const illustration = trimmedAsset(buildingAsset(illustratedBuildingId, illustratedLevel));
  const cost = upgradeCost(building, level);
  const affordable = canPay(resources, cost);
  const progress = { current: level, max: building.max };
  const levels = useSettlementStore(s => s.levels);
  const constructedBuildings = useSettlementStore(s => s.constructedBuildings);
  const development = useSettlementStore(s => s.settlementCycle.development);
  const prod = batchYield(productionFrom(levels, constructedBuildings), development);
  const nextLevel = Math.min(building.max, level + 1);
  const isMax = level >= building.max;
  const isConstructed = Boolean(building.isConstructed);
  const isUpgrading = activeUpgrade?.buildingId === building.id;
  const remainingMs = isUpgrading ? Math.max(0, activeUpgrade.completesAt - Date.now()) : (detail.upgradeDurationMs ?? 0);

  const productionRows = Object.entries(prod);
  const costRows = Object.entries(cost);
  const upgradeFrame = isUpgrading
    ? UI_ASSETS.buildingUpgradeInProgress
    : affordable && !isMax
      ? UI_ASSETS.buildingUpgradeIdle
      : UI_ASSETS.buildingUpgradeDisabled;

  return (
    <div className="building-screen">
      <section className="settlement-building-hero">
        <img src={illustration} alt="" draggable={false} />
        <div>
          <strong>{t(building.name)}</strong>
          <p>{t(detail.body ?? building.description)}</p>
        </div>
      </section>

      <div className="building-level-row" style={frameStyle(UI_ASSETS.buildingLevelRow)}>
        <span>{t("Уровень ")}{t(level)}</span>
        <ProgressBar
          value={progress.current}
          max={progress.max}
          fill="green"
          label={t(`${formatNumber(progress.current)} / ${formatNumber(progress.max)}`)}
          className="building-level-progress"
        />
        <span>{t(isMax ? 'Максимум' : `Уровень ${nextLevel}`)}</span>
      </div>

      <div className="building-data-grid">
        <section className="building-data-card" style={frameStyle(UI_ASSETS.buildingStatsCard)}>
          <div className="building-card-title">
            <span>{t("Выпуск поселения")}</span>
          </div>
          <div className="building-stat-list">
            {productionRows.length ? productionRows.map(([key, value]) => (
              <div key={key} className="building-stat-row" style={frameStyle(UI_ASSETS.buildingStatRow)}>
                <ResourceIcon type={key} size={16} />
                <span>{t(resourceLabel(key))}</span>
                <strong>+{t(formatNumber(value))}</strong>
              </div>
            )) : (
              <div className="building-stat-row muted" style={frameStyle(UI_ASSETS.buildingStatRow)}>
                <ResourceIcon type="prestige" size={16} />
                <span>{t("Эффект")}</span>
                <strong>{t("Пассивный")}</strong>
              </div>
            )}
          </div>
        </section>

        <section className="building-data-card" style={frameStyle(UI_ASSETS.buildingStatsCard)}>
          <div className="building-card-title">
            <span>{t("Стоимость улучшения")}</span>
          </div>
          <div className="building-stat-list">
            {isMax ? (
              <div className="building-stat-row complete" style={frameStyle(UI_ASSETS.buildingStatRow)}>
                <ResourceIcon type="prestige" size={16} />
                <span>{t("Статус")}</span>
                <strong>{t("Максимум")}</strong>
              </div>
            ) : costRows.map(([key, value]) => {
              const hasEnough = (resources[key] ?? 0) >= value;
              return (
                <div key={key} className={`building-stat-row ${hasEnough ? 'ok' : 'need'}`} style={frameStyle(UI_ASSETS.buildingStatRow)}>
                  <ResourceIcon type={key} size={16} />
                  <span>{t(resourceLabel(key))}</span>
                  <strong>{t(formatNumber(resources[key] ?? 0))} / {t(formatNumber(value))}</strong>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="building-action-zone">
        {isConstructed ? (
          <button
            className="building-upgrade-button demolition-ready"
            style={frameStyle(UI_ASSETS.buildingUpgradeDisabled)}
            onClick={() => onDemolish?.(building.id)}
            type="button"
          >
            <AssetIcon src={ICONS.build} alt="" size={18} />
            <span>{t("Снести постройку и освободить площадку")}</span>
            <b>×</b>
          </button>
        ) : (
          <button
            className={`building-upgrade-button ${affordable && !isMax ? 'ready' : ''} ${isUpgrading ? 'in-progress' : ''}`}
            style={frameStyle(upgradeFrame)}
            disabled={!affordable || isMax || Boolean(activeUpgrade)}
            onClick={() => onUpgrade(building.id)}
            type="button"
          >
            <AssetIcon src={ICONS.build} alt="" size={18} />
            <span>{t(isMax ? 'Здание улучшено полностью' : activeUpgrade ? 'Улучшение уже выполняется' : affordable ? 'Улучшить здание' : 'Недостаточно ресурсов')}</span>
            {!isMax ? <b>↑</b> : null}
          </button>
        )}
        {!isMax && !isConstructed ? (
          <div className="building-upgrade-timer" style={frameStyle(UI_ASSETS.buildingTimerPill)}>
            <span>◷</span>
            <strong>{t(formatDurationMs(remainingMs))}</strong>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default BuildingPanel;

export { BuildingPanel };
