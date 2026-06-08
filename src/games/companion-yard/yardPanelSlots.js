import { assetSlotStyle } from "../../app/assetSlots.js";

export const YARD_PANEL_REFERENCE = Object.freeze({ width: 1024, height: 1536 });

function slot(x, y, width, height) {
  return Object.freeze({ x, y, width, height });
}

function withCommon(slots = {}, groups = {}) {
  return Object.freeze({
    slots: Object.freeze({
      "panel-title": slot(268, 104, 488, 94),
      "panel-close": slot(832, 100, 132, 132),
      ...slots,
    }),
    groups: Object.freeze(groups),
  });
}

const shopRow = (y) => slot(116, y, 796, 108);
const listRow = (y) => slot(128, y, 760, 106);
const albumCard = (x, y) => slot(x, y, 238, 282);
const petbookCard = (x, y) => slot(x, y, 150, 270);

export const YARD_SCREEN_SLOT_MAPS = Object.freeze({
  food: withCommon({}, {
    "food-choice": [
      slot(118, 360, 246, 452),
      slot(390, 360, 246, 452),
      slot(662, 360, 246, 452),
      slot(118, 844, 246, 452),
      slot(390, 844, 246, 452),
      slot(662, 844, 246, 452),
    ],
  }),
  goodies: withCommon({
    "inventory-title": slot(292, 300, 430, 70),
    "inventory-list": slot(128, 370, 760, 435),
    "placed-title": slot(292, 830, 430, 70),
    "placed-list": slot(128, 895, 760, 440),
  }, {
    "inventory-row": [
      listRow(370),
      listRow(455),
      listRow(540),
      listRow(625),
      listRow(710),
    ],
    "placed-row": [
      listRow(895),
      listRow(980),
      listRow(1065),
      listRow(1150),
      listRow(1235),
    ],
  }),
  shop: withCommon({
    "food-title": slot(158, 344, 200, 48),
    "food-list": slot(116, 396, 796, 338),
    "goodies-title": slot(158, 742, 220, 48),
    "goodies-list": slot(116, 790, 796, 234),
    "backgrounds-title": slot(158, 1032, 220, 48),
    "backgrounds-list": slot(116, 1078, 796, 269),
  }, {
    "shop-food-row": [shopRow(396), shopRow(510), shopRow(624)],
    "shop-goodies-row": [shopRow(790), shopRow(905)],
    "shop-background-row": [shopRow(1078), shopRow(1193)],
  }),
  petbook: withCommon({}, {
    "petbook-card": [
      petbookCard(140, 314),
      petbookCard(318, 314),
      petbookCard(555, 314),
      petbookCard(733, 314),
      petbookCard(140, 622),
      petbookCard(318, 622),
      petbookCard(555, 622),
      petbookCard(733, 622),
      petbookCard(140, 934),
      petbookCard(318, 934),
      petbookCard(555, 934),
      petbookCard(733, 934),
    ],
  }),
  album: withCommon({
    "album-camera": slot(372, 170, 280, 132),
  }, {
    "album-card": [
      albumCard(245, 360),
      albumCard(555, 360),
      albumCard(245, 682),
      albumCard(555, 682),
      albumCard(245, 1004),
      albumCard(555, 1004),
    ],
  }),
  gifts: withCommon({
    "gifts-summary-title": slot(230, 302, 560, 58),
    "gifts-collect": slot(294, 540, 454, 132),
  }, {
    "gifts-metric": [
      slot(270, 390, 160, 132),
      slot(444, 390, 160, 132),
      slot(618, 390, 160, 132),
    ],
    "gifts-row": [
      listRow(756),
      listRow(876),
      listRow(996),
      listRow(1116),
      listRow(1236),
    ],
  }),
  repair: withCommon({
    "repair-section": slot(118, 300, 790, 1040),
  }, {
    "repair-row": [
      listRow(318),
      listRow(435),
      listRow(552),
      listRow(669),
      listRow(786),
      listRow(903),
      listRow(1020),
    ],
  }),
  remodel: withCommon({}, {
    "remodel-row": [
      slot(160, 330, 300, 300),
      slot(565, 330, 300, 300),
      slot(160, 670, 300, 300),
      slot(565, 670, 300, 300),
    ],
  }),
  expansion: withCommon({
    "expansion-title": slot(245, 470, 530, 72),
    "expansion-action": slot(278, 1170, 468, 132),
  }, {
    "expansion-metric": [
      slot(210, 585, 180, 130),
      slot(420, 585, 180, 130),
      slot(630, 585, 180, 130),
    ],
  }),
  daily: withCommon({
    "daily-title": slot(118, 292, 430, 54),
    "daily-action": slot(278, 1172, 468, 132),
  }, {
    "daily-metric": [
      slot(190, 972, 224, 186),
      slot(418, 972, 224, 186),
      slot(646, 972, 224, 186),
    ],
  }),
  companion: withCommon({
    "companion-title": slot(152, 300, 300, 54),
    "companion-name": slot(185, 350, 500, 132),
    "companion-save": slot(690, 350, 170, 132),
    "companion-helper": slot(278, 1170, 468, 132),
  }, {
    "companion-species": [
      slot(165, 505, 200, 210),
      slot(412, 505, 200, 210),
      slot(660, 505, 200, 210),
      slot(165, 750, 200, 210),
      slot(412, 750, 200, 210),
      slot(660, 750, 200, 210),
    ],
  }),
  settings: withCommon({
    "settings-title": slot(96, 318, 250, 52),
    "settings-action": slot(280, 1242, 468, 132),
  }, {
    "settings-row": [
      slot(150, 348, 720, 120),
      slot(150, 504, 720, 120),
      slot(150, 660, 720, 120),
      slot(150, 816, 720, 120),
      slot(150, 1048, 720, 130),
    ],
  }),
});

export function yardPanelSlot(screenId, slotId) {
  return YARD_SCREEN_SLOT_MAPS[screenId]?.slots?.[slotId] || null;
}

export function yardPanelGroupSlot(screenId, groupId, index) {
  return YARD_SCREEN_SLOT_MAPS[screenId]?.groups?.[groupId]?.[index] || null;
}

export function yardPanelSlotStyle(screenId, slotId) {
  const target = yardPanelSlot(screenId, slotId);
  return target ? assetSlotStyle(target, YARD_PANEL_REFERENCE) : undefined;
}

export function yardPanelGroupSlotStyle(screenId, groupId, index) {
  const target = yardPanelGroupSlot(screenId, groupId, index);
  return target ? assetSlotStyle(target, YARD_PANEL_REFERENCE) : undefined;
}

export function yardPanelNestedGroupSlotStyle(screenId, groupId, index, parentSlotId) {
  const parent = yardPanelSlot(screenId, parentSlotId);
  const target = yardPanelGroupSlot(screenId, groupId, index);
  if (!parent || !target || parent.width <= 0 || parent.height <= 0) return undefined;

  return assetSlotStyle({
    x: target.x - parent.x,
    y: target.y - parent.y,
    width: target.width,
    height: target.height,
  }, {
    width: parent.width,
    height: parent.height,
  });
}
