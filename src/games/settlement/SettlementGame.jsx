import { useSettlementText } from './useSettlementText.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useImmersiveGame } from '../../app/gameHooks.js';
import { openHome } from '../../app/homeNavigation.js';
import { Home } from 'lucide-react';
import { useAppI18n } from '../../app/i18n.jsx';
import { HudEditableRegion, HudRegion, useHudLayout, useHudRegion } from '../../app/hud-layout/index.js';
import { BUILDINGS, CONSTRUCTION_PANEL_DATA, COUNCIL_PANEL_DATA, GOAL_PANEL_DATA, INVENTORY_PANEL_DATA, PROPS, RESEARCH_PANEL_DATA, RESOURCES, TOP_HUD_RESOURCE_IDS, SETTLEMENT_PROFILE, VILLAGERS, WORKERS, WORLD_MAP_PANEL_DATA, getSettlementPlacementSlotLayout } from './gameData.js';
import { ICONS, MAP_ASSETS, UI_ASSETS, VFX_ASSETS, buildingAsset, trimmedAsset } from './assetRegistry.js';
import SettlementPlayPanel from './SettlementPlayPanel.jsx';
import { DEVELOPMENTS, batchYield } from './settlementCycle.js';
import { SETTLEMENT_SAVE_KEY } from './settlementPersistence.js';
import { canPay, getResearchNodeStatus, getStage, productionFrom, upgradeCost, useSettlementStore } from './useSettlementStore.js';
import { AssetIcon, CONSTRUCTION_ITEMS_BY_ID_UI, CONSTRUCTION_SLOTS_BY_ID_UI, ProgressBar, ResourceIcon, constructionItemAsset, formatDurationMs, formatNumber, frameStyle } from './settlementViewShared.jsx';
import { lazy, Suspense } from 'react';
import './settlement.css';
const SceneCanvas=lazy(()=>import('./SettlementSceneCanvas.jsx'));
const OverviewPanel=lazy(()=>import('./SettlementOverviewPanel.jsx'));
const BuildingPanel=lazy(()=>import('./SettlementBuildingPanel.jsx'));
const GoalsPanel=lazy(()=>import('./SettlementGoalsPanel.jsx'));
const InventoryScreen=lazy(()=>import('./SettlementInventoryScreen.jsx'));
const CouncilScreen=lazy(()=>import('./SettlementCouncilScreen.jsx'));
const ConstructionScreen=lazy(()=>import('./SettlementConstructionScreen.jsx'));
const ResearchTreeScreen=lazy(()=>import('./SettlementResearchTreeScreen.jsx'));
const WorldMapScreen=lazy(()=>import('./SettlementWorldMapScreen.jsx'));
const GenericPanel=lazy(()=>import('./SettlementGenericPanel.jsx'));

const PANEL_TABS = [
  { id: 'build', label: 'Здание', icon: ICONS.build },
  { id: 'goals', label: 'Цели', icon: ICONS.quest },
  { id: 'inventory', label: 'Инвентарь', shortLabel: 'Склад', icon: ICONS.inventory },
  { id: 'council', label: 'Совет', icon: ICONS.research }
];

const EVENT_CARDS = [
  { id: 'event', label: 'Событие', sub: '3д 12ч', icon: ICONS.event },
  { id: 'gift', label: 'Подарок', sub: 'готов', icon: ICONS.gift },
  { id: 'starter', label: 'Набор', sub: '1д 6ч', icon: ICONS.starterPack },
  { id: 'mail', label: 'Почта', sub: '3', icon: ICONS.mail }
];

const CATEGORY_LABELS = {
  civic: 'Управление',
  housing: 'Жильё',
  production: 'Производство',
  commerce: 'Торговля',
  culture: 'Культура',
  infrastructure: 'Инфраструктура'
};

function constructedBuildingId(slotId) {
  return `built:${slotId}`;
}

function slotIdFromConstructedBuildingId(id) {
  const value = String(id || '').trim();
  return value.startsWith('built:') ? value.slice('built:'.length) : value;
}

function getConstructedBuildingView(record) {
  if (!record) return null;
  const item = CONSTRUCTION_ITEMS_BY_ID_UI[record.itemId];
  const slot = CONSTRUCTION_SLOTS_BY_ID_UI[record.slotId];
  if (!item || !slot) return null;
  const category = item.category === 'storage' ? 'infrastructure' : item.category;
  return {
    id: record.id ?? constructedBuildingId(record.slotId),
    name: item.name,
    short: item.name,
    category,
    level: record.level ?? 1,
    max: 1,
    description: `Построено на площадке «${slot.label}». Эту постройку можно снести и освободить место под другой объект.`,
    produces: item.produces ?? {},
    cost: item.cost ?? {},
    isConstructed: true,
    constructionRecord: record,
    constructionItem: item,
    constructionSlot: slot,
    detail: {
      role: item.category === 'storage' ? 'склад' : 'новая постройка',
      levelProgress: { current: 1, max: 1 },
      productionPerMinute: item.produces ?? {},
      upgradeCost: item.cost ?? {},
      upgradeDurationMs: 0,
      benefits: item.produces ? { passiveGoldPerMinute: item.produces.gold ?? 0, morale: item.category === 'decor' ? 2 : 0 } : { passiveGoldPerMinute: 0, morale: 0 },
      body: `Готовая постройка: ${item.name}. Площадка: ${slot.label}.`
    }
  };
}

const RIGHT_PANEL_SCREENS = {
  overview: {
    id: 'overview',
    label: 'Обзор',
    icon: ICONS.shield,
    kind: 'overview',
    title: 'Обзор деревни',
    eyebrow: 'Поселение',
    subline: 'Состояние поселения и текущие задачи'
  },
  build: {
    id: 'build',
    label: 'Здание',
    icon: ICONS.build,
    kind: 'building',
    title: 'Здание',
    eyebrow: 'Здание',
    subline: 'Уровень, производство и улучшение'
  },
  goals: {
    id: 'goals',
    label: 'Цели',
    icon: ICONS.quest,
    kind: 'goals',
    title: 'Цели поселения',
    eyebrow: 'Прогресс',
    subline: 'Цели и награды'
  },
  inventory: {
    id: 'inventory',
    label: 'Инвентарь',
    icon: ICONS.inventory,
    kind: 'inventory',
    title: 'Инвентарь и склад',
    eyebrow: 'Склад',
    subline: 'Ресурсы, вместимость и особые предметы'
  },
  council: {
    id: 'council',
    label: 'Совет',
    icon: ICONS.research,
    kind: 'council',
    title: 'Совет и исследования',
    eyebrow: 'Совет',
    subline: 'Рекомендации, стадия и приоритеты',
    headerIcon: ICONS.research
  },
  research: {
    id: 'research',
    label: 'Исследования',
    icon: ICONS.research,
    kind: 'research-tree',
    title: 'Исследования',
    eyebrow: 'Технологии',
    subline: 'Исследуйте технологии и открывайте возможности'
  },
  store: {
    id: 'store',
    label: 'Магазин',
    icon: ICONS.store,
    kind: 'store',
    title: 'Магазин',
    eyebrow: 'Предложения',
    subline: 'Награды, подарки и наборы'
  },
  inbox: {
    id: 'inbox',
    label: 'Вести',
    icon: ICONS.inbox,
    kind: 'inbox',
    title: 'Вести деревни',
    eyebrow: 'Сообщения',
    subline: 'Почта, события и новости поселения'
  },
  map: {
    id: 'map',
    label: 'Карта',
    icon: ICONS.map,
    kind: 'world-map',
    title: 'Карта мира',
    eyebrow: 'Мир',
    subline: 'Маршруты и экспедиции',
    headerIcon: ICONS.map
  },
  rank: {
    id: 'rank',
    label: 'Ранг',
    icon: ICONS.rank,
    kind: 'rank',
    title: 'Ранг поселения',
    eyebrow: 'Престиж',
    subline: 'Репутация, стадия и престиж поселения'
  },
  construction: {
    id: 'construction',
    label: 'Строительство',
    icon: ICONS.buildLarge,
    kind: 'construction',
    title: 'Строительство',
    eyebrow: 'Каталог',
    subline: 'Выбор зданий и свободных площадок'
  },
  world: {
    id: 'world',
    label: 'Мир',
    icon: ICONS.world,
    kind: 'world-map',
    title: 'Карта мира',
    eyebrow: 'Экспедиции',
    subline: 'Доступные регионы, риски и награды',
    headerIcon: ICONS.world
  }
};

function getRightPanelScreen(activePanel) {
  return RIGHT_PANEL_SCREENS[activePanel] ?? RIGHT_PANEL_SCREENS.overview;
}

function getRightPanelChrome({ activePanel, selected, level }) {
  const screen = getRightPanelScreen(activePanel);
  if (screen.kind !== 'building') return screen;
  const category = CATEGORY_LABELS[selected.category] ?? selected.category;
  return {
    ...screen,
    title: selected.name,
    eyebrow: category,
    subline: `Уровень ${level}/${selected.max} · ${category}`
  };
}

function formatDecimal(value, digits = 1) {
  return Number(value ?? 0).toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatSignedPerMinute(value, digits = 1) {
  const n = Number(value ?? 0);
  return `${n > 0 ? '+' : ''}${formatDecimal(n, digits)}/мин`;
}

function PanelTabs({ activePanel, setPanel, variant = 'default' }) {
  const t = useSettlementText();
  return (
    <div className={`panel-tabs ${variant === 'fancy' ? 'panel-tabs-fancy' : ''}`.trim()}>
      {PANEL_TABS.map((tab) => {
        const isActive = activePanel === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`panel-tab ${isActive ? 'active' : ''} ${variant === 'fancy' ? 'panel-tab-fancy' : ''}`.trim()}
            onClick={() => setPanel(tab.id)}
            style={frameStyle(isActive ? UI_ASSETS.tabActive : UI_ASSETS.tabIdle)}
          >
            <AssetIcon src={tab.icon} alt="" size={16} />
            <span className="panel-tab-label">
              <span className="panel-tab-label-full">{t(tab.label)}</span>
              <span className="panel-tab-label-short">{t(tab.shortLabel ?? tab.label)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ResourcePill({ label, value, icon, type, showPlus = false }) {
  const t = useSettlementText();
  return (
    <div className={`resource-pill resource-pill-${type ?? 'generic'}`} style={frameStyle(UI_ASSETS.resourcePill)}>
      {icon ? (
        <span className="resource-pill-icon-slot" style={frameStyle(UI_ASSETS.resourceIconSlot)}>
          <AssetIcon src={icon} alt="" className="resource-pill-icon" size={19} />
        </span>
      ) : null}
      <span className="resource-label">{t(label)}</span>
      <strong>{t(formatNumber(value))}</strong>
      {showPlus ? (
        <button className="resource-plus tooltip-control" type="button" aria-label={t(`Пополнить ${label}`)} data-tooltip={t(`Пополнить ${label}`)} style={frameStyle(UI_ASSETS.plus)}>
          +
        </button>
      ) : null}
    </div>
  );
}

function TopHud({ resources, population, stage }) {
  const t = useSettlementText();
  const { language } = useAppI18n();
  const ru = language === 'ru';
  const englishResources = { population: 'Residents', food: 'Food', wood: 'Wood', stone: 'Stone', gold: 'Gold', gems: 'Gems' };
  const morale = Math.round(resources.morale ?? 0);
  const resourceValues = {
    ...resources,
    population,
    prestige: stage.computedPrestige
  };

  return (
    <HudEditableRegion id="settlementTopHud" as="header" applyLayout={false} className="top-hud top-hud-final" style={frameStyle(UI_ASSETS.topbar)}>
      <div className="profile-card profile-card-final" style={frameStyle(UI_ASSETS.profile)}>
        <div className="profile-avatar-wrap" style={frameStyle(UI_ASSETS.profileAvatarFrame)}>
          <AssetIcon src={ICONS.shield} alt="" className="profile-avatar" size={34} />
          <b className="profile-level-badge" style={frameStyle(UI_ASSETS.profileLevelBadge)}>{t(SETTLEMENT_PROFILE.mayorLevel)}</b>
        </div>
        <div className="profile-meta">
          <div className="profile-head">
            <span className="profile-name">{t(ru ? SETTLEMENT_PROFILE.mayorName : 'Mayor Alexander')}</span>
            <strong className="profile-level">{t(ru ? 'Уровень' : 'Level')} {t(SETTLEMENT_PROFILE.mayorLevel)}</strong>
          </div>
          <ProgressBar value={morale} max={100} fill="green" label={t(`${ru ? 'Мораль' : 'Morale'} ${morale}%`)} className="profile-progress" />
        </div>
      </div>

      <div className="settlement-title settlement-title-final" style={frameStyle(UI_ASSETS.settlementPlaque)}>
        <span>{t(ru ? `Поселение · ${stage.title}` : `Settlement · ${{ village: 'Village', town: 'Town', city: 'City', capital: 'Capital' }[stage.id]}`)}</span>
        <strong>{t(ru ? SETTLEMENT_PROFILE.name : 'Green Village')}</strong>
      </div>

      <div className="top-resource-zone settlement-home-row">
        <HudEditableRegion id="settlementHomeButton" as="button" type="button" className="settlement-home-button" onClick={openHome} aria-label={ru ? 'Все игры' : 'All games'}>
          <Home size={19} aria-hidden="true" /><span>{ru ? 'Игры' : 'Games'}</span>
        </HudEditableRegion>
        <div className="top-resources top-resources-core">
          {RESOURCES.filter((resource) => TOP_HUD_RESOURCE_IDS.includes(resource.id)).map((resource) => (
            <ResourcePill
              key={resource.id}
              label={t(ru ? resource.label : englishResources[resource.id])}
              value={resourceValues[resource.id] ?? 0}
              icon={resource.icon}
              type={resource.id}
              showPlus={false}
            />
          ))}
        </div>
      </div>
    </HudEditableRegion>
  );
}

function DockButton({
  active,
  icon,
  label,
  onClick,
  badge,
  className = '',
  variant = 'dock',
  iconSize = 24,
  hideLabel = false,
  pulse = false,
  shortLabel = null,
  frameOverride = null
}) {
  const t = useSettlementText();
  const frame = frameOverride ?? (variant === 'bottom'
    ? active
      ? UI_ASSETS.bottomButtonActive
      : UI_ASSETS.bottomButton
    : active
      ? UI_ASSETS.dockButtonActive
      : UI_ASSETS.dockButton);

  return (
    <button
      className={`dock-button tooltip-control ${active ? 'active' : ''} ${hideLabel ? 'icon-only' : ''} ${pulse ? 'has-pulse' : ''} ${className}`.trim()}
      onClick={onClick}
      aria-label={t(label)}
      data-tooltip={t(label)}
      style={frameStyle(frame)}
      type="button"
    >
      {pulse ? <img className="dock-pulse" src={VFX_ASSETS.questReady} alt="" draggable={false} /> : null}
      {icon ? <AssetIcon src={icon} alt="" className="dock-icon" size={iconSize} /> : null}
      {!hideLabel ? (
        <span className="dock-label">
          <span className="dock-label-full">{t(label)}</span>
          <span className="dock-label-short">{t(shortLabel ?? label)}</span>
        </span>
      ) : null}
      {badge ? <b className="red-badge" style={frameStyle(UI_ASSETS.badge)}>{t(badge)}</b> : null}
    </button>
  );
}

function LeftDock({ activePanel, setPanel }) {
  const t = useSettlementText();
  const { resolvedLayout } = useHudLayout();
  const regions = resolvedLayout?.regions ?? {};
  const rightPanelOpen = useSettlementStore(s => s.rightPanelOpen);
  const compact = regions.settlementCompactDetail;
  // Bound the scrollable menu by the same registered surfaces as the map.
  const bottom = !rightPanelOpen && compact?.alignment !== 'right'
    ? (compact?.offset ?? 0) + (compact?.thickness ?? 0) + 8
    : regions.settlementBottomNav?.reserve ?? 0;
  const dockStyle = {
    ...frameStyle(UI_ASSETS.leftDock),
    '--settlement-menu-top': `${(regions.settlementTopHud?.offset ?? 0) + (regions.settlementTopHud?.reserve ?? 0)}px`,
    '--settlement-menu-bottom': `${bottom}px`,
  };
  return (
    <HudEditableRegion id="settlementLeftDock" as="aside" applyLayout={false} className="left-dock" style={dockStyle}>
      <DockButton active={activePanel === 'goals'} icon={ICONS.quest} label={t("Цели")} badge="3" onClick={() => setPanel('goals')} iconSize={28} hideLabel pulse />
      <DockButton active={activePanel === 'inbox'} icon={ICONS.inbox} label={t("Вести")} badge="2" onClick={() => setPanel('inbox')} iconSize={28} hideLabel />
      <DockButton active={activePanel === 'council'} icon={ICONS.research} label={t("Совет")} onClick={() => setPanel('council')} iconSize={28} hideLabel />
      <DockButton active={activePanel === 'map'} icon={ICONS.map} label={t("Карта")} onClick={() => setPanel('map')} iconSize={28} hideLabel />
      <DockButton active={activePanel === 'rank'} icon={ICONS.rank} label={t("Ранг")} onClick={() => setPanel('rank')} iconSize={28} hideLabel />
    </HudEditableRegion>
  );
}

function BottomNav({ activePanel, setPanel, collect }) {
  const t = useSettlementText();
  const ready = useSettlementStore((s) => s.settlementCycle.ready);
  const buildFamilyActive = activePanel === 'construction' || activePanel === 'build';
  const showGoalsSlot = activePanel === 'goals';
  return (
    <HudEditableRegion id="settlementBottomNav" as="nav" applyLayout={false} className="bottom-nav" style={frameStyle(UI_ASSETS.bottomFrame)}>
      <DockButton active={activePanel === 'store'} icon={ICONS.store} label={t("Магазин")} onClick={() => setPanel('store')} className="bottom-dock-button" variant="bottom" iconSize={30} hideLabel />
      <DockButton active={activePanel === 'inventory'} icon={ICONS.inventory} label={t("Инвентарь")} onClick={() => setPanel('inventory')} className="bottom-dock-button" variant="bottom" iconSize={30} hideLabel />
      <HudEditableRegion
        id="settlementPrimaryBuildAsset"
        as="button"
        className={`primary-build tooltip-control ${buildFamilyActive ? 'active' : ''}`}
        onClick={() => setPanel('construction')}
        style={frameStyle(buildFamilyActive ? UI_ASSETS.primaryBuildButtonActive : UI_ASSETS.primaryBuildButton)}
        aria-label={t("Строить")}
        data-tooltip={t("Строить")}
        type="button"
      >
        <AssetIcon src={ICONS.buildLarge} alt="" size={34} />
      </HudEditableRegion>
      <DockButton active={activePanel === 'research'} icon={ICONS.research} label={t("Исследования")} shortLabel={t("Наука")} onClick={() => setPanel('research')} className="bottom-dock-button" variant="bottom" iconSize={30} hideLabel />
      <DockButton active={activePanel === 'world'} icon={ICONS.world} label={t("Карта мира")} shortLabel={t("Карта")} onClick={() => setPanel('world')} className="bottom-dock-button" variant="bottom" iconSize={30} hideLabel frameOverride={activePanel === 'world' ? UI_ASSETS.bottomWorldButtonActive : UI_ASSETS.bottomWorldButton} />
      {showGoalsSlot ? (
        <DockButton active icon={ICONS.rank} label={t("Цели")} onClick={() => setPanel('goals')} className="bottom-dock-button goals-dock-button" variant="bottom" iconSize={30} badge="3" hideLabel frameOverride={UI_ASSETS.bottomGoalsButtonActive} />
      ) : (
        <HudEditableRegion id="settlementCollectAsset" as="button" className="collect-button tooltip-control" onClick={collect} disabled={!ready} aria-label={t("Собрать")} data-tooltip={t("Собрать")} type="button" style={frameStyle(UI_ASSETS.collectButtonActive)}>
          <AssetIcon src={ICONS.starterPack} alt="" size={24} />
          {ready > 0 ? <b className="red-badge" style={frameStyle(UI_ASSETS.badge)}>{t(ready)}</b> : null}
        </HudEditableRegion>
      )}
    </HudEditableRegion>
  );
}

function BuildingBenefitFooter({ building }) {
  const t = useSettlementText();
  const development = useSettlementStore(s => s.settlementCycle.development);
  const morale = useSettlementStore(s => s.resources.morale);

  return (
    <div className="panel-footer panel-footer-fancy building-footer-fancy">
      <div className="building-benefit-card" style={frameStyle(UI_ASSETS.buildingFooterCard)}>
        <span>{t("Бонус выпуска")}</span>
        <strong><ResourceIcon type="food" size={18} /> +{t(development * 20)}%</strong>
      </div>
      <div className="building-benefit-card" style={frameStyle(UI_ASSETS.buildingFooterCard)}>
        <span>{t("Мораль")}</span>
        <strong><ResourceIcon type="morale" size={18} /> {t(formatNumber(morale))}%</strong>
      </div>
    </div>
  );
}

function RightPanelContent({ activePanel, selected, level, resources, levels, population, stage, activeUpgrade, upgradeBuilding, demolishConstructedBuilding, setPanel, selectBuilding, claimedGoalRewardIds, claimGoalRewards, inventoryCaps, inventorySelectedResourceId, focusInventoryResource, adjustInventoryCap, boostInventoryCap, constructionCategoryId, constructionPage, selectedConstructionId, selectedConstructionSlotId, constructedBuildings, setConstructionCategory, setConstructionPage, selectConstructionItem, researchCategoryId, selectedResearchId, researchLevels, activeResearch, setResearchCategory, selectResearchNode, studySelectedResearch, worldMapFilterId, selectedExpeditionId, activeExpedition, setWorldMapFilter, selectExpedition, startSelectedExpedition }) {
  const screen = getRightPanelScreen(activePanel);
  if (screen.kind === 'overview') {
    return <OverviewPanel resources={resources} levels={levels} population={population} stage={stage} setPanel={setPanel} constructedBuildings={constructedBuildings} />;
  }
  if (screen.kind === 'building') {
    return <BuildingPanel building={selected} level={level} resources={resources} activeUpgrade={activeUpgrade} onUpgrade={upgradeBuilding} onDemolish={demolishConstructedBuilding} />;
  }
  if (screen.kind === 'goals') {
    return <GoalsPanel claimedGoalRewardIds={claimedGoalRewardIds} onClaimRewards={claimGoalRewards} />;
  }
  if (screen.kind === 'inventory') {
    return <InventoryScreen resources={resources} inventoryCaps={inventoryCaps} selectedResourceId={inventorySelectedResourceId} onFocusResource={focusInventoryResource} onAdjustCap={adjustInventoryCap} onBoostCap={boostInventoryCap} />;
  }
  if (screen.kind === 'council') {
    return <CouncilScreen setPanel={setPanel} selectBuilding={selectBuilding} />;
  }
  if (screen.kind === 'research-tree') {
    return (
      <ResearchTreeScreen
        resources={resources}
        researchCategoryId={researchCategoryId}
        selectedResearchId={selectedResearchId}
        researchLevels={researchLevels}
        activeResearch={activeResearch}
        onCategoryChange={setResearchCategory}
        onSelectNode={selectResearchNode}
        onStudy={studySelectedResearch}
      />
    );
  }
  if (screen.kind === 'construction') {
    return (
      <ConstructionScreen
        resources={resources}
        categoryId={constructionCategoryId}
        page={constructionPage}
        selectedId={selectedConstructionId}
        selectedSlotId={selectedConstructionSlotId}
        constructedBuildings={constructedBuildings}
        onCategoryChange={setConstructionCategory}
        onPageChange={setConstructionPage}
        onSelectItem={selectConstructionItem}
      />
    );
  }
  if (screen.kind === 'world-map') {
    return (
      <WorldMapScreen
        filterId={worldMapFilterId}
        selectedExpeditionId={selectedExpeditionId}
        activeExpedition={activeExpedition}
        onFilterChange={setWorldMapFilter}
        onSelectExpedition={selectExpedition}
        onStartExpedition={startSelectedExpedition}
      />
    );
  }
  return <GenericPanel activePanel={activePanel} stage={stage} resources={resources} population={population} />;
}

function SidePanel() {
  const t = useSettlementText();
  const activePanel = useSettlementStore((s) => s.activePanel);
  const rightPanelOpen = useSettlementStore((s) => s.rightPanelOpen);
  const selectedBuildingId = useSettlementStore((s) => s.selectedBuildingId);
  const levels = useSettlementStore((s) => s.levels);
  const resources = useSettlementStore((s) => s.resources);
  const population = useSettlementStore((s) => s.population);
  const stage = useMemo(() => getStage(resources, levels), [resources, levels]);
  const upgradeBuilding = useSettlementStore((s) => s.upgradeBuilding);
  const activeUpgrade = useSettlementStore((s) => s.activeUpgrade);
  const claimedGoalRewardIds = useSettlementStore((s) => s.claimedGoalRewardIds);
  const claimGoalRewards = useSettlementStore((s) => s.claimGoalRewards);
  const inventoryCaps = useSettlementStore((s) => s.inventoryCaps);
  const inventorySelectedResourceId = useSettlementStore((s) => s.inventorySelectedResourceId);
  const focusInventoryResource = useSettlementStore((s) => s.focusInventoryResource);
  const adjustInventoryCap = useSettlementStore((s) => s.adjustInventoryCap);
  const boostInventoryCap = useSettlementStore((s) => s.boostInventoryCap);
  const constructionCategoryId = useSettlementStore((s) => s.constructionCategoryId);
  const constructionPage = useSettlementStore((s) => s.constructionPage);
  const selectedConstructionId = useSettlementStore((s) => s.selectedConstructionId);
  const selectedConstructionSlotId = useSettlementStore((s) => s.selectedConstructionSlotId);
  const constructedBuildings = useSettlementStore((s) => s.constructedBuildings);
  const setConstructionCategory = useSettlementStore((s) => s.setConstructionCategory);
  const setConstructionPage = useSettlementStore((s) => s.setConstructionPage);
  const selectConstructionItem = useSettlementStore((s) => s.selectConstructionItem);
  const demolishConstructedBuilding = useSettlementStore((s) => s.demolishConstructedBuilding);
  const researchCategoryId = useSettlementStore((s) => s.researchCategoryId);
  const selectedResearchId = useSettlementStore((s) => s.selectedResearchId);
  const researchLevels = useSettlementStore((s) => s.researchLevels);
  const activeResearch = useSettlementStore((s) => s.activeResearch);
  const setResearchCategory = useSettlementStore((s) => s.setResearchCategory);
  const selectResearchNode = useSettlementStore((s) => s.selectResearchNode);
  const studySelectedResearch = useSettlementStore((s) => s.studySelectedResearch);
  const worldMapFilterId = useSettlementStore((s) => s.worldMapFilterId);
  const selectedExpeditionId = useSettlementStore((s) => s.selectedExpeditionId);
  const activeExpedition = useSettlementStore((s) => s.activeExpedition);
  const setWorldMapFilter = useSettlementStore((s) => s.setWorldMapFilter);
  const selectExpedition = useSettlementStore((s) => s.selectExpedition);
  const startSelectedExpedition = useSettlementStore((s) => s.startSelectedExpedition);
  const setPanel = useSettlementStore((s) => s.setPanel);
  const closePanel = useSettlementStore((s) => s.closePanel);
  const selectBuilding = useSettlementStore((s) => s.selectBuilding);
  const constructedSlotId = slotIdFromConstructedBuildingId(selectedBuildingId);
  const constructedSelected = getConstructedBuildingView(constructedBuildings?.[constructedSlotId]);
  const selected = BUILDINGS.find((b) => b.id === selectedBuildingId) ?? constructedSelected ?? BUILDINGS[0];
  const level = selected.isConstructed ? selected.level : levels[selected.id] ?? 1;
  const development = useSettlementStore(s => s.settlementCycle.development);
  const prod = useMemo(() => batchYield(productionFrom(levels, constructedBuildings), development), [levels, constructedBuildings, development]);
  const panelChrome = getRightPanelChrome({ activePanel, selected, level });
  const activeTabLabel = panelChrome.label;
  const headerEyebrow = panelChrome.eyebrow;
  const headerTitle = panelChrome.title;
  const headerSubline = panelChrome.subline;
  const headerIcon = panelChrome.headerIcon ?? null;
  const isOverview = panelChrome.kind === 'overview';
  const isBuilding = panelChrome.kind === 'building';
  const isGoals = panelChrome.kind === 'goals';
  const isInventory = panelChrome.kind === 'inventory';
  const isCouncil = panelChrome.kind === 'council';
  const isResearchTree = panelChrome.kind === 'research-tree';
  const isConstruction = panelChrome.kind === 'construction';
  const isWorldMap = panelChrome.kind === 'world-map';
  const sidePanelFrame = isOverview
    ? UI_ASSETS.rightPanelOverview
    : isBuilding
      ? UI_ASSETS.rightPanelBuilding
      : isGoals
        ? UI_ASSETS.rightPanelGoals
        : isInventory
          ? UI_ASSETS.rightPanelInventory
          : isCouncil
            ? UI_ASSETS.rightPanelCouncil
            : isResearchTree
              ? UI_ASSETS.rightPanelResearch
              : isConstruction
                ? UI_ASSETS.rightPanelConstruction
                : isWorldMap
                  ? UI_ASSETS.rightPanelWorldMap
                  : UI_ASSETS.sidePanelFancy;
  const showGenericFooter = !isOverview && !isGoals && !isInventory && !isCouncil && !isResearchTree && !isConstruction && !isWorldMap;
  const panelStripFrame = isGoals
    ? UI_ASSETS.goalsTitleStrip
    : isInventory
      ? UI_ASSETS.inventoryTitleStrip
      : UI_ASSETS.panelHeaderStrip;
  const footerRows = [
    { id: 'food', label: 'Еда', value: prod.food },
    { id: 'wood', label: 'Дерево', value: prod.wood },
    { id: 'stone', label: 'Камень', value: prod.stone }
  ];
  const buildingHeaderImage = isBuilding
    ? selected.isConstructed
      ? constructionItemAsset(selected.constructionItem)
      : buildingAsset(selected.id, level)
    : null;

  if (!rightPanelOpen) return null;

  return (
    <HudEditableRegion id="settlementRightPanel" as="section" applyLayout={false} className={`right-panel right-panel-fancy ${isOverview ? 'right-panel-overview' : ''} ${isBuilding ? 'right-panel-building' : ''} ${isGoals ? 'right-panel-goals' : ''} ${isInventory ? 'right-panel-inventory' : ''} ${isCouncil ? 'right-panel-council' : ''} ${isResearchTree ? 'right-panel-research-tree' : ''} ${isConstruction ? 'right-panel-construction' : ''} ${isWorldMap ? 'right-panel-world-map' : ''}`.trim()} style={frameStyle(sidePanelFrame)}>
      <div className="panel-header fancy-panel-header">
        {isBuilding ? (
          <div className="building-header-icon" style={frameStyle(UI_ASSETS.buildingHeaderIconSlot)}>
            <img className="building-header-glow" src={UI_ASSETS.buildingHeaderGlow} alt="" draggable={false} />
            <img src={buildingHeaderImage} alt="" draggable={false} />
          </div>
        ) : headerIcon ? (
          <div className="panel-header-icon">
            <AssetIcon src={headerIcon} alt="" size={34} />
          </div>
        ) : null}
        <div className="panel-header-copy">
          <span>{t(headerEyebrow)}</span>
          <strong>{t(headerTitle)}</strong>
        </div>
        {!isOverview ? (
          <button type="button" className="icon-circle panel-header-action" onClick={closePanel} style={frameStyle(UI_ASSETS.close)} aria-label={t("Закрыть панель")}>
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>

      {!isOverview && !isConstruction && !isResearchTree && !isWorldMap ? <div className="panel-strip" style={frameStyle(panelStripFrame)}>{t(headerSubline)}</div> : null}

      {!isOverview && !isConstruction && !isResearchTree && !isWorldMap ? <PanelTabs activePanel={activePanel} setPanel={setPanel} variant="fancy" /> : null}

      <div className="panel-body panel-body-fancy">
        <Suspense fallback={<div className="panel-body" aria-busy="true" />}><RightPanelContent
          activePanel={activePanel}
          selected={selected}
          level={level}
          resources={resources}
          levels={levels}
          population={population}
          stage={stage}
          activeUpgrade={activeUpgrade}
          upgradeBuilding={upgradeBuilding}
          demolishConstructedBuilding={demolishConstructedBuilding}
          setPanel={setPanel}
          selectBuilding={selectBuilding}
          claimedGoalRewardIds={claimedGoalRewardIds}
          claimGoalRewards={claimGoalRewards}
          inventoryCaps={inventoryCaps}
          inventorySelectedResourceId={inventorySelectedResourceId}
          focusInventoryResource={focusInventoryResource}
          adjustInventoryCap={adjustInventoryCap}
          boostInventoryCap={boostInventoryCap}
          constructionCategoryId={constructionCategoryId}
          constructionPage={constructionPage}
          selectedConstructionId={selectedConstructionId}
          selectedConstructionSlotId={selectedConstructionSlotId}
          constructedBuildings={constructedBuildings}
          setConstructionCategory={setConstructionCategory}
          setConstructionPage={setConstructionPage}
          selectConstructionItem={selectConstructionItem}
          researchCategoryId={researchCategoryId}
          selectedResearchId={selectedResearchId}
          researchLevels={researchLevels}
          activeResearch={activeResearch}
          setResearchCategory={setResearchCategory}
          selectResearchNode={selectResearchNode}
          studySelectedResearch={studySelectedResearch}
          worldMapFilterId={worldMapFilterId}
          selectedExpeditionId={selectedExpeditionId}
          activeExpedition={activeExpedition}
          setWorldMapFilter={setWorldMapFilter}
          selectExpedition={selectExpedition}
          startSelectedExpedition={startSelectedExpedition}
        /></Suspense>
      </div>

      {!isOverview ? isBuilding ? (
        <BuildingBenefitFooter building={selected} />
      ) : !showGenericFooter ? null : <div className="panel-footer panel-footer-fancy">
        <div className="panel-footer-rows">
          {footerRows.map((row) => (
            <div key={row.id} className="fancy-footer-row">
              <ResourceIcon type={row.id} size={15} />
              <span>{t(row.label)}</span>
              <strong>{t(row.value)}</strong>
            </div>
          ))}
        </div>
        <div className="panel-footer-bottom">
          <div className="fancy-footer-box footer-summary-box">
            <span>{t("Выпуск партии · каждые 20 с")}</span>
            <strong>{t("Ресурсы поселения")}</strong>
          </div>
          <div className="fancy-footer-box footer-morale-box">
            <span>{t("Мораль")}</span>
            <div className="footer-morale-value"><ResourceIcon type="morale" size={14} /><strong>{t(Math.round(resources.morale))}%</strong></div>
          </div>
          <div className="fancy-footer-box footer-panel-state-box">
            <span>{t("Раздел")}</span>
            <strong>{t(activeTabLabel)}</strong>
          </div>
        </div>
      </div> : null}
    </HudEditableRegion>
  );
}

function NoticeStack() {
  const t = useSettlementText();
  const notices = useSettlementStore((s) => s.notices);
  const dismissNotice = useSettlementStore((s) => s.dismissNotice);
  const visibleNotices = useMemo(() => notices.slice(0, 3), [notices]);

  useEffect(() => {
    if (!visibleNotices.length) return undefined;
    const timers = visibleNotices.map((notice, index) => setTimeout(() => dismissNotice(notice.id), 3000 + index * 180));
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [visibleNotices, dismissNotice]);

  const iconForNotice = (notice) => {
    if (notice.type === 'upgrade') return ICONS.achievement;
    if (notice.type === 'warn') return ICONS.morale;
    if (notice.type === 'collect') return ICONS.gold;
    return ICONS.gift;
  };
  const popForNotice = (notice) => notice.type === 'collect' ? VFX_ASSETS.goldPop : notice.type === 'warn' ? VFX_ASSETS.foodPop : VFX_ASSETS.levelupRays;

  return (
    <HudRegion id="settlementNotices" as="div" applyLayout={false} className="notices notices-v2" aria-live="polite">
      {visibleNotices.map((notice, index) => (
        <button
          key={notice.id}
          type="button"
          className={`notice notice-v2 ${notice.type ?? 'info'}`}
          style={{ ...frameStyle(UI_ASSETS.panel), animationDelay: `${index * 45}ms` }}
          onClick={() => dismissNotice(notice.id)}
          aria-label={t("Закрыть уведомление")}
        >
          <img className="notice-pop" src={popForNotice(notice)} alt="" draggable={false} />
          <AssetIcon src={iconForNotice(notice)} alt="" size={18} />
          <span>{t(notice.text)}</span>
          {(notice.count ?? 1) > 1 ? <b className="notice-count">×{t(notice.count)}</b> : null}
        </button>
      ))}
    </HudRegion>
  );
}

function UpgradeToast({ activeUpgrade }) {
  const t = useSettlementText();
  const [dismissedKey, setDismissedKey] = useState(null);
  if (!activeUpgrade) return null;
  const building = BUILDINGS.find((item) => item.id === activeUpgrade.buildingId);
  if (!building) return null;
  const toastKey = `${activeUpgrade.buildingId}:${activeUpgrade.startedAt}`;
  if (dismissedKey === toastKey) return null;
  const remainingMs = Math.max(0, activeUpgrade.completesAt - Date.now());

  return (
    <div className="upgrade-toast" style={frameStyle(UI_ASSETS.upgradeToast)} role="status" aria-live="polite">
      <AssetIcon src={ICONS.shield} alt="" size={34} />
      <div>
        <strong>{t(building.name)}{t(": улучшение начато")}</strong>
        <span>{t("Завершится через ")}{t(formatDurationMs(remainingMs))}.</span>
      </div>
      <button type="button" onClick={() => setDismissedKey(toastKey)} aria-label={t("Закрыть уведомление")} style={frameStyle(UI_ASSETS.toastClose)}>×</button>
    </div>
  );
}

function OrientationPrompt({ activePanel, rightPanelOpen }) {
  const t = useSettlementText();
  if (!rightPanelOpen || activePanel === 'overview') return null;
  return (
    <div className="orientation-prompt" role="status" aria-live="polite" style={frameStyle(UI_ASSETS.panel)}>
      <strong>{t("Поверните экран")}</strong>
      <span>{t("Для этого раздела лучше подходит горизонтальный режим.")}</span>
    </div>
  );
}

function RightPromoRail({ setPanel }) {
  const t = useSettlementText();
  return (
    <aside className="right-promo-rail">
      {EVENT_CARDS.map((card) => (
        <button
          key={card.id}
          type="button"
          className="promo-button tooltip-control"
          data-tooltip={t(`${card.label}: ${card.sub}`)}
          aria-label={t(card.label)}
          onClick={() => setPanel(card.id === 'mail' ? 'inbox' : 'store')}
          style={frameStyle(UI_ASSETS.iconButton)}
        >
          <AssetIcon src={card.icon} alt="" size={28} />
          <span>{t(card.sub)}</span>
        </button>
      ))}
    </aside>
  );
}

function DevToolsOverlay({ enabled, setEnabled, info }) {
  const t = useSettlementText();
  const copyCoordinates = () => {
    if (!info) return;
    const payload = `x: ${info.mapX}, y: ${info.mapY}`;
    navigator.clipboard?.writeText(payload).catch(() => {});
  };
  const readoutStyle = info
    ? {
        left: `min(${info.clientX + 16}px, calc(100vw - 250px))`,
        top: `min(${info.clientY + 16}px, calc(100vh - 154px))`
      }
    : undefined;

  return (
    <>
      <button
        className={`dev-toggle ${enabled ? 'active' : ''}`}
        type="button"
        onClick={() => setEnabled((value) => !value)}
        aria-label={t("Включить координатную сетку разработчика")}
      >
        DEV {t(enabled ? 'ON' : 'OFF')}
      </button>
      {enabled ? (
        <div className="dev-help">{t("Сетка: 100 px · жирные линии: 500 px · координаты ниже = значения для")}<code>gameData.js</code>
        </div>
      ) : null}
      {enabled && info ? (
        <div className={`dev-cursor-readout ${info.inGround ? '' : 'outside'}`} style={readoutStyle}>
          <div className="dev-readout-title">Map / gameData coords</div>
          <strong>x: {t(info.mapX)}, y: {t(info.mapY)}</strong>
          <span>snap25: {t(info.snap25X)}, {t(info.snap25Y)}</span>
          <span>world: {t(info.worldX)}, {t(info.worldY)}</span>
          <span>zoom: {t(info.scale)}</span>
          <button type="button" onClick={copyCoordinates}>Copy x/y</button>
        </div>
      ) : null}
    </>
  );
}

export default function SettlementGame() {
  const t = useSettlementText();
  const hudLayout = useHudLayout();
  const layoutRegions = hudLayout.resolvedLayout?.regions ?? {};
  const [devMode, setDevMode] = useState(false);
  const [devInfo, setDevInfo] = useState(null);
  const resources = useSettlementStore((s) => s.resources);
  const levels = useSettlementStore((s) => s.levels);
  const population = useSettlementStore((s) => s.population);
  const stage = useMemo(() => getStage(resources, levels), [resources, levels]);
  const selectedBuildingId = useSettlementStore((s) => s.selectedBuildingId);
  const activePanel = useSettlementStore((s) => s.activePanel);
  const rightPanelOpen = useSettlementStore((s) => s.rightPanelOpen);
  const activeUpgrade = useSettlementStore((s) => s.activeUpgrade);
  const claimedGoalRewardIds = useSettlementStore((s) => s.claimedGoalRewardIds);
  const selectedConstructionId = useSettlementStore((s) => s.selectedConstructionId);
  const selectedConstructionSlotId = useSettlementStore((s) => s.selectedConstructionSlotId);
  const constructedBuildings = useSettlementStore((s) => s.constructedBuildings);
  const confirmConstructionPlacement = useSettlementStore((s) => s.confirmConstructionPlacement);
  const selectConstructionSlot = useSettlementStore((s) => s.selectConstructionSlot);
  const setPanel = useSettlementStore((s) => s.setPanel);
  const collect = useSettlementStore((s) => s.collect);
  const claimGoalRewards = useSettlementStore((s) => s.claimGoalRewards);
  const tick = useSettlementStore((s) => s.tick);
  const selectBuilding = useSettlementStore((s) => s.selectBuilding);
  const selectedConstructionItem = useMemo(
    () => CONSTRUCTION_PANEL_DATA.items.find((item) => item.id === selectedConstructionId) ?? CONSTRUCTION_PANEL_DATA.items[0],
    [selectedConstructionId]
  );
  const shellControls = useMemo(() => ({
    activeRun: false,
    hudState: {
      gold: Math.floor(resources.gold ?? 0),
      population,
      prestige: Math.floor(stage.computedPrestige ?? 0)
    }
  }), [population, resources.gold, stage.computedPrestige]);
  const showDevTools = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URL(window.location.href).searchParams.get('dev') === '1';
  }, []);
  useImmersiveGame('settlement', true, shellControls);

  useEffect(() => {
    tick();
    const id = window.setInterval(tick, 1000);
    const refresh = event => {
      if (event.key === SETTLEMENT_SAVE_KEY) useSettlementStore.initializeSettlementPersistence();
    };
    window.addEventListener('storage', refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('storage', refresh);
    };
  }, [tick]);

  return (
    <HudRegion id="gameShell" as="div" applyLayout={false} className="settlement-game-root" style={{ '--settlement-safe-top': `${layoutRegions.pixiPlayfieldReserve?.topReserve ?? 0}px`, '--settlement-safe-bottom': `${layoutRegions.settlementBottomNav?.reserve ?? 0}px` }} data-no-nav-swipe="true" data-active-panel={activePanel} data-selected-building={selectedBuildingId} data-selected-construction={selectedConstructionId ?? ''} data-right-panel-open={rightPanelOpen ? 'true' : 'false'}>
      <main className="settlement-game-shell">
        <Suspense fallback={null}><SceneCanvas
          selectedBuildingId={selectedBuildingId}
          activePanel={activePanel}
          selectedConstructionItem={selectedConstructionItem}
          selectedConstructionSlotId={selectedConstructionSlotId}
          constructedBuildings={constructedBuildings}
          onBuildingSelect={selectBuilding}
          onConfirmConstruction={confirmConstructionPlacement}
          onConstructionSlotSelect={selectConstructionSlot}
          devMode={devMode}
          onDevPointer={setDevInfo}
        /></Suspense>
        <div className="hud-layer">
          <TopHud resources={resources} population={population} stage={stage} />
          <LeftDock activePanel={activePanel} setPanel={setPanel} />
          <SidePanel />
          <BottomNav activePanel={activePanel} setPanel={setPanel} collect={collect} />
          <SettlementPlayPanel />
          <UpgradeToast activeUpgrade={activeUpgrade} />
          <OrientationPrompt activePanel={activePanel} rightPanelOpen={rightPanelOpen} />
          <NoticeStack />
          {showDevTools ? <DevToolsOverlay enabled={devMode} setEnabled={setDevMode} info={devInfo} /> : null}
        </div>
      </main>
    </HudRegion>
  );
}
