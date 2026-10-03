import { useSettlementText } from './useSettlementText.js';
import { BUILDINGS, CONSTRUCTION_PANEL_DATA, COUNCIL_PANEL_DATA, GOAL_PANEL_DATA, INVENTORY_PANEL_DATA, PROPS, RESEARCH_PANEL_DATA, RESOURCES, TOP_HUD_RESOURCE_IDS, SETTLEMENT_PROFILE, VILLAGERS, WORKERS, WORLD_MAP_PANEL_DATA, getSettlementPlacementSlotLayout } from './gameData.js';
import { ICONS, MAP_ASSETS, UI_ASSETS, VFX_ASSETS, buildingAsset, trimmedAsset } from './assetRegistry.js';
import { canPay, getResearchNodeStatus, getStage, productionFrom, upgradeCost, useSettlementStore } from './useSettlementStore.js';
import { AssetIcon, HudFrame, ResourceIcon, formatClockDuration, formatNumber, frameStyle } from './settlementViewShared.jsx';

const RESEARCH_ICON_SOURCES = {
  achievement: ICONS.achievement,
  build: ICONS.build,
  calendar: ICONS.calendar,
  culture: ICONS.culture,
  food: ICONS.food,
  gems: ICONS.gems,
  gold: ICONS.gold,
  goods: ICONS.goods,
  inventory: ICONS.inventory,
  map: ICONS.map,
  morale: ICONS.morale,
  population: ICONS.population,
  prestige: ICONS.prestige,
  quest: ICONS.quest,
  research: ICONS.research,
  shield: ICONS.shield,
  stone: ICONS.stone,
  store: ICONS.store,
  wood: ICONS.wood,
  world: ICONS.world
};

const RESEARCH_CATEGORY_FRAMES = {
  farming: { idle: UI_ASSETS.researchCategoryFarmingIdle, active: UI_ASSETS.researchCategoryFarmingActive },
  trade: { idle: UI_ASSETS.researchCategoryTradeIdle, active: UI_ASSETS.researchCategoryTradeActive },
  culture: { idle: UI_ASSETS.researchCategoryCultureIdle, active: UI_ASSETS.researchCategoryCultureActive }
};

const RESEARCH_NODE_FRAMES = {
  complete: UI_ASSETS.researchNodeComplete,
  done: UI_ASSETS.researchNodeComplete,
  available: UI_ASSETS.researchNodeAvailable,
  selected: UI_ASSETS.researchNodeSelected,
  researching: UI_ASSETS.researchNodeResearching,
  locked: UI_ASSETS.researchNodeLocked
};

function ResearchTreeScreen({ resources, researchCategoryId, selectedResearchId, researchLevels, activeResearch, onCategoryChange, onSelectNode, onStudy }) {
  const t = useSettlementText();
  const categories = RESEARCH_PANEL_DATA.categories;
  const activeCategory = categories.some((category) => category.id === researchCategoryId) ? researchCategoryId : categories[0]?.id;
  const nodes = RESEARCH_PANEL_DATA.nodes.filter((node) => node.category === activeCategory);
  const selectedNode = nodes.find((node) => node.id === selectedResearchId)
    ?? nodes.find((node) => node.id === categories.find((category) => category.id === activeCategory)?.defaultNodeId)
    ?? nodes[0];
  const selectedStatus = getResearchNodeStatus(selectedNode, researchLevels, activeResearch);
  const selectedLevel = researchLevels?.[selectedNode?.id] ?? selectedNode?.level ?? 0;
  const selectedActive = activeResearch?.nodeId === selectedNode?.id;
  const remainingMs = selectedActive ? Math.max(0, activeResearch.completesAt - Date.now()) : selectedNode?.durationMs ?? 0;
  const selectedProgress = selectedActive
    ? Math.max(0, Math.min(100, ((activeResearch.durationMs - remainingMs) / Math.max(1, activeResearch.durationMs)) * 100))
    : selectedNode?.progress
      ? Math.max(0, Math.min(100, (selectedNode.progress.current / Math.max(1, selectedNode.progress.max)) * 100))
      : selectedStatus === 'complete' || selectedStatus === 'done'
        ? 100
        : 0;
  const selectedCost = selectedNode?.cost ?? {};
  const actionDisabled = !selectedNode || selectedStatus === 'locked' || selectedStatus === 'complete' || selectedStatus === 'done' || Boolean(activeResearch && !selectedActive) || !canPay(resources, selectedCost);
  const actionLabel = selectedStatus === 'locked'
    ? 'Недоступно'
    : selectedStatus === 'complete' || selectedStatus === 'done'
      ? 'Изучено'
      : selectedActive
        ? 'Изучается'
        : 'Изучить';

  return (
    <div className="research-screen research-screen-v2">
      <p className="research-intro" style={frameStyle(UI_ASSETS.researchIntroStrip)}>{t("Выберите исследование, чтобы увидеть цену и бонусы.")}</p>

      <div className="research-category-row" role="tablist" aria-label={t("Категории исследований")}>
        {categories.map((category) => {
          const active = category.id === activeCategory;
          return (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`research-category-tab ${active ? 'active' : ''}`.trim()}
              style={frameStyle(RESEARCH_CATEGORY_FRAMES[category.id]?.[active ? 'active' : 'idle'])}
              onClick={() => onCategoryChange(category.id)}
            >
              {t(category.label)}
            </button>
          );
        })}
      </div>

      <div className="research-tree-board" aria-label={t("Древо технологий")}>
        {nodes.map((node) => {
          const state = getResearchNodeStatus(node, researchLevels, activeResearch);
          const level = researchLevels?.[node.id] ?? node.level ?? 0;
          const isSelected = node.id === selectedNode?.id;
          const progress = node.progress;
          const progressPct = progress ? Math.max(0, Math.min(100, (progress.current / Math.max(1, progress.max)) * 100)) : 0;
          const nodeIcon = RESEARCH_ICON_SOURCES[node.icon] ?? ICONS.research;
          const nodeFrame = isSelected ? UI_ASSETS.researchNodeSelected : (RESEARCH_NODE_FRAMES[state] ?? UI_ASSETS.researchNodeAvailable);
          return (
            <button
              key={node.id}
              type="button"
              className={`research-tech-node ${state} ${isSelected ? 'selected' : ''} ${node.connectors?.right ? 'connect-right' : ''} ${node.connectors?.down ? 'connect-down' : ''}`.trim()}
              style={{ ...frameStyle(nodeFrame), gridColumn: node.position.col, gridRow: node.position.row }}
              onClick={() => onSelectNode(node.id)}
              aria-pressed={isSelected}
            >
              <strong>{t(node.title)}</strong>
              <span>{t("Уровень ")}{t(level)}/{t(node.maxLevel)}</span>
              <span className="research-node-icon-slot" style={frameStyle(UI_ASSETS.researchNodeIconSlot)}>
                <AssetIcon src={nodeIcon} alt="" size={34} />
              </span>
              {state === 'locked' ? (
                <div className="research-lock-badge" style={frameStyle(UI_ASSETS.researchLockBadge)} aria-hidden="true"><i /></div>
              ) : state === 'complete' || state === 'done' ? (
                <div className="research-check-badge" style={frameStyle(UI_ASSETS.researchCheckBadge)} aria-hidden="true">✓</div>
              ) : progress ? (
                <div className="research-node-progress" style={frameStyle(UI_ASSETS.researchNodeProgressFrame)}>
                  <div style={{ ...frameStyle(UI_ASSETS.researchNodeProgressFill), width: `${progressPct}%` }} />
                  <b>{t(progress.current)}/{t(progress.max)}</b>
                  <ResourceIcon type={progress.type} size={11} />
                </div>
              ) : null}
              {state === 'locked' ? <em>{t(node.requiredLabel ?? 'Требования не выполнены')}</em> : null}
            </button>
          );
        })}
      </div>

      {selectedNode ? (
        <HudFrame className="research-detail-card-v2" frame={UI_ASSETS.researchDetailCard}>
          <div className="research-detail-copy">
            <strong>{t(selectedNode.title)}</strong>
            <p>{t(selectedNode.description)}</p>
          </div>
          <div className="research-detail-effects">
            <span>{t("Уровень ")}{t(selectedLevel)} → {t(Math.min(selectedNode.maxLevel, selectedLevel + 1))}</span>
            {selectedNode.benefits.slice(0, 2).map((benefit) => <b key={benefit}>{t(benefit)}</b>)}
          </div>
        </HudFrame>
      ) : null}

      <div className="research-action-row">
        <div className="research-cost-list" style={frameStyle(UI_ASSETS.researchCostRow)} aria-label={t("Стоимость исследования")}>
          {Object.entries(selectedCost).map(([key, value]) => (
            <b key={key} className={(resources[key] ?? 0) >= value ? 'ok' : 'need'} style={frameStyle((resources[key] ?? 0) >= value ? UI_ASSETS.researchCostItemOk : UI_ASSETS.researchCostItemNeed)}>
              <ResourceIcon type={key} size={16} />
              <span>{t(formatNumber(value))}</span>
            </b>
          ))}
        </div>
        <button className="research-action-button research-action-button-v2" type="button" disabled={actionDisabled} onClick={onStudy} style={frameStyle(actionDisabled ? UI_ASSETS.researchStudyButtonDisabled : UI_ASSETS.researchStudyButtonIdle)}>
          <span>{t(actionLabel)}</span>
          {selectedNode?.durationMs ? <b>⌛ {t(formatClockDuration(remainingMs))}</b> : null}
        </button>
      </div>
    </div>
  );
}

export default ResearchTreeScreen;

export { ResearchTreeScreen };
