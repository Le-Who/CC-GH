import { useRef, useState } from 'react';
import { getStage, useSettlementStore, worldExpeditionUnlocked } from './useSettlementStore.js';
import { selectAndStartExpedition } from './settlementExpeditionActions.js';
import { useSettlementText } from './useSettlementText.js';
import { BUILDINGS, CONSTRUCTION_PANEL_DATA, COUNCIL_PANEL_DATA, GOAL_PANEL_DATA, INVENTORY_PANEL_DATA, PROPS, RESEARCH_PANEL_DATA, RESOURCES, TOP_HUD_RESOURCE_IDS, SETTLEMENT_PROFILE, VILLAGERS, WORKERS, WORLD_MAP_PANEL_DATA, getSettlementPlacementSlotLayout } from './gameData.js';
import { ICONS, MAP_ASSETS, UI_ASSETS, VFX_ASSETS, buildingAsset, trimmedAsset } from './assetRegistry.js';
import { AssetIcon, HudFrame, RESOURCE_ICONS, ResourceIcon, formatClockDuration, formatNumber, frameStyle } from './settlementViewShared.jsx';

const WORLD_MAP_ICON_SOURCES = {
  ...RESOURCE_ICONS,
  all: ICONS.world,
  nature: ICONS.wood,
  ruins: ICONS.gems,
  danger: ICONS.prestige,
  locked: ICONS.shield,
  forest: ICONS.wood,
  map: ICONS.map,
  world: ICONS.world
};

const WORLD_EXPEDITION_CARD_FRAMES = {
  idle: UI_ASSETS.worldExpeditionCardIdle,
  selected: UI_ASSETS.worldExpeditionCardSelected,
  active: UI_ASSETS.worldExpeditionCardActive,
  locked: UI_ASSETS.worldExpeditionCardLocked
};

const WORLD_THUMBNAILS = {
  forest: UI_ASSETS.worldThumbForest,
  nature: UI_ASSETS.worldThumbForest,
  wood: UI_ASSETS.worldThumbForest,
  ruins: UI_ASSETS.worldThumbRuins,
  gems: UI_ASSETS.worldThumbRuins,
  volcano: UI_ASSETS.worldThumbVolcano,
  danger: UI_ASSETS.worldThumbVolcano,
  prestige: UI_ASSETS.worldThumbVolcano,
  world: UI_ASSETS.worldThumbIce,
  locked: UI_ASSETS.worldThumbIce
};

const WORLD_DIFFICULTY_FRAMES = {
  easy: UI_ASSETS.worldDifficultyEasy,
  medium: UI_ASSETS.worldDifficultyMedium,
  hard: UI_ASSETS.worldDifficultyHard,
  locked: UI_ASSETS.worldDifficultyLocked
};

function WorldMapScreen({ filterId, selectedExpeditionId, activeExpedition, onFilterChange, onSelectExpedition, onStartExpedition }) {
  const t = useSettlementText();
  const resources = useSettlementStore((state) => state.resources);
  const levels = useSettlementStore((state) => state.levels);
  const persistenceReady = useSettlementStore((state) => state.persistenceReady);
  const stage = getStage(resources, levels);
  const sending = useRef(false);
  const [pending, setPending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const normalizedFilterId = WORLD_MAP_PANEL_DATA.filters.some((filter) => filter.id === filterId) ? filterId : WORLD_MAP_PANEL_DATA.filters[0]?.id;
  const visibleExpeditions = normalizedFilterId === 'all'
    ? WORLD_MAP_PANEL_DATA.expeditions
    : WORLD_MAP_PANEL_DATA.expeditions.filter((expedition) => expedition.category === normalizedFilterId);
  const selectedExpedition = WORLD_MAP_PANEL_DATA.expeditions.find((expedition) => expedition.id === selectedExpeditionId)
    ?? visibleExpeditions[0]
    ?? WORLD_MAP_PANEL_DATA.expeditions[0];
  const activeId = activeExpedition?.expeditionId ?? null;

  const handleCardKeyDown = (event, expeditionId) => {
    if (event.target !== event.currentTarget || sending.current || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onSelectExpedition(expeditionId);
  };

  const startExpedition = async (event, expeditionId) => {
    event.stopPropagation();
    if (sending.current || !persistenceReady) return;
    sending.current = true;
    setPending(true);
    setSendFailed(false);
    try {
      const started = await selectAndStartExpedition(expeditionId, onSelectExpedition, onStartExpedition);
      setSendFailed(started === false);
    } catch {
      setSendFailed(true);
    } finally {
      sending.current = false;
      setPending(false);
    }
  };

  return (
    <div className="world-screen world-screen-v2">
      <div className="world-map-scroll-v2">
        <HudFrame className="world-map-card world-map-card-v2" frame={UI_ASSETS.worldMapParchmentFrame}>
          <div className="world-map-visual world-map-visual-v2" aria-label={t("Карта архипелага")}>
            <img className="world-map-base-v2" src={UI_ASSETS.worldMapBase} width={1024} height={512} decoding="async" alt="" draggable={false} />
            <img className="world-compass" src={UI_ASSETS.worldMapCompass} width={192} height={192} decoding="async" alt="" draggable={false} />
            {WORLD_MAP_PANEL_DATA.mapMarkers.map((marker) => {
              const expedition = WORLD_MAP_PANEL_DATA.expeditions.find((item) => item.id === marker.expeditionId);
              const locked = !worldExpeditionUnlocked(expedition, stage);
              const selected = marker.expeditionId === selectedExpedition?.id;
              const icon = locked ? WORLD_MAP_ICON_SOURCES.locked : WORLD_MAP_ICON_SOURCES[expedition?.icon] ?? ICONS.world;
              const markerFrame = locked
                ? UI_ASSETS.worldMapMarkerLocked
                : selected
                  ? UI_ASSETS.worldMapMarkerSelected
                  : marker.id === 'home'
                    ? UI_ASSETS.worldMapMarkerHome
                    : UI_ASSETS.worldMapMarkerAvailable;
              return (
                <button
                  key={marker.id}
                  type="button"
                  className={`world-map-marker ${marker.tone} ${selected ? 'selected' : ''} ${locked ? 'locked' : ''}`.trim()}
                  style={{ ...frameStyle(markerFrame), left: `${marker.x}%`, top: `${marker.y}%` }}
                  aria-label={t(`${expedition?.title ?? 'Маршрут'}${locked ? ', закрыто' : ''}`)}
                  onClick={() => { if (!sending.current) onSelectExpedition(marker.expeditionId); }}
                >
                  <AssetIcon src={icon} alt="" size={22} />
                </button>
              );
            })}
          </div>
        </HudFrame>

        <div className="world-filter-row-v2" role="tablist" aria-label={t("Фильтры экспедиций")}>
          {WORLD_MAP_PANEL_DATA.filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={filter.id === normalizedFilterId}
              className={`world-filter-button-v2 ${filter.id === normalizedFilterId ? 'active' : ''}`}
              style={frameStyle(filter.id === normalizedFilterId ? UI_ASSETS.worldMapFilterActive : UI_ASSETS.worldMapFilterIdle)}
              disabled={pending}
              onClick={() => { if (!sending.current) onFilterChange(filter.id); }}
              aria-label={t(filter.label)}
            >
              <AssetIcon src={WORLD_MAP_ICON_SOURCES[filter.icon] ?? ICONS.world} alt="" size={23} />
              <span>{t(filter.label)}</span>
            </button>
          ))}
        </div>

        <p className="world-action-feedback" role="status" aria-live="polite">{sendFailed ? t("Не удалось отправить экспедицию. Проверьте маршрут и повторите попытку.") : ''}</p>
        <div className="world-expedition-heading-v2">{t("Доступные экспедиции")}</div>

        <div className="world-expedition-list-v2">
          {visibleExpeditions.map((expedition) => {
            const selected = expedition.id === selectedExpedition?.id;
            const locked = !worldExpeditionUnlocked(expedition, stage);
            const active = activeId === expedition.id;
            const busy = Boolean(activeId && !active);
            const remainingMs = active ? Math.max(0, activeExpedition.completesAt - Date.now()) : expedition.durationMs;
            const rewards = Object.entries(expedition.rewards ?? {});
            const cardFrame = locked
              ? WORLD_EXPEDITION_CARD_FRAMES.locked
              : active
                ? WORLD_EXPEDITION_CARD_FRAMES.active
                : selected
                  ? WORLD_EXPEDITION_CARD_FRAMES.selected
                  : WORLD_EXPEDITION_CARD_FRAMES.idle;
            const thumb = WORLD_THUMBNAILS[expedition.icon] ?? WORLD_THUMBNAILS[expedition.category] ?? WORLD_THUMBNAILS.forest;
            return (
              <HudFrame
                key={expedition.id}
                className={`world-expedition-card-v2 ${selected ? 'selected' : ''} ${locked ? 'locked' : 'available'} ${active ? 'active' : ''}`.trim()}
                frame={cardFrame}
                role="button"
                tabIndex={0}
                onClick={() => { if (!sending.current) onSelectExpedition(expedition.id); }}
                onKeyDown={(event) => handleCardKeyDown(event, expedition.id)}
              >
                <div className="world-expedition-thumb-v2">
                  <img src={thumb} alt="" width={128} height={96} loading="lazy" decoding="async" draggable={false} />
                </div>
                <div className="world-expedition-copy-v2">
                  <div className="world-expedition-title-row-v2">
                    <strong>{t(expedition.title)}</strong>
                    <span className={`world-difficulty-badge-v2 ${expedition.difficultyTone}`} style={frameStyle(WORLD_DIFFICULTY_FRAMES[expedition.difficultyTone] ?? UI_ASSETS.worldDifficultyEasy)}>{t(expedition.difficulty)}</span>
                  </div>
                  <p>{t(expedition.description)}</p>
                  {locked ? (
                    <em>{t(expedition.unlocked === false ? 'Маршрут пока недоступен' : expedition.requiredLabel ?? 'Маршрут закрыт')}</em>
                  ) : (
                    <div className="world-expedition-rewards-v2" aria-label={t("Награды")}>
                      <span>{t("Награды:")}</span>
                      {rewards.map(([key, value]) => (
                        <b key={key} style={frameStyle(UI_ASSETS.worldRewardChip)}>
                          <ResourceIcon type={key} size={16} />
                          <span>{t(formatNumber(value))}</span>
                        </b>
                      ))}
                    </div>
                  )}
                </div>
                {locked ? (
                  <div className="world-expedition-lock-v2" aria-hidden="true">🔒</div>
                ) : (
                  <button
                    type="button"
                    className="world-expedition-action-v2"
                    disabled={busy || active || pending || !persistenceReady}
                    onClick={(event) => startExpedition(event, expedition.id)}
                    style={frameStyle((busy || active || pending || !persistenceReady) ? UI_ASSETS.worldSendButtonDisabled : UI_ASSETS.worldSendButtonIdle)}
                  >
                    <span>{t(active ? 'В пути' : 'Отправить экспедицию')}</span>
                    <b>⌛ {t(formatClockDuration(remainingMs))}</b>
                  </button>
                )}
              </HudFrame>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default WorldMapScreen;

export { WorldMapScreen };

