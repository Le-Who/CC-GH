import { UI_ASSETS } from './assetRegistry.js';
export const SETTLEMENT_CARD_MATERIAL = Object.freeze({
 url: '/games/settlement/ui/illustrated-v2/compact-parchment-card.webp',
 sourceWidth: 1086, sourceHeight: 362, x: 0, y: 64.5, width: 1086, height: 232.5, corner: 48
});
const illustratedCardFrames = new Set([
 UI_ASSETS.panel,
 UI_ASSETS.smallPanel,
 UI_ASSETS.goalsSummaryCard,
 UI_ASSETS.goalsLongtermRow,
 UI_ASSETS.goalsDailyRow,
 UI_ASSETS.inventorySummaryCard,
 UI_ASSETS.inventoryItemCard,
 UI_ASSETS.councilRecommendationCard,
 UI_ASSETS.councilRecommendationCardHovered,
 UI_ASSETS.councilStageCard,
 UI_ASSETS.researchDetailCard,
 UI_ASSETS.overviewIntroCard,
 UI_ASSETS.overviewSectionCard,
 UI_ASSETS.buildingStatsCard,
 UI_ASSETS.constructionCardIdle,
 UI_ASSETS.constructionCardSelected,
 UI_ASSETS.constructionCardLocked,
 UI_ASSETS.researchNodeComplete,
 UI_ASSETS.researchNodeAvailable,
 UI_ASSETS.researchNodeSelected,
 UI_ASSETS.researchNodeResearching,
 UI_ASSETS.researchNodeLocked,
 UI_ASSETS.worldExpeditionCardIdle,
 UI_ASSETS.worldExpeditionCardSelected,
 UI_ASSETS.worldExpeditionCardActive,
 UI_ASSETS.worldExpeditionCardLocked
]);
export function settlementFrameMaterial(frame) {
 return illustratedCardFrames.has(frame) ? SETTLEMENT_CARD_MATERIAL : null;
}

