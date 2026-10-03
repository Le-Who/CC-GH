import { useSettlementText } from './useSettlementText.js';
import { BUILDINGS, CONSTRUCTION_PANEL_DATA, COUNCIL_PANEL_DATA, GOAL_PANEL_DATA, INVENTORY_PANEL_DATA, PROPS, RESEARCH_PANEL_DATA, RESOURCES, TOP_HUD_RESOURCE_IDS, SETTLEMENT_PROFILE, VILLAGERS, WORKERS, WORLD_MAP_PANEL_DATA, getSettlementPlacementSlotLayout } from './gameData.js';
import { ICONS, MAP_ASSETS, UI_ASSETS, VFX_ASSETS, buildingAsset, trimmedAsset } from './assetRegistry.js';
import { AssetIcon, HudFrame, ProgressBar, formatNumber, frameStyle } from './settlementViewShared.jsx';

const COUNCIL_ICON_SOURCES = {
  food: ICONS.food,
  wood: ICONS.wood,
  stone: ICONS.stone,
  shield: ICONS.shield,
  elder: ICONS.research,
  keeper: ICONS.morale,
  guard: ICONS.shield
};

function CouncilScreen({ setPanel, selectBuilding }) {
  const t = useSettlementText();
  const stage = COUNCIL_PANEL_DATA.stage;
  const followAdvice = (recommendation) => {
    if (recommendation.action.kind === 'building') {
      selectBuilding(recommendation.action.buildingId);
      return;
    }
    if (recommendation.action.kind === 'panel') {
      setPanel(recommendation.action.panel);
    }
  };

  return (
    <div className="council-screen council-screen-v2">
      <div className="council-section-head council-section-head-v2">{t("Рекомендации совета")}</div>
      <div className="council-recommendation-list">
        {COUNCIL_PANEL_DATA.recommendations.map((recommendation) => (
          <HudFrame key={recommendation.id} className="council-recommendation-card" frame={UI_ASSETS.councilRecommendationCard}>
            <div className={`council-advisor-portrait ${recommendation.portrait}`} style={frameStyle(UI_ASSETS.councilAdvisorPortraitSlot)}>
              <AssetIcon src={COUNCIL_ICON_SOURCES[recommendation.portrait] ?? ICONS.research} alt="" size={42} />
            </div>
            <div className="council-recommendation-icon" style={frameStyle(UI_ASSETS.councilRecommendationIconSlot)}>
              <AssetIcon src={COUNCIL_ICON_SOURCES[recommendation.icon] ?? ICONS.achievement} alt="" size={30} />
            </div>
            <div className="council-recommendation-copy">
              <strong>{t(recommendation.title)}</strong>
              <span>{t(recommendation.description)}</span>
            </div>
            <button type="button" className="council-follow-button" style={frameStyle(UI_ASSETS.councilFollowButtonIdle)} onClick={() => followAdvice(recommendation)}>
              {t(recommendation.action.label)}
            </button>
          </HudFrame>
        ))}
      </div>

      <div className="council-bottom-grid">
        <HudFrame className="council-stage-card council-stage-card-v2" frame={UI_ASSETS.councilStageCard}>
          <div className="council-section-head council-section-head-v2">{t("Стадия поселения")}</div>
          <div className="council-stage-main">
            <span className="council-stage-badge" style={frameStyle(UI_ASSETS.councilStageBadge)}>
              <AssetIcon src={ICONS.shield} alt="" size={42} />
            </span>
            <div className="council-stage-copy">
              <strong>{t(stage.title)}</strong>
              <span>{t(stage.phaseLabel)}</span>
            </div>
          </div>
          <ProgressBar value={stage.progress.current} max={stage.progress.max} fill="green" label={t(`${formatNumber(stage.progress.current)} / ${formatNumber(stage.progress.max)}`)} />
        </HudFrame>

        <HudFrame className="council-build-card" frame={UI_ASSETS.panel}>
          <div className="council-section-head council-section-head-v2">{t("Что построить дальше?")}</div>
          <div className="council-build-list">
            {COUNCIL_PANEL_DATA.buildPriorities.map((priority) => (
              <button key={priority.id} type="button" className="council-build-row" style={frameStyle(priority.trend === 'up' ? UI_ASSETS.councilPriorityRowActive : UI_ASSETS.councilPriorityRowIdle)} onClick={() => priority.id === 'watchtower' ? setPanel('construction') : selectBuilding(priority.id)}>
                <AssetIcon src={COUNCIL_ICON_SOURCES[priority.icon] ?? ICONS.build} alt="" size={26} />
                <span><strong>{t(priority.title)}</strong><b>{t(priority.priority)}</b></span>
                <i>{t(priority.trend === 'up' ? '▲' : '−')}</i>
              </button>
            ))}
          </div>
        </HudFrame>
      </div>

      <button className="council-action-button council-action-button-v2" type="button" onClick={() => setPanel('research')} style={frameStyle(UI_ASSETS.councilOpenResearchButtonIdle)}>
        <AssetIcon src={ICONS.research} alt="" size={18} />
        <span>{t("Открыть исследования")}</span>
      </button>
    </div>
  );
}

export default CouncilScreen;

export { CouncilScreen };
