# Settlement Prod-Ready Asset Backlog

Scope: UI chrome only. No baked text in assets. All labels, counters, numbers, and dynamic values must be rendered in code.

## Global rules

- Format: `.webp` with alpha where transparent edges are required.
- Text: none in raster assets except purely decorative glyphs that are not readable UI text.
- Frames: prepare for 9-slice use on all panels, tabs, buttons, cards, and toasts.
- States: supply idle, active, pressed, disabled, locked, warning, ready, complete where the UI uses them.
- Trim: tight bounds, no extra transparent margins.
- Backgrounds: separate from HUD chrome.

## Screen 1 - Village overview

| Asset key | Suggested file name | Purpose | Size | Alpha | Notes |
|---|---|---|---|---|---|
| `hud.profile.frame` | `ui/hud/profile-card-frame.webp` | Top-left profile container | 512x192 | yes | 9-slice corners, no text |
| `hud.profile.avatar` | `ui/hud/profile-avatar-frame.webp` | Shield/avatar medallion | 256x256 | yes | Decorative rim only |
| `hud.profile.level-badge` | `ui/hud/profile-level-badge.webp` | Circular level marker | 128x128 | yes | Number rendered in code |
| `hud.settlement.plaque` | `ui/hud/settlement-title-plaque.webp` | Settlement name plaque | 768x192 | yes | Empty center for code text |
| `hud.resource.pill.idle` | `ui/hud/resource-pill-idle.webp` | Top resource container | 256x128 | yes | Shared across all resource types |
| `hud.resource.pill.active` | `ui/hud/resource-pill-active.webp` | Highlighted resource container | 256x128 | yes | Same layout as idle |
| `hud.resource.icon.slot` | `ui/hud/resource-icon-slot.webp` | Icon holder inside resource pill | 96x96 | yes | No icon baked in |
| `hud.leftdock.button.idle` | `ui/hud/leftdock-button-idle.webp` | Left dock action button | 160x160 | yes | Circular or framed square |
| `hud.leftdock.button.active` | `ui/hud/leftdock-button-active.webp` | Left dock selected state | 160x160 | yes | Stronger glow / gold edge |
| `hud.leftdock.badge` | `ui/hud/notification-badge.webp` | Numeric badge shell | 96x96 | yes | Number rendered in code |
| `hud.bottomnav.frame` | `ui/hud/bottom-nav-frame.webp` | Bottom dock container | 1536x256 | yes | Wide shell, 9-slice edges |
| `hud.bottomnav.button.idle` | `ui/hud/bottom-nav-button-idle.webp` | Bottom nav slot | 192x192 | yes | Used for all nav items |
| `hud.bottomnav.button.active` | `ui/hud/bottom-nav-button-active.webp` | Bottom nav active slot | 192x192 | yes | Gold/green active treatment |
| `hud.bottomnav.primary-build.idle` | `ui/hud/primary-build-button-idle.webp` | Center build button | 224x224 | yes | Larger than normal nav slots |
| `hud.bottomnav.primary-build.active` | `ui/hud/primary-build-button-active.webp` | Active build button | 224x224 | yes | Match screenshot emphasis |
| `hud.bottomnav.collect.idle` | `ui/hud/collect-button-idle.webp` | Collect button | 192x192 | yes | Chest shell only |
| `hud.bottomnav.collect.active` | `ui/hud/collect-button-active.webp` | Collect active state | 192x192 | yes | Gold highlight |
| `panel.right.shell.overview` | `ui/panel/right-panel-overview-shell.webp` | Overview right panel frame | 768x1248 | yes | Tall panel, no text |
| `panel.right.header.strip` | `ui/panel/right-panel-header-strip.webp` | Header divider strip | 768x96 | yes | Used in overview and detail panels |
| `panel.card.intro` | `ui/panel/overview-intro-card.webp` | Intro message card | 640x128 | yes | Decorative border only |
| `panel.section.card` | `ui/panel/overview-section-card.webp` | Generic overview section card | 640x160 | yes | Shared for income/morale/goals |
| `panel.goal.row` | `ui/panel/overview-goal-row.webp` | Goal row container | 640x96 | yes | Space for icon, progress, reward |
| `panel.toast.collect` | `ui/toast/collect-ready-toast.webp` | Bottom collection toast | 960x128 | yes | No text; text is code |
| `panel.tab.idle` | `ui/tabs/panel-tab-idle.webp` | Side panel tab idle | 192x96 | yes | Label rendered in code |
| `panel.tab.active` | `ui/tabs/panel-tab-active.webp` | Side panel tab active | 192x96 | yes | Strong active glow |
| `status.progress.frame` | `ui/status/progress-frame.webp` | Progress bar shell | 512x64 | yes | Shared across screens |
| `status.progress.fill.green` | `ui/status/progress-fill-green.webp` | Green fill strip | 512x32 | yes | Stretchable fill asset |
| `status.progress.fill.gold` | `ui/status/progress-fill-gold.webp` | Gold fill strip | 512x32 | yes | Stretchable fill asset |
| `status.badge.reward` | `ui/status/reward-badge-shell.webp` | Reward amount shell | 128x96 | yes | Amount rendered in code |

## Screen 2 - Building detail (Очажный зал)

| Asset key | Suggested file name | Purpose | Size | Alpha | Notes |
|---|---|---|---|---|---|
| `panel.right.shell.building` | `ui/panel/right-panel-building-shell.webp` | Building detail panel frame | 768x1360 | yes | Taller than overview shell |
| `panel.right.header.icon-slot` | `ui/panel/right-panel-header-icon-slot.webp` | Left header icon frame | 128x128 | yes | Holds building emblem/thumbnail |
| `panel.building.description` | `ui/panel/building-description-block.webp` | Top description block | 640x96 | yes | Text rendered in code |
| `panel.building.level-row` | `ui/panel/building-level-row.webp` | Level/progress strip container | 640x72 | yes | Includes three-column layout |
| `panel.building.stats.card` | `ui/panel/building-stats-card.webp` | Production/cost stat card | 320x240 | yes | Used twice in side-by-side grid |
| `panel.building.stats.row` | `ui/panel/building-stat-row.webp` | Single stat row container | 288x44 | yes | For resource icon + values |
| `panel.building.action.primary.idle` | `ui/button/building-upgrade-idle.webp` | Upgrade button | 640x88 | yes | Green active build state |
| `panel.building.action.primary.disabled` | `ui/button/building-upgrade-disabled.webp` | Disabled upgrade button | 640x88 | yes | Muted + locked |
| `panel.building.action.primary.in-progress` | `ui/button/building-upgrade-in-progress.webp` | In-progress upgrade button | 640x88 | yes | If timer is running |
| `panel.building.timer.pill` | `ui/button/building-timer-pill.webp` | Timer display under button | 240x56 | yes | Clock icon area, no text |
| `panel.building.footer.card` | `ui/panel/building-footer-card.webp` | Footer benefit card | 192x104 | yes | Two tiles: income and morale |
| `panel.building.footer.small-icon` | `ui/panel/building-footer-icon-slot.webp` | Icon slot inside footer card | 32x32 | yes | For gold / morale |
| `panel.toast.upgrade` | `ui/toast/upgrade-start-toast.webp` | Bottom-left upgrade toast | 560x128 | yes | Start/completion toast shell |
| `panel.toast.close` | `ui/button/toast-close-button.webp` | Toast close control | 48x48 | yes | Only chrome, no text |
| `panel.header.building-glow` | `ui/panel/building-header-glow.webp` | Header glow behind icon slot | 128x128 | yes | Decorative emphasis only |
| `panel.tab.idle` | `ui/tabs/panel-tab-idle.webp` | Shared tab idle state | 192x96 | yes | Reused from overview |
| `panel.tab.active` | `ui/tabs/panel-tab-active.webp` | Shared tab active state | 192x96 | yes | Reused from overview |

## Screen 3 - Goals panel (Цели поселения)

| Asset key | Suggested file name | Purpose | Size | Alpha | Notes |
|---|---|---|---|---|---|
| `panel.right.shell.goals` | `ui/panel/right-panel-goals-shell.webp` | Goals panel frame | 768x1360 | yes | Same shell family as building detail, goal-specific spacing |
| `panel.right.header.goal-title` | `ui/panel/right-panel-goals-title-strip.webp` | Goals header strip | 768x96 | yes | Empty center for code-rendered title |
| `panel.goals.summary.card` | `ui/panel/goals-summary-card.webp` | Top summary card for claimable rewards | 640x128 | yes | No baked numbers or text |
| `panel.goals.longterm.row` | `ui/panel/goals-longterm-row.webp` | Long-term goal row container | 640x104 | yes | Space for icon, text, progress, reward |
| `panel.goals.daily.row` | `ui/panel/goals-daily-row.webp` | Daily task row container | 640x104 | yes | Same geometry as long-term row |
| `panel.goals.goal.icon-slot` | `ui/panel/goals-icon-slot.webp` | Left icon frame for goal rows | 72x72 | yes | Icon only, no text |
| `panel.goals.reward.badge` | `ui/status/goals-reward-badge.webp` | Reward amount container | 128x96 | yes | Amount/type rendered in code |
| `panel.goals.claim.button.idle` | `ui/button/goals-claim-button-idle.webp` | Claim rewards button | 640x88 | yes | Green state, no text |
| `panel.goals.claim.button.disabled` | `ui/button/goals-claim-button-disabled.webp` | Disabled claim button | 640x88 | yes | Muted state, same geometry |
| `panel.goals.claim.count.badge` | `ui/status/goals-claim-count-badge.webp` | Claim counter badge | 96x96 | yes | Number rendered in code |
| `panel.goals.refresh.chip` | `ui/status/goals-refresh-chip.webp` | Daily refresh timer chip | 256x64 | yes | Timer text rendered in code |
| `panel.goals.progress.row` | `ui/status/goals-progress-row.webp` | Progress strip backing for goals | 512x64 | yes | Used for 12/15, 7/10, etc. |
| `hud.bottomnav.button.goals.active` | `ui/hud/bottom-nav-button-goals-active.webp` | Bottom dock goals slot active | 192x192 | yes | Trophy/rank slot, badge baked out |
| `hud.bottomnav.button.goals.idle` | `ui/hud/bottom-nav-button-goals-idle.webp` | Bottom dock goals slot idle | 192x192 | yes | Shared with other bottom nav items |

## Screen 4 - Inventory and storage (Инвентарь и склад)

| Asset key | Suggested file name | Purpose | Size | Alpha | Notes |
|---|---|---|---|---|---|
| `panel.right.shell.inventory` | `ui/panel/right-panel-inventory-shell.webp` | Inventory panel frame | 768x1360 | yes | Same shell family as goals/building, inventory-specific spacing |
| `panel.right.header.inventory-strip` | `ui/panel/right-panel-inventory-title-strip.webp` | Inventory header strip | 768x96 | yes | Empty center for code-rendered title |
| `panel.inventory.summary.card` | `ui/panel/inventory-summary-card.webp` | Top capacity summary card | 640x128 | yes | Stored / cap summary only, no text baked in |
| `panel.inventory.resource.row.idle` | `ui/panel/inventory-resource-row-idle.webp` | Resource row container | 640x88 | yes | Space for icon, label, value, controls |
| `panel.inventory.resource.row.selected` | `ui/panel/inventory-resource-row-selected.webp` | Selected resource row | 640x88 | yes | Stronger glow / border emphasis |
| `panel.inventory.resource.row.warning` | `ui/panel/inventory-resource-row-warning.webp` | Near-cap warning row | 640x88 | yes | Warm warning treatment, no text |
| `panel.inventory.resource.icon.slot` | `ui/panel/inventory-resource-icon-slot.webp` | Left icon slot for resource rows | 72x72 | yes | Icon only, no baked resource symbol |
| `panel.inventory.control.minus.idle` | `ui/button/inventory-minus-idle.webp` | Decrease capacity control | 48x48 | yes | Compact square button |
| `panel.inventory.control.minus.disabled` | `ui/button/inventory-minus-disabled.webp` | Decrease capacity disabled state | 48x48 | yes | Same geometry as idle |
| `panel.inventory.control.plus.idle` | `ui/button/inventory-plus-idle.webp` | Increase capacity control | 48x48 | yes | Compact square button |
| `panel.inventory.control.plus.disabled` | `ui/button/inventory-plus-disabled.webp` | Increase capacity disabled state | 48x48 | yes | Same geometry as idle |
| `panel.inventory.control.select.idle` | `ui/button/inventory-select-idle.webp` | Resource focus control | 48x48 | yes | Right-arrow / next-state chrome |
| `panel.inventory.item.card.idle` | `ui/panel/inventory-item-card-idle.webp` | Special item slot | 128x128 | yes | Used for the item grid |
| `panel.inventory.item.card.count.badge` | `ui/status/inventory-item-count-badge.webp` | Count shell for item amount | 96x64 | yes | Amount rendered in code |
| `panel.inventory.action.button.idle` | `ui/button/inventory-manage-button-idle.webp` | Main storage management action | 640x88 | yes | Green CTA shell |
| `panel.inventory.action.button.disabled` | `ui/button/inventory-manage-button-disabled.webp` | Disabled storage management action | 640x88 | yes | Muted locked variant |

## Screen 5 - Council and recommendations (Совет и исследования)

| Asset key | Suggested file name | Purpose | Size | Alpha | Notes |
|---|---|---|---|---|---|
| `panel.right.shell.council` | `ui/panel/right-panel-council-shell.webp` | Council panel frame | 768x1360 | yes | Same shell family as inventory/building |
| `panel.right.header.council-icon-slot` | `ui/panel/right-panel-council-icon-slot.webp` | Header icon frame | 128x128 | yes | Holds council/research emblem |
| `panel.council.recommendation.card.idle` | `ui/panel/council-recommendation-card-idle.webp` | Recommendation row card | 640x128 | yes | Advisor portrait, icon, copy, CTA |
| `panel.council.recommendation.card.hovered` | `ui/panel/council-recommendation-card-hovered.webp` | Hovered recommendation row | 640x128 | yes | Desktop hover emphasis only |
| `panel.council.advisor.portrait.slot` | `ui/panel/council-advisor-portrait-slot.webp` | Advisor portrait frame | 96x96 | yes | Portrait art only, no text |
| `panel.council.recommendation.icon.slot` | `ui/panel/council-recommendation-icon-slot.webp` | Small recommendation icon frame | 72x72 | yes | Building/resource symbol slot |
| `panel.council.follow.button.idle` | `ui/button/council-follow-button-idle.webp` | Recommendation CTA | 240x56 | yes | Green action button |
| `panel.council.follow.button.disabled` | `ui/button/council-follow-button-disabled.webp` | Disabled CTA state | 240x56 | yes | Same geometry as idle |
| `panel.council.stage.card` | `ui/panel/council-stage-card.webp` | Settlement stage summary card | 640x260 | yes | Stage title, progress, description |
| `panel.council.stage.badge` | `ui/panel/council-stage-badge.webp` | Stage shield icon shell | 96x96 | yes | Code renders shield/emblem art |
| `panel.council.priority.row.idle` | `ui/panel/council-priority-row-idle.webp` | Build-priority row | 640x72 | yes | Title, priority tag, trend marker |
| `panel.council.priority.row.active` | `ui/panel/council-priority-row-active.webp` | Active build-priority row | 640x72 | yes | Gold emphasis for selected priority |
| `panel.council.open-research.button.idle` | `ui/button/council-open-research-button-idle.webp` | Navigate to research tree | 640x88 | yes | Green CTA shell |
| `panel.council.open-research.button.disabled` | `ui/button/council-open-research-button-disabled.webp` | Disabled research CTA | 640x88 | yes | Muted locked variant |

## Screen 6 - Construction catalog and placement (Строительство)

| Asset key | Suggested file name | Purpose | Size | Alpha | Notes |
|---|---|---|---|---|---|
| `panel.right.shell.construction` | `ui/panel/right-panel-construction-shell.webp` | Construction catalog panel frame | 768x1360 | yes | Same family as detail panels, tuned for 3x3 catalog grid |
| `panel.right.header.construction-strip` | `ui/panel/right-panel-construction-title-strip.webp` | Construction header title backing | 768x96 | yes | Empty center, title rendered in code |
| `panel.construction.category.production.idle` | `ui/panel/construction-category-production-idle.webp` | Production category tab | 192x112 | yes | No text; icon and label rendered in code |
| `panel.construction.category.production.active` | `ui/panel/construction-category-production-active.webp` | Active production category tab | 192x112 | yes | Gold glow / selected state |
| `panel.construction.category.storage.idle` | `ui/panel/construction-category-storage-idle.webp` | Storage category tab | 192x112 | yes | Same geometry as production |
| `panel.construction.category.storage.active` | `ui/panel/construction-category-storage-active.webp` | Active storage category tab | 192x112 | yes | Same active treatment |
| `panel.construction.category.decor.idle` | `ui/panel/construction-category-decor-idle.webp` | Decor category tab | 192x112 | yes | Same geometry as production |
| `panel.construction.category.decor.active` | `ui/panel/construction-category-decor-active.webp` | Active decor category tab | 192x112 | yes | Same active treatment |
| `panel.construction.category.special.idle` | `ui/panel/construction-category-special-idle.webp` | Special category tab | 192x112 | yes | Same geometry as production |
| `panel.construction.category.special.active` | `ui/panel/construction-category-special-active.webp` | Active special category tab | 192x112 | yes | Same active treatment |
| `panel.construction.card.idle` | `ui/panel/construction-card-idle.webp` | Building choice card | 224x256 | yes | 9-slice, title/costs rendered in code |
| `panel.construction.card.selected` | `ui/panel/construction-card-selected.webp` | Selected building card | 224x256 | yes | Green/gold emphasis for current placement ghost |
| `panel.construction.card.locked` | `ui/panel/construction-card-locked.webp` | Unaffordable/locked building card | 224x256 | yes | Muted variant, no lock text baked in |
| `panel.construction.card.art-glow` | `ui/panel/construction-card-art-glow.webp` | Glow behind building preview art | 192x128 | yes | Decorative only, reusable across card art |
| `panel.construction.cost-row` | `ui/panel/construction-cost-row.webp` | Cost strip inside card | 192x40 | yes | Resource icons and numbers remain code-rendered |
| `panel.construction.pager.button.idle` | `ui/button/construction-pager-idle.webp` | Round previous/next button | 64x64 | yes | Arrow glyph may be rendered by code if not decorative |
| `panel.construction.pager.button.disabled` | `ui/button/construction-pager-disabled.webp` | Disabled pager button | 64x64 | yes | Same geometry as idle |
| `panel.construction.page-indicator` | `ui/status/construction-page-indicator.webp` | Page count backing | 128x64 | yes | `1/2` text rendered in code |
| `panel.construction.placement.hint` | `ui/panel/construction-placement-hint.webp` | Placement instruction strip | 640x64 | yes | No text, icon slot only |
| `scene.construction.plot.ring.idle` | `ui/scene/construction-plot-ring-idle.webp` | Empty plot highlight on map | 384x192 | yes | Additive green glow, no text |
| `scene.construction.plot.ring.selected` | `ui/scene/construction-plot-ring-selected.webp` | Selected plot highlight | 384x192 | yes | Stronger pulse-ready alpha edge |
| `scene.construction.ghost.overlay` | `ui/scene/construction-building-ghost-overlay.webp` | Green translucent ghost treatment mask | 512x512 | yes | Applied over code-selected building art; no baked building |
| `scene.construction.confirm.button.idle` | `ui/button/construction-confirm-idle.webp` | Green confirm button over map ghost | 96x96 | yes | Checkmark can be code-rendered or decorative glyph |
| `scene.construction.confirm.button.pressed` | `ui/button/construction-confirm-pressed.webp` | Pressed confirm state | 96x96 | yes | Same hit target geometry |
| `scene.construction.confirm.button.disabled` | `ui/button/construction-confirm-disabled.webp` | Disabled confirm state | 96x96 | yes | For unaffordable/invalid placement |
| `toast.construction.confirm` | `ui/toast/construction-confirm-toast.webp` | Placement confirmation notice | 640x112 | yes | Message text rendered in code |

## Screen 7 - Research tree (Исследования)

| Asset key | Suggested file name | Purpose | Size | Alpha | Notes |
|---|---|---|---|---|---|
| `panel.right.shell.research` | `ui/panel/right-panel-research-shell.webp` | Research tree panel frame | 960x1360 | yes | Wider shell than construction/detail panels; empty center, no text |
| `panel.right.header.research-strip` | `ui/panel/right-panel-research-title-strip.webp` | Research header backing | 960x104 | yes | Centered title rendered in code, close button stays separate |
| `panel.research.intro.strip` | `ui/panel/research-intro-strip.webp` | Intro text strip | 832x72 | yes | No text; supports two code-rendered lines |
| `panel.research.category.farming.idle` | `ui/tabs/research-category-farming-idle.webp` | Farming category tab | 288x80 | yes | No text; label rendered in code |
| `panel.research.category.farming.active` | `ui/tabs/research-category-farming-active.webp` | Active farming category tab | 288x80 | yes | Green/gold active treatment |
| `panel.research.category.trade.idle` | `ui/tabs/research-category-trade-idle.webp` | Trade category tab | 288x80 | yes | Same geometry as farming |
| `panel.research.category.trade.active` | `ui/tabs/research-category-trade-active.webp` | Active trade category tab | 288x80 | yes | Same active treatment |
| `panel.research.category.culture.idle` | `ui/tabs/research-category-culture-idle.webp` | Culture category tab | 288x80 | yes | Same geometry as farming |
| `panel.research.category.culture.active` | `ui/tabs/research-category-culture-active.webp` | Active culture category tab | 288x80 | yes | Same active treatment |
| `panel.research.node.complete` | `ui/panel/research-node-complete.webp` | Completed/ready tech node card | 256x168 | yes | 9-slice, title/level rendered in code |
| `panel.research.node.available` | `ui/panel/research-node-available.webp` | Available selectable tech node card | 256x168 | yes | Gold highlight compatible with selected state |
| `panel.research.node.selected` | `ui/panel/research-node-selected.webp` | Selected available tech node card | 256x168 | yes | Stronger glow for current detail card |
| `panel.research.node.researching` | `ui/panel/research-node-researching.webp` | In-progress tech node card | 256x168 | yes | Blue/cyan timer emphasis, no text |
| `panel.research.node.locked` | `ui/panel/research-node-locked.webp` | Locked tech node card | 256x168 | yes | Muted/dark variant; lock glyph can be separate |
| `panel.research.node.icon-slot` | `ui/panel/research-node-icon-slot.webp` | Icon holder in each tech node | 96x96 | yes | No resource/tech icon baked in |
| `panel.research.node.check-badge` | `ui/status/research-node-check-badge.webp` | Complete check shell | 64x64 | yes | Check glyph may be decorative; no dynamic text |
| `panel.research.node.lock-badge` | `ui/status/research-node-lock-badge.webp` | Locked node badge | 64x64 | yes | Lock chrome only, no requirement text |
| `panel.research.node.progress.frame` | `ui/status/research-node-progress-frame.webp` | Small node progress bar frame | 160x32 | yes | Progress numbers/icon rendered in code |
| `panel.research.node.progress.fill` | `ui/status/research-node-progress-fill.webp` | Small node progress fill | 160x20 | yes | Stretchable green/gold fill |
| `panel.research.connector.horizontal` | `ui/panel/research-connector-horizontal.webp` | Horizontal connector arrow | 96x24 | yes | No text; reusable between nodes |
| `panel.research.connector.vertical` | `ui/panel/research-connector-vertical.webp` | Vertical dashed connector | 24x96 | yes | No text; alpha edge, reusable |
| `panel.research.connector.arrowhead` | `ui/panel/research-connector-arrowhead.webp` | Connector arrowhead | 32x32 | yes | Optional if CSS arrows are replaced by assets |
| `panel.research.detail.card` | `ui/panel/research-detail-card.webp` | Selected technology detail card | 832x176 | yes | Two-column description/effects layout, no text |
| `panel.research.detail.divider` | `ui/panel/research-detail-divider.webp` | Detail card vertical divider | 16x152 | yes | Decorative separator only |
| `panel.research.cost.row` | `ui/panel/research-cost-row.webp` | Cost/resource strip | 384x72 | yes | Resource icons and values rendered in code |
| `panel.research.cost.item.ok` | `ui/status/research-cost-item-ok.webp` | Affordable cost item backing | 128x48 | yes | Shared for wood/stone/culture |
| `panel.research.cost.item.need` | `ui/status/research-cost-item-need.webp` | Missing-resource cost item backing | 128x48 | yes | Warning tint, no number baked in |
| `panel.research.study.button.idle` | `ui/button/research-study-button-idle.webp` | Study CTA button | 360x88 | yes | Green active button, text/timer rendered in code |
| `panel.research.study.button.pressed` | `ui/button/research-study-button-pressed.webp` | Pressed study CTA | 360x88 | yes | Same geometry as idle |
| `panel.research.study.button.disabled` | `ui/button/research-study-button-disabled.webp` | Disabled/locked study CTA | 360x88 | yes | Muted variant |
| `panel.research.timer.icon` | `ui/status/research-timer-hourglass.webp` | Hourglass icon for study timer | 48x48 | yes | Decorative icon only, timer text rendered in code |
| `toast.research.started` | `ui/toast/research-started-toast.webp` | Study started notification | 640x112 | yes | Message text rendered in code |
| `toast.research.complete` | `ui/toast/research-complete-toast.webp` | Study completion notification | 640x112 | yes | Message text rendered in code |

## Screen 8 - World map and expeditions (Карта мира)

| Asset key | Suggested file name | Purpose | Size | Alpha | Notes |
|---|---|---|---|---|---|
| `panel.right.shell.world-map` | `ui/panel/right-panel-world-map-shell.webp` | World map right panel frame | 768x1360 | yes | Same ornate family as research/construction, tuned for map plus scroll list |
| `panel.right.header.world-map-strip` | `ui/panel/right-panel-world-map-title-strip.webp` | Header title backing | 768x104 | yes | Center title rendered in code; no baked text |
| `panel.world-map.parchment.frame` | `ui/panel/world-map-parchment-frame.webp` | Framed parchment mini-map container | 672x312 | yes | 9-slice frame, no route labels baked in |
| `panel.world-map.parchment.base` | `ui/map/world-map-archipelago-base.webp` | Decorative archipelago map base | 1024x512 | no | No text; islands/water/terrain only, markers rendered separately |
| `panel.world-map.compass` | `ui/map/world-map-compass.webp` | Compass rose decoration | 96x96 | yes | Decorative only, no letters |
| `panel.world-map.marker.home` | `ui/map/world-map-marker-home.webp` | Home/settlement marker | 64x64 | yes | Icon-only marker, no label |
| `panel.world-map.marker.available` | `ui/map/world-map-marker-available.webp` | Available expedition marker shell | 64x64 | yes | 44px CSS hit target; inner icon rendered or slotted |
| `panel.world-map.marker.selected` | `ui/map/world-map-marker-selected.webp` | Selected expedition marker shell | 64x64 | yes | Strong gold glow, no text |
| `panel.world-map.marker.locked` | `ui/map/world-map-marker-locked.webp` | Locked expedition marker shell | 64x64 | yes | Lock treatment, muted state, no requirement text |
| `panel.world-map.filter.button.idle` | `ui/tabs/world-map-filter-idle.webp` | Icon filter button idle | 96x72 | yes | Icon-only, code supplies aria/title |
| `panel.world-map.filter.button.active` | `ui/tabs/world-map-filter-active.webp` | Icon filter button active | 96x72 | yes | Green/gold selected state |
| `panel.world-map.filter.button.disabled` | `ui/tabs/world-map-filter-disabled.webp` | Icon filter button disabled | 96x72 | yes | For future unavailable categories |
| `panel.world-map.expedition.card.idle` | `ui/panel/world-expedition-card-idle.webp` | Expedition row/card container | 672x144 | yes | 9-slice; title/description/rewards rendered in code |
| `panel.world-map.expedition.card.selected` | `ui/panel/world-expedition-card-selected.webp` | Selected expedition row/card | 672x144 | yes | Gold edge/glow, same geometry |
| `panel.world-map.expedition.card.active` | `ui/panel/world-expedition-card-active.webp` | In-progress expedition row/card | 672x144 | yes | Blue/cyan active timer emphasis |
| `panel.world-map.expedition.card.locked` | `ui/panel/world-expedition-card-locked.webp` | Locked expedition row/card | 672x96 | yes | Muted compact row, no baked lock text |
| `panel.world-map.expedition.thumbnail.forest` | `ui/map/expedition-thumb-ancient-forest.webp` | Ancient forest thumbnail | 128x96 | no | Image-only scene crop, no text |
| `panel.world-map.expedition.thumbnail.ruins` | `ui/map/expedition-thumb-drowned-ruins.webp` | Drowned ruins thumbnail | 128x96 | no | Image-only scene crop, no text |
| `panel.world-map.expedition.thumbnail.volcano` | `ui/map/expedition-thumb-volcanic-mountains.webp` | Volcanic mountains thumbnail | 128x96 | no | Image-only scene crop, no text |
| `panel.world-map.expedition.thumbnail.ice` | `ui/map/expedition-thumb-ice-wastes.webp` | Locked ice wastes thumbnail | 128x96 | no | Image-only scene crop, muted variant allowed |
| `panel.world-map.difficulty.easy` | `ui/status/world-difficulty-easy.webp` | Easy difficulty badge shell | 128x40 | yes | Text rendered in code |
| `panel.world-map.difficulty.medium` | `ui/status/world-difficulty-medium.webp` | Medium difficulty badge shell | 128x40 | yes | Text rendered in code |
| `panel.world-map.difficulty.hard` | `ui/status/world-difficulty-hard.webp` | Hard difficulty badge shell | 128x40 | yes | Text rendered in code |
| `panel.world-map.difficulty.locked` | `ui/status/world-difficulty-locked.webp` | Locked difficulty badge shell | 128x40 | yes | Text rendered in code |
| `panel.world-map.reward-chip` | `ui/status/world-expedition-reward-chip.webp` | Reward item backing | 96x44 | yes | Resource icon/number rendered in code |
| `panel.world-map.send.button.idle` | `ui/button/world-expedition-send-idle.webp` | Send expedition CTA | 288x72 | yes | Green button shell, text/timer rendered in code |
| `panel.world-map.send.button.pressed` | `ui/button/world-expedition-send-pressed.webp` | Pressed send CTA | 288x72 | yes | Same geometry as idle |
| `panel.world-map.send.button.disabled` | `ui/button/world-expedition-send-disabled.webp` | Disabled/busy send CTA | 288x72 | yes | Muted state for busy/locked routes |
| `panel.world-map.timer.icon` | `ui/status/world-expedition-hourglass.webp` | Expedition timer icon | 48x48 | yes | Decorative icon only, timer text rendered in code |
| `toast.world-map.started` | `ui/toast/world-expedition-started-toast.webp` | Expedition started notification | 640x112 | yes | Message text rendered in code |
| `toast.world-map.complete` | `ui/toast/world-expedition-complete-toast.webp` | Expedition completed notification | 640x112 | yes | Reward text rendered in code |
| `hud.bottomnav.button.world.active` | `ui/hud/bottom-nav-button-world-active.webp` | Active bottom dock world-map slot | 192x192 | yes | Globe icon slot, badge remains code-rendered |
| `hud.bottomnav.button.world.idle` | `ui/hud/bottom-nav-button-world-idle.webp` | Idle bottom dock world-map slot | 192x192 | yes | Shared geometry with other dock buttons |

## Shared gameplay art already referenced by code

- Building art remains data-driven through `buildingAsset(...)`.
- Resource icons remain code-driven via `ICONS`.
- Progress fill logic remains code-driven; asset frames only.
- Construction catalog preview art currently reuses `buildingAsset(...)`; final bespoke card renders should stay text-free and match the same transparent-cutout contract.
- Research tree icons currently reuse `ICONS`; final bespoke research icons should remain text-free and slot into the same code-rendered node labels.
- World map mini-map, markers, expedition thumbnails, filter buttons, difficulty badges, reward chips, and send/timer CTA are currently CSS/code-rendered placeholders; final assets should stay text-free and preserve the 44px touch-target contract.

## Later screens

- Add entries here per screen as each mockup is implemented.
- Keep the list additive; do not rewrite previous screen entries unless the rendered contract changes.
