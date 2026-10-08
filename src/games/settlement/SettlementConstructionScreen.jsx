import { useSettlementText } from './useSettlementText.js';
import { BUILDINGS, CONSTRUCTION_PANEL_DATA, COUNCIL_PANEL_DATA, GOAL_PANEL_DATA, INVENTORY_PANEL_DATA, PROPS, RESEARCH_PANEL_DATA, RESOURCES, TOP_HUD_RESOURCE_IDS, SETTLEMENT_PROFILE, VILLAGERS, WORKERS, WORLD_MAP_PANEL_DATA, getSettlementPlacementSlotLayout } from './gameData.js';
import { ICONS, MAP_ASSETS, UI_ASSETS, VFX_ASSETS, buildingAsset, trimmedAsset } from './assetRegistry.js';
import { canPay, getResearchNodeStatus, getStage, productionFrom, upgradeCost, useSettlementStore } from './useSettlementStore.js';
import { AssetIcon, HudFrame, CONSTRUCTION_ITEMS_BY_ID_UI, CONSTRUCTION_SLOTS_BY_ID_UI, ResourceIcon, constructionItemAsset, formatNumber, frameStyle } from './settlementViewShared.jsx';

const CONSTRUCTION_CATEGORY_ICONS = {
  production: ICONS.goods,
  storage: ICONS.inventory,
  decor: ICONS.culture,
  special: ICONS.gems
};

const CONSTRUCTION_CATEGORY_FRAMES = {
  production: { idle: UI_ASSETS.constructionCategoryProductionIdle, active: UI_ASSETS.constructionCategoryProductionActive },
  storage: { idle: UI_ASSETS.constructionCategoryStorageIdle, active: UI_ASSETS.constructionCategoryStorageActive },
  decor: { idle: UI_ASSETS.constructionCategoryDecorIdle, active: UI_ASSETS.constructionCategoryDecorActive },
  special: { idle: UI_ASSETS.constructionCategorySpecialIdle, active: UI_ASSETS.constructionCategorySpecialActive }
};

function ConstructionScreen({ resources, categoryId, page, selectedId, selectedSlotId, constructedBuildings, onCategoryChange, onPageChange, onSelectItem }) {
  const t = useSettlementText();
  const pageSize = CONSTRUCTION_PANEL_DATA.pageSize;
  const categories = CONSTRUCTION_PANEL_DATA.categories;
  const activeCategory = categories.some((category) => category.id === categoryId) ? categoryId : categories[0]?.id;
  const categoryItems = CONSTRUCTION_PANEL_DATA.items.filter((item) => item.category === activeCategory);
  const pageCount = Math.max(1, Math.ceil(categoryItems.length / pageSize));
  const safePage = Math.max(0, Math.min(pageCount - 1, page ?? 0));
  const visibleItems = categoryItems.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const selectedItem = CONSTRUCTION_PANEL_DATA.items.find((item) => item.id === selectedId) ?? visibleItems[0];
  const selectedSlot = CONSTRUCTION_SLOTS_BY_ID_UI[selectedSlotId] ?? CONSTRUCTION_PANEL_DATA.placementSlots[0];
  const selectedSlotRecord = selectedSlot ? constructedBuildings?.[selectedSlot.id] : null;
  const selectedSlotItem = selectedSlotRecord ? CONSTRUCTION_ITEMS_BY_ID_UI[selectedSlotRecord.itemId] : null;

  return (
    <div className="construction-screen construction-screen-v2">
      <div className="construction-category-row construction-category-row-v2" role="tablist" aria-label={t("Категории строительства")}>
        {categories.map((category) => {
          const active = category.id === activeCategory;
          return (
            <button
              key={category.id}
              className={`construction-category-chip construction-category-chip-v2 ${active ? 'active' : ''}`.trim()}
              style={frameStyle(CONSTRUCTION_CATEGORY_FRAMES[category.id]?.[active ? 'active' : 'idle'])}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onCategoryChange(category.id)}
            >
              <AssetIcon src={CONSTRUCTION_CATEGORY_ICONS[category.icon] ?? ICONS.build} alt="" size={30} />
              <span>{t(category.label)}</span>
            </button>
          );
        })}
      </div>

      <div className={`construction-slot-status-v2 ${selectedSlotRecord ? 'occupied' : 'empty'}`} style={frameStyle(UI_ASSETS.constructionPlacementHint)}>
        <AssetIcon src={selectedSlotRecord ? ICONS.store : ICONS.map} alt="" size={18} />
        <div>
          <strong>{t(selectedSlot?.label ?? 'Площадка')}</strong>
          <span>{t(selectedSlotRecord ? `Занято: ${selectedSlotItem?.name ?? 'постройка'}. Тапните постройку на карте, чтобы открыть снос.` : `Свободно: выбрано место для ${selectedItem?.name ?? 'постройки'}.`)}</span>
        </div>
      </div>

      <div className="construction-card-grid construction-card-grid-v2">
        {visibleItems.map((item) => {
          const affordable = canPay(resources, item.cost);
          const selected = item.id === selectedItem?.id;
          const cardFrame = selected
            ? UI_ASSETS.constructionCardSelected
            : affordable
              ? UI_ASSETS.constructionCardIdle
              : UI_ASSETS.constructionCardLocked;
          return (
            <HudFrame as="button"
              key={item.id}
              type="button"
              className={`construction-card construction-card-v2 ${affordable ? 'available' : 'locked'} ${selected ? 'selected' : ''}`.trim()}
              frame={cardFrame}
              onClick={() => onSelectItem(item.id)}
              aria-pressed={selected}
            >
              <div className="construction-card-name">{t(item.name)}</div>
              <div className="construction-card-art construction-card-art-v2" style={frameStyle(UI_ASSETS.constructionCardArtGlow)}>
                <img src={constructionItemAsset(item)} alt="" draggable={false} />
              </div>
              <div className="construction-cost-row construction-cost-row-v2" style={frameStyle(UI_ASSETS.constructionCostRow)}>
                {Object.entries(item.cost).slice(0, 2).map(([key, value]) => (
                  <b key={key} className={(resources[key] ?? 0) >= value ? 'ok' : 'need'}>
                    <ResourceIcon type={key} size={14} />
                    <span>{t(formatNumber(value))}</span>
                  </b>
                ))}
              </div>
            </HudFrame>
          );
        })}
      </div>

      <div className="construction-pager" aria-label={t("Страницы каталога")}>
        <button type="button" style={frameStyle(safePage <= 0 ? UI_ASSETS.constructionPagerDisabled : UI_ASSETS.constructionPagerIdle)} onClick={() => onPageChange(safePage - 1)} disabled={safePage <= 0} aria-label={t("Предыдущая страница")}>‹</button>
        <strong style={frameStyle(UI_ASSETS.constructionPageIndicator)}>{t(safePage + 1)}/{t(pageCount)}</strong>
        <button type="button" style={frameStyle(safePage >= pageCount - 1 ? UI_ASSETS.constructionPagerDisabled : UI_ASSETS.constructionPagerIdle)} onClick={() => onPageChange(safePage + 1)} disabled={safePage >= pageCount - 1} aria-label={t("Следующая страница")}>›</button>
      </div>

      {selectedItem ? (
        <div className="construction-placement-hint construction-placement-hint-v2" style={frameStyle(UI_ASSETS.constructionPlacementHint)}>
          <AssetIcon src={ICONS.map} alt="" size={16} />
          <span>{t(selectedItem.name)}{t(": тапните свободную площадку на карте, затем подтвердите зелёной кнопкой на самой площадке.")}</span>
        </div>
      ) : null}
    </div>
  );
}

export default ConstructionScreen;

export { ConstructionScreen };

