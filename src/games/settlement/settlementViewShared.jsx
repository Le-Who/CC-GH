import { useSettlementText } from './useSettlementText.js';
import { BUILDINGS, CONSTRUCTION_PANEL_DATA, COUNCIL_PANEL_DATA, GOAL_PANEL_DATA, INVENTORY_PANEL_DATA, PROPS, RESEARCH_PANEL_DATA, RESOURCES, TOP_HUD_RESOURCE_IDS, SETTLEMENT_PROFILE, VILLAGERS, WORKERS, WORLD_MAP_PANEL_DATA, getSettlementPlacementSlotLayout } from './gameData.js';
import { ICONS, MAP_ASSETS, UI_ASSETS, VFX_ASSETS, buildingAsset, trimmedAsset } from './assetRegistry.js';

const RESOURCE_LABELS = {
  food: 'Еда',
  wood: 'Дерево',
  stone: 'Камень',
  goods: 'Товары',
  culture: 'Культура',
  gold: 'Золото',
  gems: 'Кристаллы',
  prestige: 'Престиж',
  morale: 'Мораль',
  population: 'Жители'
};

const RESOURCE_ICONS = {
  food: ICONS.food,
  wood: ICONS.wood,
  stone: ICONS.stone,
  goods: ICONS.goods,
  culture: ICONS.culture,
  gold: ICONS.gold,
  gems: ICONS.gems,
  prestige: ICONS.prestige,
  morale: ICONS.morale,
  population: ICONS.population
};

function constructionItemAsset(item) {
  return buildingAsset(item.assetBuildingId, item.assetLevel ?? 1);
}

const CONSTRUCTION_ITEMS_BY_ID_UI = Object.fromEntries(CONSTRUCTION_PANEL_DATA.items.map((item) => [item.id, item]));

const CONSTRUCTION_SLOTS_BY_ID_UI = Object.fromEntries(CONSTRUCTION_PANEL_DATA.placementSlots.map((slot) => [slot.id, slot]));

function formatNumber(n) {
  const value = Math.floor(n ?? 0);
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 10000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString('ru-RU');
}

function resourceLabel(key) {
  return RESOURCE_LABELS[key] ?? key;
}

function formatDurationMs(ms) {
  const totalSeconds = Math.max(0, Math.ceil((ms ?? 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}м ${seconds.toString().padStart(2, '0')}с`;
}

function formatClockDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil((ms ?? 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function ResourceIcon({ type, size = 16, className = '' }) {
  const t = useSettlementText();
  const src = RESOURCE_ICONS[type];
  return src ? <AssetIcon src={src} alt="" className={className} size={size} /> : null;
}

function HudFrame({ children, className = '', frame = UI_ASSETS.panel, ...props }) {
  const t = useSettlementText();
  return <div className={className} style={frameStyle(frame)} {...props}>{t(children)}</div>;
}

function ProgressBar({ value = 0, max = 100, fill = 'green', label, className = '' }) {
  const t = useSettlementText();
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  const fillAsset = fill === 'gold' ? UI_ASSETS.progressGold : UI_ASSETS.progressGreen;
  return (
    <div className={`asset-progress ${className}`.trim()}>
      {label ? <span>{t(label)}</span> : null}
      <div className="asset-progress-track" style={frameStyle(UI_ASSETS.progressFrame)}>
        <div className="asset-progress-fill" style={{ ...frameStyle(fillAsset), width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RewardBadge({ type = 'gold', amount, label, frame = UI_ASSETS.rewardBadge }) {
  const t = useSettlementText();
  return (
    <div className="reward-badge" style={frameStyle(frame)}>
      <ResourceIcon type={type} size={18} />
      <strong>{t(amount)}</strong>
      {label ? <span>{t(label)}</span> : null}
    </div>
  );
}

function frameStyle(url, size = '100% 100%') {
  if (!url) return {};
  return {
    backgroundImage: `url(${url})`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
    backgroundSize: size
  };
}

function AssetIcon({ src, alt = '', className = '', size = 20 }) {
  const t = useSettlementText();
  return <img src={src} alt={t(alt)} className={`asset-icon ${className}`.trim()} style={{ width: size, height: size }} draggable={false} />;
}

export { AssetIcon, CONSTRUCTION_ITEMS_BY_ID_UI, CONSTRUCTION_SLOTS_BY_ID_UI, HudFrame, ProgressBar, RESOURCE_ICONS, ResourceIcon, RewardBadge, constructionItemAsset, formatClockDuration, formatDurationMs, formatNumber, frameStyle, resourceLabel };
