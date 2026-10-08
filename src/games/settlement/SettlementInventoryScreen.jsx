import { useSettlementText } from './useSettlementText.js';
import { BUILDINGS, CONSTRUCTION_PANEL_DATA, COUNCIL_PANEL_DATA, GOAL_PANEL_DATA, INVENTORY_PANEL_DATA, PROPS, RESEARCH_PANEL_DATA, RESOURCES, TOP_HUD_RESOURCE_IDS, SETTLEMENT_PROFILE, VILLAGERS, WORKERS, WORLD_MAP_PANEL_DATA, getSettlementPlacementSlotLayout } from './gameData.js';
import { ICONS, MAP_ASSETS, UI_ASSETS, VFX_ASSETS, buildingAsset, trimmedAsset } from './assetRegistry.js';
import { AssetIcon, HudFrame, ResourceIcon, formatNumber, frameStyle } from './settlementViewShared.jsx';

const SPECIAL_ITEM_ICON_SOURCES = {
  starterPack: ICONS.starterPack,
  inventory: ICONS.inventory,
  quest: ICONS.quest,
  world: ICONS.world,
  achievement: ICONS.achievement
};

function InventoryScreen({ resources, inventoryCaps, selectedResourceId, onFocusResource, onAdjustCap, onBoostCap }) {
  const t = useSettlementText();
  const resourceRows = INVENTORY_PANEL_DATA.resourceRows;
  const selectedResource = resourceRows.find((row) => row.id === selectedResourceId) ?? resourceRows[0];
  const totalStored = resourceRows.reduce((sum, row) => sum + (resources[row.id] ?? 0), 0);
  const totalCap = resourceRows.reduce((sum, row) => sum + (inventoryCaps[row.id] ?? row.initialCap), 0);
  const selectedCap = inventoryCaps[selectedResource.id] ?? selectedResource.initialCap;
  const selectedValue = resources[selectedResource.id] ?? 0;
  const selectedFill = Math.max(0, Math.min(100, (selectedValue / Math.max(1, selectedCap)) * 100));
  const selectedAtMax = selectedCap >= selectedResource.maxCap;

  return (
    <div className="inventory-screen inventory-screen-v2">
      <div className="inventory-section-head inventory-section-head-v2">
        <span>{t("Ресурсы")}</span>
        <b>{t(formatNumber(totalStored))} / {t(formatNumber(totalCap))}</b>
      </div>

      <HudFrame className="inventory-selected-summary-v2" frame={UI_ASSETS.inventorySummaryCard}>
        <span className="inventory-resource-icon-slot" style={frameStyle(UI_ASSETS.inventoryResourceIconSlot)}>
          <ResourceIcon type={selectedResource.id} size={26} />
        </span>
        <div className="inventory-selected-copy-v2">
          <span>{t("Выбранный ресурс")}</span>
          <strong>{t(selectedResource.label)}</strong>
          <div className="inventory-capacity-bar-v2" aria-label={t(`${selectedResource.label}: ${formatNumber(selectedValue)} из ${formatNumber(selectedCap)}`)}>
            <i style={{ width: `${selectedFill}%` }} />
          </div>
        </div>
        <div className="inventory-selected-values-v2">
          <b>{t(formatNumber(selectedValue))}</b>
          <span>{t("из ")}{t(formatNumber(selectedCap))}</span>
        </div>
      </HudFrame>

      <div className="inventory-resource-list inventory-resource-list-v2">
        {resourceRows.map((row) => {
          const value = resources[row.id] ?? 0;
          const cap = inventoryCaps[row.id] ?? row.initialCap;
          const ratio = value / Math.max(1, cap);
          const isSelected = selectedResource.id === row.id;
          const rowFrame = ratio >= 0.9
            ? UI_ASSETS.inventoryRowWarning
            : isSelected
              ? UI_ASSETS.inventoryRowSelected
              : UI_ASSETS.inventoryRowIdle;
          return (
            <HudFrame
              key={row.id}
              className={`inventory-resource-row inventory-resource-row-v2 ${isSelected ? 'selected' : ''} ${ratio >= 0.9 ? 'warning' : ''}`.trim()}
              frame={rowFrame}
              role="button"
              tabIndex={0}
              onClick={() => onFocusResource(row.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onFocusResource(row.id);
                }
              }}
            >
              <span className="inventory-resource-icon-slot" style={frameStyle(UI_ASSETS.inventoryResourceIconSlot)}>
                <ResourceIcon type={row.id} size={22} />
              </span>
              <div className="inventory-resource-copy inventory-resource-copy-v2">
                <strong>{t(row.label)}</strong>
                <span>{t(formatNumber(value))} / {t(formatNumber(cap))}</span>
              </div>
              <div className={`inventory-row-controls ${isSelected ? 'selected-controls' : 'compact-controls'}`}>
                {isSelected ? (
                  <>
                    <button type="button" className="inventory-row-control" style={frameStyle(cap <= row.minCap ? UI_ASSETS.inventoryMinusDisabled : UI_ASSETS.inventoryMinusIdle)} onClick={() => onAdjustCap(row.id, -row.step)} disabled={cap <= row.minCap} aria-label={t(`Уменьшить вместимость: ${row.label}`)}>−</button>
                    <button type="button" className="inventory-row-control" style={frameStyle(cap >= row.maxCap ? UI_ASSETS.inventoryPlusDisabled : UI_ASSETS.inventoryPlusIdle)} onClick={() => onAdjustCap(row.id, row.step)} disabled={cap >= row.maxCap} aria-label={t(`Увеличить вместимость: ${row.label}`)}>+</button>
                  </>
                ) : null}
                <button type="button" className="inventory-row-control next" style={frameStyle(UI_ASSETS.inventorySelectIdle)} onClick={() => onFocusResource(row.id)} aria-label={t(`Выбрать ресурс: ${row.label}`)}>{t(isSelected ? 'Выбрано' : 'Выбрать')}</button>
              </div>
            </HudFrame>
          );
        })}
      </div>

      <div className="inventory-section-head inventory-section-head-v2 inventory-special-head-v2">{t("Изделия и особые предметы")}</div>
      <p className="settlement-goal-disclosure">{t("Учёт особых предметов пока не подключён. Здесь показаны только реальные ресурсы склада.")}</p>

      <button className="inventory-action-button inventory-action-button-v2" type="button" onClick={() => onBoostCap(selectedResource.id)} disabled={selectedAtMax} style={frameStyle(selectedAtMax ? UI_ASSETS.inventoryManageButtonDisabled : UI_ASSETS.inventoryManageButtonIdle)}>
        <AssetIcon src={ICONS.inventory} alt="" size={18} />
        <span>{t("Управление складом")}</span>
      </button>
    </div>
  );
}

export default InventoryScreen;

export { InventoryScreen };
