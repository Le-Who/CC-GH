# CC-GH Game Asset Sheet Brief

Дата среза: 2026-05-02. Цель документа - дать подробное смысловое и техническое описание всех игровых поверхностей CC-GH, чтобы на его основе можно было генерировать полный список материалов для asset sheet, production art backlog или промпты для генерации графики.

## Как читать этот документ

`Активная вкладка` - то, что реально доступно из нижней навигации `src/App.jsx` через `src/app/gameChunks.jsx`.

`Runtime` - чем игра рисуется сейчас:

- `React/DOM` - сцена собрана обычной версткой, CSS и HTML-слоями.
- `Pixi` - сцена идет через `src/app/PixiScene.jsx`, `src/game-runtime/LazyPixiSceneHost.jsx` и builder из `src/game-runtime/scenes.js`.
- `Legacy/hidden` - код и API есть, но игра не зарегистрирована в текущих вкладках.

`Asset key` - стабильный ключ generated runtime manifest после `pnpm run assets:build` или ручной override key только там, где код реально читает `public/assets/manifest.json`.

## Общая архитектура игр и ассетов

### Вкладки и runtime

Текущая нижняя навигация содержит семь видимых игровых вкладок:

| Вкладка | Игровое название | Runtime | Главный компонент |
|---|---|---|---|
| `garden` | Garden Shelf | React/DOM | `src/games/garden-shelf/GardenShelfGame.tsx` |
| `blox` | Building Blox | Pixi | `src/games/blox/BloxGame.jsx` |
| `match3` | Gem Crush | Pixi | `src/games/match3/Match3Game.jsx` |
| `merge` | Gacha Merge / Alchemy Table | Pixi + DOM HUD | `src/games/merge/MergeGame.jsx` |
| `bubbo` | Bubbo Bubbo | Pixi | `src/games/bubbo/BubboGame.jsx` |
| `trivia` | Brain Blitz | React/DOM | `src/games/trivia/TriviaGame.jsx` |
| `room` | Cozy Yard | React/DOM | `src/games/companion-yard/CompanionYardGame.jsx` |

`farm` / Cozy Farm не виден в `TABS` и не загружается из `gameLoaders`, но его компонент, Pixi scene builder, API и shared state еще присутствуют. Его нужно учитывать в asset sheet как legacy/compatibility игру, особенно потому что harvested crops питают `merge.tap`.

### Shared shell

Все видимые игры живут внутри одного Telegram-first shell:

- `src/App.jsx` держит топбар, ресурсы, нижние вкладки, тему, язык Garden и realtime boot.
- `src/app/shell.jsx` дает `GameShell`, `GamePlayHud`, `PauseBrief`, `PanelButton`, `Stat`.
- `src/game-state/useGameHub.js` держит snapshot, `/api/player/mutate`, pending actions, realtime payloads и outbox для Yard.
- `src/app/gameChunks.jsx` лениво грузит игровые chunks; Pixi runtime прогревается только для `blox`, `match3`, `merge`, `bubbo`.

Для ассетов это значит: отдельные игры не должны требовать полноэкранных menu screen assets, если shell уже рисует паузы, кнопки и HUD. Asset sheet должен разделять `game art` и `shared shell art`.

### Runtime asset pipeline

Ручной manifest:

- `public/assets/manifest.json`
- Используется для ручных override путей там, где есть resolver: Cozy Yard (`graphics.games.companionYard`), Gacha Merge (`graphics.games.gachaMerge`) и audio (`audio.sfx`). Иконки/pets/legacy scene placeholders остаются в manifest как registry/source hints, но не все из них являются live overrides в текущих игровых resolver'ах.

Generated runtime manifest:

- `public/assets-runtime/manifest.json`
- Генерируется `pnpm run assets:build`.
- Текущий срез содержит 186 runtime assets.
- Текущие Pixi bundles: `pixi.bubbo` = 8 ключей, `pixi.match3` = 11 ключей, `pixi.merge` = 71 ключ.
- `pixi.merge` собирается из `public/games/gacha-merge/{backgrounds,ui,fx,items}` и должен оставаться lazy/deferred для startup, но активная Merge сцена force-load'ит свой bundle перед построением Pixi арта.

Pipeline config:

- `scripts/assets-pipeline.config.mjs`
- Bubbo и Match-3 имеют явные Pixi entries.
- Garden Shelf имеет WebP-only runtime entries.
- Cozy Yard собирает все PNG из `public/games/companion-yard/{backgrounds,foods,goodies,visitors,companions}` в WebP-only runtime entries.
- Gacha Merge собирает PNG/SVG из `public/games/gacha-merge/{backgrounds,ui,fx,items}` и кладет их в bundle `pixi.merge`.
- SVG из `public/pets` и `public/assets` идут как stable SVG runtime assets.

Resolver order by game:

- Cozy Yard: manual manifest override -> generated runtime asset -> `public/games/companion-yard/**` fallback.
- Gacha Merge: manual manifest override -> generated runtime asset -> procedural fallback.
- Bubbo, Gem Crush, Garden Shelf: generated runtime asset -> stable legacy `public/games/**` fallback. Manual manifest buckets for Garden/Bubbo/Match-3 do not override art unless a resolver is added.
- Building Blox, Brain Blitz, Cozy Farm: no dedicated generated production-art resolver in the visible runtime today; mostly procedural/DOM art.

Общий контракт для будущего asset sheet:

| Поле | Что писать |
|---|---|
| `game` | Garden Shelf, Cozy Yard, Gacha Merge, Building Blox, Gem Crush, Bubbo, Brain Blitz, Cozy Farm |
| `asset_key` | Runtime key или предлагаемый новый key |
| `runtime_path` | Ожидаемый путь в `public/games/...` или manual manifest path |
| `role` | background, board, item, character, visitor, FX, HUD, audio, icon |
| `state_variants` | idle, active, pressed, disabled, selected, worn, broken, mature, growing, burst, etc. |
| `technical_notes` | Размер/пропорции, прозрачность, safe area, pivot/anchor, slicing, bundle, fallback |
| `design_notes` | Смысл, настроение, что игрок должен понять по ассету |

## 1. Garden Shelf

### Смысл игры

Garden Shelf - idle terrarium / shelf garden. Игрок выращивает комнатные растения на полках, тапает их для роста или золота, поливает растущие растения, покупает новые растения, открывает дополнительные полки, прокачивает уровень сада и закрывает story/daily quests.

Основное ощущение: маленький уютный домашний сад, где прогресс читается через полки, горшки, стадии растения, мягкие награды, XP и ежедневные задания. Это не ферма с полями, а витринный shelf collector.

### Игровой цикл

1. Игрок видит полки и слоты растений.
2. Пустой слот открывает bottom panel с магазином и инвентарем.
3. Игрок покупает растение, если plant type уже unlocked и хватает shared gold.
4. Растение проходит фазы роста `0 -> 1 -> 2 -> 3`.
5. До зрелости тап ускоряет рост, вода дает отдельное ускорение.
6. Зрелое растение генерирует passive gold/passive XP и дает click reward по тапу.
7. Игрок апгрейдит растение, продает его, убирает в stash или перемещает на полку.
8. Garden XP открывает `garden.levelUp`; уровень дает разовую gold reward и открывает новые растения.
9. Story quests и daily quests добавляют направленные цели и разовые награды.

### Технический контракт

- Активная вкладка: `garden`.
- Component: `src/games/garden-shelf/GardenShelfGame.tsx`.
- UI: React + CSS, без Pixi.
- State provider: `src/games/garden-shelf/lib/GameContext.tsx`.
- Shared state: `snapshot.garden` плюс top-level `snapshot.resources.gold`.
- Server actions: `garden.goldDelta`, `garden.sync`, `garden.levelUp`.
- Quest logic: `game-logic/garden-quests.js`.
- Economy: `game-logic/garden-economy.js`, `game-logic/garden-shelf-plants.js`.
- Asset resolver: `src/games/garden-shelf/lib/sprites.ts`.
- Local language: Garden has own English/Russian i18n in `src/games/garden-shelf/lib/i18n.tsx`.

Important state fields:

- `garden.name` - synced garden name, with old localStorage fallback.
- `garden.level`, `garden.xp`, `garden.xpRequired`, `garden.levelReady`.
- `garden.shelvesUnlocked`.
- `garden.plants[]`: `id`, `type`, `level`, `shelfIndex`, `spotIndex`, `phase`, `phaseProgress`, `lastTapped`, `lastWatered`.
- `garden.claimedQuests`, `garden.dailyQuests`.
- `garden.passiveGoldBuffer`, `garden.passiveXpBuffer`, `garden.offlineEarnings`, `garden.offlineXp`.

Layout constants:

- `MAX_SHELVES = 5`.
- `SPOTS_PER_SHELF = 3`.
- `SHELF_UNLOCK_COSTS = [0, 1000, 8000, 45000, 220000]`.
- Growth phases: 3 timed phases plus mature phase.
- `PHASE_DURATIONS_MS = [120000, 480000, 1800000]`.
- Tap growth acceleration: `2000ms`.
- Growth tap cooldown: `500ms`.
- Mature reward tap cooldown: `750ms`.
- Water cooldown: `8 minutes`.
- Water growth acceleration ratio: `0.08`.
- Offline cap: `6h`; offline gold ratio `0.35`; offline XP ratio `0.25`.
- Display gold multiplier: `x100`, display-only.

Plant definitions:

| Plant id | Name | Unlock level | Sprite index | Base cost | Base production | Base click | Base XP |
|---|---|---:|---:|---:|---:|---:|---:|
| `daisy` | Daisy | 1 | 0 | 25 | 0.035 | 1 | 4 |
| `lavender` | Lavender | 4 | 1 | 90 | 0.08 | 2 | 6 |
| `basil` | Basil | 7 | 2 | 240 | 0.16 | 4 | 9 |
| `rosemary` | Rosemary | 10 | 3 | 650 | 0.32 | 7 | 13 |
| `monstera` | Monstera | 13 | 4 | 1600 | 0.62 | 12 | 18 |
| `succulent` | Succulent | 16 | 5 | 4200 | 1.1 | 20 | 25 |
| `pothos` | Pothos | 19 | 6 | 11000 | 1.9 | 32 | 34 |
| `strawberry` | Strawberry | 22 | 7 | 26000 | 3.2 | 50 | 45 |

Level unlock curve:

- Max level: `24`.
- Unlocks: level 1 `daisy`, level 4 `lavender`, level 7 `basil`, level 10 `rosemary`, level 13 `monstera`, level 16 `succulent`, level 19 `pothos`, level 22 `strawberry`.
- Level rewards start at 35 gold on level 1 and end at 9300 gold at level 24 definition.

Quest groups:

- Story quests: `first_plant`, `mature_plant`, `level_2`, `filled_shelf`, `second_shelf`.
- Daily quest count: 9 per day, grouped as 3 groups of 3.
- Daily quest template types: taps, waters, tend actions, gold earned, XP earned, plant bought, upgrade, placed plants, mature plants.
- Claimed IDs are sanitized and synced so quest rewards are one-time across devices.

### Current runtime assets

Current stable files:

- `public/games/garden-shelf/assets_transparent.png`
- `public/games/garden-shelf/assets_shelf.png`
- `public/games/garden-shelf/assets_garden_sign.png`
- `public/games/garden-shelf/assets_garden_cog.png`
- `public/games/garden-shelf/assets_garden_bottom_plank.png`
- `public/games/garden-shelf/plants_sheet.png`
- `public/games/garden-shelf/plants_sheet_clean.png`
- `public/games/garden-shelf/sprites.json`

Runtime keys:

- `gardenShelf.sheet.transparent`
- `gardenShelf.shelf`
- `gardenShelf.sign`
- `gardenShelf.bottomPlank`
- `gardenShelf.settingsCog`

Manual manifest placeholders exist in `public/assets/manifest.json`, but the current Garden resolver does not read them:

- `graphics.games.gardenShelf.sheet`
- `graphics.games.gardenShelf.shelf`
- `graphics.games.gardenShelf.sign`
- `graphics.games.gardenShelf.bottomPlank`
- `graphics.games.gardenShelf.settingsCog`

Use generated runtime files or update `resolveGardenAssetPaths` before relying on these as live overrides.

### Asset sheet materials needed

Must-have art:

- One transparent plant sprite sheet covering 8 plant types x 4 phases.
- Shelf/backplate art that supports 5 horizontal shelves and 3 slots per shelf.
- Empty-slot state, locked-slot/locked-shelf state, affordable/unaffordable state.
- Garden sign with editable text area.
- Bottom plank / lower HUD anchor.
- Settings cog.
- Water-ready indicator.
- Growth timer badge.
- Tap gold note, tap XP note, tap growth/time note.
- Level-up reward modal background and reward burst.
- Quest drawer/card styling: story, daily, locked, claimable, claimed.
- Shop card plant thumbnails and inventory thumbnails.

Optional polish:

- Per-plant pot variants.
- Mature idle loop, tap squish, water sparkle, upgrade/evolve burst.
- Empty shelf dust/glow.
- Stash/inventory crate icon.
- Offline earnings welcome illustration.

Technical constraints:

- Plant sheet must preserve transparent background and stable frame indexing.
- Current `getGardenSpriteStyle` reads `spriteData` from `src/games/garden-shelf/lib/sprites.ts`: full sheet `1672 x 941`, 32 explicit frame rectangles, 8 plant sprite indices x 4 phases. Do not replace with arbitrary cropped images unless resolver/frame data is changed.
- Shelf/sign/bottom plank are DOM `<img>` style assets, not Pixi textures.
- Generated runtime entries are WebP-only; source PNG can stay in `public/games/garden-shelf/`.

## 2. Cozy Yard

### Смысл игры

Cozy Yard - idle visitor collector and decoration yard. Игрок ставит еду, покупает и размещает goodies, ждет посетителей, смотрит как питомцы взаимодействуют с предметами, собирает подарки и mementos, ремонтирует изношенные goodies, меняет фон двора и настраивает домашнего companion.

Это замена старого Pet Room: вместо статичной комнаты - самостоятельная мобильная сцена с фонами, свободным размещением, visitor simulation, photo album и petbook.

### Игровой цикл

1. Игрок видит yard stage с текущим remodel background.
2. Игрок ставит food в bowls.
3. Игрок покупает/размещает goodies на playable area.
4. Server simulation по классическим часам создает visitor arrivals.
5. Visitor выбирает goodie activity и pose, двигается/сидит в сцене.
6. После ухода visitor дает gift: treats и шанс shinyTreats.
7. Petbook запоминает visits, любимые goodies и последнюю активность.
8. Album хранит captured photos.
9. Goodies изнашиваются (`new -> worn -> broken`) и требуют repair.
10. Игрок покупает remodel/expansion и настраивает companion.

### Технический контракт

- Активная вкладка: `room`.
- Component: `src/games/companion-yard/CompanionYardGame.jsx`.
- UI/runtime: React DOM layered scene, без Pixi.
- State: `snapshot.yard`.
- Catalog: `game-logic/yard-catalog.js`.
- Simulation/actions: `game-logic/yard.js`.
- Playzone clamps: `game-logic/yard-playzones.js`.
- Movement: `src/games/companion-yard/movement.js`.
- Asset resolver: `src/games/companion-yard/assets.js`.
- Styling: `src/games/companion-yard/companion-yard.css`.
- Durable action path: Yard actions use `useGameHub.enqueueYardAction`, outbox, entity-level pending visuals, `clientActionId`, and retry.

Yard action surface:

- `yard.buyFood`
- `yard.setFood`
- `yard.buyGoodie`
- `yard.placeGoodie`
- `yard.moveGoodie`
- `yard.pickupGoodie`
- `yard.fixGoodie`
- `yard.collectGifts`
- `yard.capturePhoto`
- `yard.favoritePhoto`
- `yard.setRemodel`
- `yard.buyExpansion`
- `yard.claimDailyLetter`
- `yard.configureCompanion`

Important state fields:

- `yard.remodel`
- `yard.ownedRemodels`
- `yard.expansion.level`
- `yard.currencies.treats`, `yard.currencies.shinyTreats`
- `yard.foodInventory`, `yard.goodieInventory`
- `yard.bowls[]`
- `yard.placedGoodies[]`: `slotId`, `goodieId`, `condition`, `uses`, `x`, `y`, `placedAt`
- `yard.activeVisitors[]`: `visitId`, `visitorId`, `goodieId`, `slotId`, `pose`, `activityId`, `entryEdge`, `motionSeed`, `arrivedAt`, `leavesAt`
- `yard.pendingGifts[]`
- `yard.petbook`
- `yard.album.photos`
- `yard.companion`

### Catalog content

Species:

- `cat`, `dog`, `bunny`, `fox`, `hamster`, `turtle`

Remodel backgrounds:

| Id | Name | Starter owned | Cost | Runtime fallback |
|---|---|---:|---|---|
| `meadow` | Morning Meadow | yes | 0 treats, 0 shiny | `public/games/companion-yard/backgrounds/meadow.png` |
| `moon_garden` | Moon Garden | yes | 900 treats, 6 shiny | `public/games/companion-yard/backgrounds/moon_garden.png` |
| `tea_house` | Tea House | no | 720 treats | `public/games/companion-yard/backgrounds/tea_house.png` |

Foods:

| Id | Name | Cost | Servings | Tags | Runtime fallback |
|---|---|---|---:|---|---|
| `empty_bowl` | Empty bowl visual | no catalog purchase | n/a | n/a | `public/games/companion-yard/foods/empty_bowl.png` |
| `kibble` | Garden Kibble | 0 treats | 4 | `simple`, `day` | `public/games/companion-yard/foods/kibble.png` |
| `berry_plate` | Berry Plate | 120 treats | 5 | `sweet`, `fresh` | `public/games/companion-yard/foods/berry_plate.png` |
| `bonito_bowl` | Bonito Bowl | 2 shiny | 6 | `premium`, `night` | `public/games/companion-yard/foods/bonito_bowl.png` |

Goodies:

| Id | Name | Size | Capacity | Cost | Tags | Surface/blocking | Required variants |
|---|---|---|---:|---|---|---|---|
| `yarn_mouse` | Yarn Mouse | small | 1 | 0 | toy, play | blocking default | base, worn, broken |
| `sun_cushion` | Sun Cushion | small | 1 | 0 | nap, warm | layable, non-blocking | base, worn, broken |
| `cardboard_cottage` | Cardboard Cottage | large | 2 | 260 treats | hideout, cozy | blocking default | base, worn, broken |
| `fountain_bowl` | Fountain Bowl | large | 2 | 420 treats | water, calm | blocking default | base, worn, broken |
| `cozy_chair` | Cozy Chair | large | 1 | 180 treats | nap, tall | layable, non-blocking | base, worn, broken |
| `snack_table` | Snack Table | small | 1 | 160 treats | food, curious | blocking default | base, worn, broken |
| `leaf_pot` | Leaf Pot | small | 1 | 140 treats | fresh, curious | blocking default | base, worn, broken |
| `moss_rug` | Moss Rug | large | 2 | 220 treats | nap, fresh | layable, non-blocking | base, worn, broken |
| `cloud_bed` | Cloud Bed | large | 2 | 5 shiny | nap, premium | layable, non-blocking | base, worn, broken |
| `moon_lamp` | Moon Lamp | small | 1 | 360 treats, 3 shiny | night, warm | blocking default | base, worn, broken |
| `book_nook` | Book Nook | large | 2 | 340 treats | quiet, curious | blocking default | base, worn, broken |

Visitor roster:

| Id | Name | Species | Rarity | Poses | Special requirement |
|---|---|---|---|---|---|
| `mika_cat` | Mika | cat | common | `pounce`, `sit`, `nap` | none |
| `pebble_pup` | Pebble | dog | common | `sniff`, `roll`, `sit` | none |
| `mochi_bunny` | Mochi | bunny | common | `nap`, `nibble`, `stretch` | none |
| `pip_hamster` | Pip | hamster | uncommon | `nibble`, `peek`, `sit` | none |
| `willow_fox` | Willow | fox | uncommon | `listen`, `curl`, `peek` | none |
| `basil_turtle` | Basil | turtle | uncommon | `soak`, `watch`, `rest` | none |
| `starlit_fox` | Starlit | fox | rare | `glow`, `curl`, `watch` | `moon_lamp` + `bonito_bowl` |
| `sage_turtle` | Sage | turtle | rare | `soak`, `rest`, `watch` | `fountain_bowl` + `berry_plate` |

Companion species/assets:

- `dog`
- `cat`
- `bunny`
- `fox`
- `hamster`
- `turtle`

### Current runtime assets

Runtime folders:

- `public/games/companion-yard/backgrounds/`
- `public/games/companion-yard/companions/`
- `public/games/companion-yard/foods/`
- `public/games/companion-yard/goodies/`
- `public/games/companion-yard/visitors/`
- `public/games/companion-yard/HUD.png` direct CSS sprite, not generated runtime manifest today.
- `public/games/companion-yard/HUD.svg` editable/source reference for the HUD sprite.

Runtime generated key pattern:

- `companionYard.backgrounds.<id>`
- `companionYard.foods.<id>`
- `companionYard.goodies.<id>`
- `companionYard.visitors.<id>`
- `companionYard.companions.<id>`

Manual manifest bucket:

- `graphics.games.companionYard.backgrounds.<id>`
- `graphics.games.companionYard.foods.<id>`
- `graphics.games.companionYard.goodies`
- `graphics.games.companionYard.visitors`
- `graphics.games.companionYard.companions`

Source art references:

- `assets-source/games/companion-yard/source-sheets/`
- `assets-source/games/companion-yard/source-svg/`

### Asset sheet materials needed

Must-have art:

- 3 full yard backgrounds: Morning Meadow, Moon Garden, Tea House.
- Each background needs safe playable lower/middle area that matches `yard-playzones`.
- 4 food/bowl states: empty bowl, kibble, berry plate, bonito bowl.
- 11 goodies x 3 condition variants: base, worn, broken.
- 8 visitors x base preview plus pose files.
- 6 companion species.
- HUD atlas/icons for food, goodies, shop, petbook, album, gifts, repair, remodel, expansion, daily, settings, sound, close, confirm, placement.
- Gift/memento art: treats, shiny treats, photo card, visitor badge.
- Pending/sync visual overlay that can sit on an entity.

Visitor pose file convention:

- Base preview: `<visitor_id>.png`
- Pose-specific: `<visitor_id>_<pose>.png`
- Examples: `mika_cat_pounce.png`, `sage_turtle_soak.png`, `starlit_fox_glow.png`.

Goodie condition file convention:

- Base: `<goodie_id>.png`
- Worn: `<goodie_id>_worn.png`
- Broken: `<goodie_id>_broken.png`

Technical constraints:

- Goodies and visitors need transparent PNG with consistent feet/base anchors.
- Visitor pose art must work both in front and behind a goodie because activity `layer` can be `front` or `back`.
- Layable goodies (`sun_cushion`, `cozy_chair`, `moss_rug`, `cloud_bed`) must visually support visitors sitting/lying on top.
- Non-layable goodies are movement blockers; silhouettes should read as obstacles.
- Backgrounds must leave UI-safe zones for HUD buttons and lower controls.
- Generated runtime currently emits compact WebP-only Yard assets, so source PNG/SVG can be high quality but runtime should remain compact.
- The HUD atlas is sliced by CSS background positions in `companion-yard.css`; keep a 5x5 layout or update the CSS positions together.

## 3. Gacha Merge / Alchemy Table

### Смысл игры

Gacha Merge is now framed as an Alchemy Table. Игрок добывает материалы из generator taps, gacha tokens или daily free drop, затем объединяет пары предметов на 7x9 table board. Обычные цепочки дают base materials, а специальные recipe combinations создают Alchemy items. Crafting gives Essence; Essence converts into Cozy Yard rewards through Exchange.

Главная фантазия: настольная алхимия, где материалы превращаются в рецепты, библиотека открытий заполняется, а результат связан с другими системами проекта.

### Игровой цикл

1. Board содержит 7 строк x 9 колонок.
2. Игрок выбирает fuel source: harvested crop или free tap.
3. Wild generator spawns random material chain items.
4. Gacha pull за tokens или daily drop добавляет случайный L0 item.
5. Игрок drag/tap merges одинаковые chain+level пары или valid recipe pairs.
6. Merge upgrades item, unlocks generator chain, remembers discovered item/recipe.
7. Merge gives `alchemyEssence`, boosted when recipe is newly discovered.
8. Essence can be exchanged for Yard treats/shiny treats.
9. Library/Items/Exchange drawers доступны прямо в сцене.

### Технический контракт

- Активная вкладка: `merge`.
- Component: `src/games/merge/MergeGame.jsx`.
- Scene builder: `buildMergeScene` in `src/game-runtime/scenes.js`.
- State/config: `game-logic/merge-config.js`, `game-logic/merge-board-utils.js`.
- Server authority: `routes/player.js` action cases plus legacy `routes/mergeRoutes.js`.
- Board: `BOARD_ROWS = 7`, `BOARD_COLS = 9`.
- Main state: `snapshot.merge`.
- Uses Farm harvested crops as generator fuel if no free taps are banked.
- Can reward Cozy Yard goodies through `yardDrop` on some merge/gacha paths.

Important state fields:

- `merge.board`
- `merge.generators`
- `merge.generatorState`
- `merge.alchemyEssence`
- `merge.exchangeClaims`
- `merge.discoveredItems`
- `merge.discoveredRecipes`
- `merge.lastFreePull`
- `merge.lastFreeTaps`
- `merge.freeTapCharges`

Action surface:

- `merge.tap`
- `merge.merge`
- `merge.gacha`
- `merge.freePull`
- `merge.claimFreeTaps`
- `merge.exchange`
- `merge.trash`

Economy/runtime constants:

- Start generator chain: `flora`.
- Wild generator id: `wild`.
- Generator tap limit: `40`.
- Generator cooldown: `4h`.
- Gacha pull cost: `10` tokens.
- Free taps recharge every `20 minutes` and bank up to `30`.
- Daily drop: one free random material once per UTC day.

Merge chains:

| Chain | Type | Items |
|---|---|---|
| `flora` | generator chain | `seed`, `sprout`, `herb`, `blossom`, `vine`, `grove`, `lifebloom`, `world_tree` |
| `earth` | generator chain | `dust`, `clay`, `sand`, `stone`, `ore`, `crystal`, `geode`, `monolith` |
| `water` | generator chain | `dew`, `droplet`, `stream`, `spring`, `pond`, `tide`, `rainstone`, `ocean_heart` |
| `fire` | generator chain | `ember`, `flame`, `coal`, `kiln`, `forge`, `sunshard`, `phoenix_ash`, `solar_core` |
| `air` | generator chain | `breeze`, `cloud`, `spark`, `bolt`, `lightning`, `storm_cell`, `aurora`, `tempest_crown` |
| `alchemy` | recipe-only chain | `mud`, `brick`, `glass`, `vial`, `elixir`, `lens`, `astrolabe`, `philosopher_stone` |

Recipe list:

| Recipe id | Name | Ingredients | Result |
|---|---|---|---|
| `seed_dew_sprout` | Germination | `seed` + `dew` | `flora:1 sprout` |
| `seed_mud_sprout` | Seedbed | `seed` + `mud` | `flora:1 sprout` |
| `dew_dust_mud` | Soft Earth | `dew` + `dust` | `alchemy:0 mud` |
| `clay_ember_brick` | Fired Clay | `clay` + `ember` | `alchemy:1 brick` |
| `mud_ember_brick` | Baked Mud | `mud` + `ember` | `alchemy:1 brick` |
| `sand_flame_glass` | Glassmaking | `sand` + `flame` | `alchemy:2 glass` |
| `sand_ember_glass` | Patient Glass | `sand` + `ember` | `alchemy:2 glass` |
| `glass_droplet_vial` | Vessel | `glass` + `droplet` | `alchemy:3 vial` |
| `glass_dew_vial` | Fine Vessel | `glass` + `dew` | `alchemy:3 vial` |
| `vial_herb_elixir` | Infusion | `vial` + `herb` | `alchemy:4 elixir` |
| `vial_blossom_elixir` | Bloom Infusion | `vial` + `blossom` | `alchemy:4 elixir` |
| `glass_spark_lens` | Focused Light | `glass` + `spark` | `alchemy:5 lens` |
| `lens_cloud_astrolabe` | Sky Reading | `lens` + `cloud` | `alchemy:6 astrolabe` |
| `crystal_elixir_philosopher_stone` | Great Work | `crystal` + `elixir` | `alchemy:7 philosopher_stone` |
| `geode_astrolabe_philosopher_stone` | Star Map | `geode` + `astrolabe` | `alchemy:7 philosopher_stone` |
| `breeze_droplet_cloud` | Condensation | `breeze` + `droplet` | `air:1 cloud` |
| `breeze_dew_cloud` | Morning Cloud | `breeze` + `dew` | `air:1 cloud` |
| `cloud_ember_spark` | Static Lift | `cloud` + `ember` | `air:2 spark` |
| `cloud_spark_bolt` | Charge | `cloud` + `spark` | `air:3 bolt` |
| `ore_coal_forge` | Smelting | `ore` + `coal` | `fire:4 forge` |
| `forge_crystal_sunshard` | Prism Forge | `forge` + `crystal` | `fire:5 sunshard` |
| `sunshard_tide_rainstone` | Sun Shower | `sunshard` + `tide` | `water:6 rainstone` |
| `rainstone_storm_cell_aurora` | Aurora Weather | `rainstone` + `storm_cell` | `air:6 aurora` |

Exchange offers:

| Offer id | Cost | Reward | Status |
|---|---:|---|---|
| `yard_treats_small` | 50 Essence | 120 Yard treats | active |
| `yard_shiny_treat` | 120 Essence | 1 shiny treat | active |
| `future_game_slot` | 0 | reserved | locked |

### Current runtime assets

Current art state:

- `public/games/gacha-merge/` contains the checked-in Alchemy Table starter package: 1 table background, 20 UI assets, 2 FX assets, and 48 item icons.
- Generated runtime output maps those files into `pixi.merge` and currently covers `gachaMerge.background.table`, board/cell UI states, custom HUD/action icons, library/exchange/action surfaces, essence/recipe FX, and the live item ids.
- Missing or manually unset slots still fall back to procedural table/cells, colored item circles, emoji/text labels, generated sparkles, generated recipe glow, and generated Essence labels.

Manual manifest slots already exist:

- `graphics.games.gachaMerge.background.table`
- `graphics.games.gachaMerge.ui.libraryRail`
- `graphics.games.gachaMerge.ui.libraryPanel`
- `graphics.games.gachaMerge.ui.exchangePanel`
- `graphics.games.gachaMerge.ui.actionDock`
- `graphics.games.gachaMerge.ui.hudBar`
- `graphics.games.gachaMerge.ui.hudIconItems`
- `graphics.games.gachaMerge.ui.hudIconRecipes`
- `graphics.games.gachaMerge.ui.hudIconExchange`
- `graphics.games.gachaMerge.ui.hudIconEssence`
- `graphics.games.gachaMerge.ui.hudIconMode`
- `graphics.games.gachaMerge.ui.hudIconPause`
- `graphics.games.gachaMerge.ui.actionIconGenerate`
- `graphics.games.gachaMerge.ui.actionIconDaily`
- `graphics.games.gachaMerge.ui.actionIconTokens`
- `graphics.games.gachaMerge.ui.actionIconTrash`
- `graphics.games.gachaMerge.ui.boardFrame`
- `graphics.games.gachaMerge.ui.cellEmpty`
- `graphics.games.gachaMerge.ui.cellOccupied`
- `graphics.games.gachaMerge.ui.cellSelected`
- `graphics.games.gachaMerge.ui.cellTarget`
- `graphics.games.gachaMerge.fx.essenceOrb`
- `graphics.games.gachaMerge.fx.recipeGlow`
- `graphics.games.gachaMerge.items.<item_id>`

Generated pipeline input folders:

- `public/games/gacha-merge/backgrounds/table.png` or `.svg`
- `public/games/gacha-merge/ui/libraryRail.png`
- `public/games/gacha-merge/ui/libraryPanel.png`
- `public/games/gacha-merge/ui/exchangePanel.png`
- `public/games/gacha-merge/ui/actionDock.png`
- `public/games/gacha-merge/ui/hudBar.png`
- `public/games/gacha-merge/ui/hudIconItems.png`
- `public/games/gacha-merge/ui/hudIconRecipes.png`
- `public/games/gacha-merge/ui/hudIconExchange.png`
- `public/games/gacha-merge/ui/hudIconEssence.png`
- `public/games/gacha-merge/ui/hudIconMode.png`
- `public/games/gacha-merge/ui/hudIconPause.png`
- `public/games/gacha-merge/ui/actionIconGenerate.png`
- `public/games/gacha-merge/ui/actionIconDaily.png`
- `public/games/gacha-merge/ui/actionIconTokens.png`
- `public/games/gacha-merge/ui/actionIconTrash.png`
- `public/games/gacha-merge/ui/boardFrame.png`
- `public/games/gacha-merge/ui/cellEmpty.png`
- `public/games/gacha-merge/ui/cellOccupied.png`
- `public/games/gacha-merge/ui/cellSelected.png`
- `public/games/gacha-merge/ui/cellTarget.png`
- `public/games/gacha-merge/fx/essenceOrb.png`
- `public/games/gacha-merge/fx/recipeGlow.png`
- `public/games/gacha-merge/items/<item_id>.png` or `.svg`

Generated runtime key pattern:

- `gachaMerge.background.table`
- `gachaMerge.ui.libraryRail`
- `gachaMerge.ui.libraryPanel`
- `gachaMerge.ui.exchangePanel`
- `gachaMerge.ui.actionDock`
- `gachaMerge.ui.hudBar`
- `gachaMerge.ui.hudIconItems`
- `gachaMerge.ui.hudIconRecipes`
- `gachaMerge.ui.hudIconExchange`
- `gachaMerge.ui.hudIconEssence`
- `gachaMerge.ui.hudIconMode`
- `gachaMerge.ui.hudIconPause`
- `gachaMerge.ui.actionIconGenerate`
- `gachaMerge.ui.actionIconDaily`
- `gachaMerge.ui.actionIconTokens`
- `gachaMerge.ui.actionIconTrash`
- `gachaMerge.ui.boardFrame`
- `gachaMerge.ui.cellEmpty`
- `gachaMerge.ui.cellOccupied`
- `gachaMerge.ui.cellSelected`
- `gachaMerge.ui.cellTarget`
- `gachaMerge.fx.essenceOrb`
- `gachaMerge.fx.recipeGlow`
- `gachaMerge.items.<item_id>`

### Asset sheet materials needed

Current checked-in starter art covers:

- Full Alchemy Table background sized to fill Pixi canvas behind the 7x9 board.
- Board cell frame/tile states: empty, occupied, selected, and valid merge target.
- Custom Alchemy Table HUD bar with Items, Recipes, Exchange, Essence, Mode, and Pause icons.
- Action icons for generator/free taps, daily drop, token pull, and trash mode.
- 48 item icons: all chain items listed above.
- Essence orb FX.
- Recipe glow/highlight.
- Library rail art.
- Library and Exchange panel art.
- Bottom action dock art.

Still useful production polish:

- Invalid/drop miss board state if the scene starts drawing a separate miss/invalid visual.
- Source-specific crop fuel visual variants.
- Trash mode state variant if it needs a separate armed/danger visual.
- Discovery states: unknown item silhouette, locked recipe card, newly discovered recipe burst.
- Perfect reaction / Yard reward drop moment.

Technical constraints:

- Item icons must read at small board-cell scale: current max cell is about 58px, item icon draws at about `radius * 1.8`.
- Transparent PNG or SVG are both accepted by pipeline.
- If an item file exists in `public/games/gacha-merge/items`, it joins `pixi.merge`.
- Manual manifest override wins over generated asset.
- Background table art is rendered full-canvas; important board-safe area should remain centered and not fight the 7x9 board.
- Optional board/cell art is read from `gachaMerge.ui.boardFrame`, `cellEmpty`, `cellOccupied`, `cellSelected`, and `cellTarget`; if missing, the scene keeps procedural rounded cells.
- HUD and action icons are rendered by live DOM controls and must read at `20-24px` without relying on fine internal detail.
- Recipe and item drawers use `gachaMerge.ui.libraryPanel`; Exchange uses `gachaMerge.ui.exchangePanel`. Both are treated as 2:3 panel artwork with centered safe content and should not be stretched to arbitrary viewport ratios.
- Optional bottom dock art is read from `gachaMerge.ui.actionDock` behind live DOM controls; keep it low-contrast because labels and buttons are still rendered by React.

## 4. Building Blox

### Смысл игры

Building Blox - block puzzle на 10x10 поле. Игрок получает tray из трех фигур, ставит их на сетку, закрывает полные строки/колонки, набирает score, получает gold/tokens по окончанию. Визуально это должно читаться как компактная mobile block puzzle: ясные плитки, сильная обратная связь на clear, быстрый drag/drop.

### Игровой цикл

1. Игрок запускает run.
2. Server создает saved state: пустое 10x10 поле, 3 tray pieces, score 0.
3. Игрок выбирает/тащит фигуру из tray.
4. Runtime показывает ghost, snap cell и valid/invalid outline.
5. Успешное размещение заполняет клетки цветом фигуры.
6. Полные строки/колонки очищаются сразу.
7. Если все 3 фигуры размещены, tray refill.
8. Если ни одна не помещается, run завершается и начисляется reward.

### Технический контракт

- Активная вкладка: `blox`.
- Component: `src/games/blox/BloxGame.jsx`.
- Scene builder: `buildBloxScene` in `src/game-runtime/scenes.js`.
- Pure rules: `game-logic/blox-engine.js`.
- Piece library: `game-logic/blox-pieces.js`.
- Client hook: `src/hooks/useBloxEngine.js` still exists; current primary path uses server-authoritative `blox.place` state through `useAction`.
- Server actions: `blox.start`, `blox.place`, `blox.sync`, `blox.end`.
- Legacy routes also exist under `/api/blox/*`.

State:

- `blox.highScore`
- `blox.totalGames`
- `blox.activeGame`
- `blox.savedState` serialized JSON: `board`, `tray`, `score`, `linesCleared`, `highScore`, `gameActive`.

Board/pieces:

- Grid: `10 x 10`.
- Tray count: `3`.
- Piece count: `12`.

Piece library:

| Id | Shape cells | Color |
|---|---|---|
| `dot` | `[[0,0]]` | `#94a3b8` |
| `h2` | 2 horizontal | `#60a5fa` |
| `v2` | 2 vertical | `#60a5fa` |
| `l3` | L triomino | `#f97316` |
| `l3r` | mirrored L triomino | `#f97316` |
| `h3` | 3 horizontal | `#22c55e` |
| `v3` | 3 vertical | `#22c55e` |
| `sq` | 2x2 square | `#fbbf24` |
| `t4` | T tetromino | `#a78bfa` |
| `s4` | S tetromino | `#ef4444` |
| `i4` | 4 horizontal | `#06b6d4` |
| `i5` | 5 horizontal | `#e879f9` |

Reward/security:

- Score increments by placed cells plus line-clear points.
- `calcBloxReward(score)` caps reward at 400 gold.
- `blox.end` rejects active-session abuse; scores over 10000 do not receive reward.

### Current runtime assets

Current scene is procedural:

- Board panel and cells are Pixi `Graphics`.
- Pieces are colored rounded rectangles.
- Clear effects are Pixi-generated strokes, wipes, sparkles, ripple, and `CLEAR` label.
- No Blox image files are currently in asset pipeline.

### Asset sheet materials needed

Must-have art if upgrading from procedural:

- Board background/frame for 10x10 grid.
- Empty cell tile.
- Filled cell material per piece color or per piece family.
- 12 piece previews or block materials.
- Tray slot normal/selected/placed states.
- Drag ghost style.
- Valid target outline.
- Invalid target outline.
- Row clear wipe FX.
- Column clear wipe FX.
- Clear text/burst.
- Run start/result/pause icon set if replacing shared shell visuals.

Technical constraints:

- Any per-cell texture must tile cleanly at variable cell sizes.
- Drag preview must work with arbitrary piece shapes; sprite-per-whole-piece would need one asset per shape, while tile material is more flexible.
- Current code does not load Blox assets; adding real art requires either new keys in `assetBundles.js`/pipeline or manual resolver in `buildBloxScene`.

## 5. Gem Crush

### Смысл игры

Gem Crush - match-3 puzzle на 8x8 поле, визуально основанный на Puzzling Potions assets. Игрок меняет соседние pieces, собирает matches, запускает cascades, создает special pieces, собирает drop tokens в drop mode и получает gold/tokens по результату.

### Игровой цикл

1. Игрок выбирает mode: classic, timed, drop.
2. Start генерирует valid 8x8 board.
3. В drop mode board seed-ится 3 drop tokens.
4. Игрок tap-select или drag-swap соседние cells.
5. Invalid swap дает короткий reject animation.
6. Valid swap запускает cascade: clear, special creation, gravity, fill, drop collection.
7. Classic/drop тратят moves; timed работает по 90 секунд.
8. End сохраняет high score и начисляет gold/tokens.

### Технический контракт

- Активная вкладка: `match3`.
- Component: `src/games/match3/Match3Game.jsx`.
- Scene builder: `buildMatch3Scene` in `src/game-runtime/scenes.js`.
- Pure engine: `src/game-core/match3/engine.js`.
- Animation timing: `src/game-core/match3/animation.js`.
- Server actions: `match3.start`, `match3.syncMode`, `match3.end`.
- Legacy routes exist under `/api/game/*`.
- Board: `BOARD_SIZE = 8`.
- Saved modes stored in `match3.savedModes` as JSON string for nested-array Postgres safety.

Modes:

- `classic` - 30 moves.
- `timed` - 90 seconds client countdown.
- `drop` - 30 moves, initial board gets 3 drop tokens.

Gem types:

| Type | Current visual key | Fallback icon |
|---|---|---|
| `fire` | `match3.piece.dragon` | fire |
| `water` | `match3.piece.frog` | water |
| `earth` | `match3.piece.newt` | leaf |
| `air` | `match3.piece.snake` | air |
| `light` | `match3.piece.spider` | star |
| `dark` | `match3.piece.yeti` | crystal |

Special types:

| Type | Runtime key | Meaning |
|---|---|---|
| `special_row` | `match3.special.row` | row clear |
| `special_column` | `match3.special.column` | column clear |
| `special_blast` | `match3.special.blast` | blast clear |
| `special_colour` | `match3.special.colour` | color clear |

Drop token types:

- `drop_gold`
- `drop_seeds`
- `drop_energy`

Drop tokens currently use emoji fallback, not dedicated runtime art.

### Current runtime assets

Runtime folder:

- `public/games/puzzling-potions/images/`

Current runtime keys:

- `match3.piece.dragon`
- `match3.piece.frog`
- `match3.piece.newt`
- `match3.piece.snake`
- `match3.piece.spider`
- `match3.piece.yeti`
- `match3.shelf.block`
- `match3.special.blast`
- `match3.special.column`
- `match3.special.colour`
- `match3.special.row`

Additional source/reference assets exist in:

- `assets-source/games/puzzling-potions/dist-source/`
- `assets-source/games/puzzling-potions/raw-assets/`

Not all upstream Puzzling Potions assets are currently used by CC-GH runtime.

### Asset sheet materials needed

Must-have art:

- 6 normal pieces/gems/creatures.
- 4 special pieces.
- Board background/frame.
- Cell tile.
- Shelf/block texture.
- Selected cell outline.
- Valid/invalid swap feedback.
- Cascade clear burst.
- Special trigger FX: row beam, column beam, blast pulse, color clear.
- Drop token art for gold, seeds, energy.
- Combo label, points pop, reward token pop.
- Mode selection cards if replacing shared shell cards.

Technical constraints:

- Piece art must remain readable at about 70% of cell size.
- Pixi sprite draw uses centered texture with transparent background.
- Board is responsive; avoid fixed baked-in text inside board art.
- Runtime uses `gameAsset(POTION_PIECE_ASSETS[type])`, so new art should preserve current keys unless code is updated.
- Public Puzzling Potions files such as `background.png`, `game-header.png`, `logo-game.png`, `books-*.png`, `highlight.png`, and `shelf-corner.png` are legacy/reference surfaces in this app right now; the active generated Match-3 bundle is only the 11 keys listed above.

## 6. Bubbo Bubbo

### Смысл игры

Bubbo Bubbo - bubble shooter. Игрок стреляет цветным bubble из cannon, целится через отражающуюся траекторию, собирает clusters одинакового цвета и сбрасывает hanging bubbles. Pressure постепенно двигает поле вниз. Верхняя pending pressure row является реальной hittable row, а не декоративным preview.

Основная эмоция: легкая аркадная стрельба, clear clusters, падающие bubbles, управляемое давление без ощущения наказания после сильных clears.

### Игровой цикл

1. Игрок выбирает mode: classic или timed.
2. Start создает seeded run.
3. Board стартует с 5 occupied rows на 11x9 field.
4. Игрок aim/drag/tap, видит trajectory.
5. Cannon fires current bubble, next bubble виден рядом.
6. Hit/landing resolves cluster.
7. 3+ same-color bubbles pop; floating bubbles drop.
8. Score растет от popped/dropped cells.
9. Pressure interval двигает pending row into board.
10. Sparse boards auto-refill до минимум 3 playable rows без штрафа.
11. Classic кончается по shots; timed - по 90 seconds или danger/field clear conditions.

### Технический контракт

- Активная вкладка: `bubbo`.
- Component: `src/games/bubbo/BubboGame.jsx`.
- Scene builder: `buildBubboScene` in `src/game-runtime/scenes.js`.
- Pure engine: `src/game-core/bubbo/engine.js`.
- Server actions: `bubbo.start`, `bubbo.sync`, `bubbo.end`.

Constants:

- `BUBBO_ROWS = 11`
- `BUBBO_COLS = 9`
- `BUBBO_START_ROWS = 5`
- `BUBBO_SHOTS = 36`
- `BUBBO_TIMED_SECONDS = 90`
- `BUBBO_PRESSURE_INTERVAL_MS = 9500`
- Colors: `mint`, `amber`, `coral`, `sky`, `berry`

Important state fields:

- `board`
- `pendingRow`
- `seed`
- `waveIndex`
- `rowOffset`
- `pressure`
- `pressureStep`
- `current`
- `next`
- `score`
- `shotsFired`
- `shotsLeft`
- `timeLeft`
- `lastShot`
- `gameActive`

Mode behavior:

- `classic` - shot-limited, primary counter is shots.
- `timed` - 90 seconds, no shot-limit UX emphasis.

Rendering details:

- Ball sheet texture slicing uses fixed sheet coordinates for `idle`, `glow`, `burst` frames.
- Pending pressure row is rendered at visual row `-1`.
- Pressure animation moves board layer smoothly.
- Cannon uses bottom tray and cannon main sprite if available.
- Aim path reflects off side walls.
- Reduced-motion users get capped/shortened effects.

### Current runtime assets

Runtime folder:

- `public/games/bubbo-bubbo/`

Runtime keys:

- `bubbo.background.tile`
- `bubbo.bubble.blue`
- `bubbo.bubble.green`
- `bubbo.bubble.red`
- `bubbo.bubble.yellow`
- `bubbo.balls.sheet`
- `bubbo.bottomTray`
- `bubbo.cannon.main`

Additional public files exist but are not all current bundle keys:

- `bubble-glow.png`
- `bubble-shadow.png`
- `bubble-shine.png`
- `cannon-arrow.png`
- `cannon-barrel.png`
- `cannon-top.png`
- `laser-line.png`
- `satellite.png`

Source/reference assets:

- `assets-source/games/bubbo-bubbo/dist-source/`
- `assets-source/games/bubbo-bubbo/raw-assets/`

### Asset sheet materials needed

Must-have art:

- Bubble ball sheet with rows for `coral`, `sky`, `mint`, `amber`, `berry`.
- For each color: idle, glow, burst frames.
- Fallback single-color bubbles: blue, green, red, yellow, plus missing berry equivalent if sheet is not used.
- Background tile.
- Finish/danger line visual.
- Cannon main.
- Cannon barrel/top/arrow if runtime starts using them separately.
- Bottom tray.
- Current bubble holder and next bubble holder.
- Aim laser line and reflection markers.
- Pressure row indicator.
- Pop burst, drop/fall bubble trail, sparkle/ripple.
- Field clear celebration.
- Danger state FX.

Technical constraints:

- Existing sheet slicing assumes `1672 x 941` sheet and fixed frame coordinates. If replacing the sheet, either match the frame layout or update `BUBBO_BALL_FRAMES`.
- Current asset bundle only includes 8 keys; adding cannon parts/laser assets requires adding pipeline entries and runtime references.
- Extra committed Bubbo files (`bubble-glow`, `bubble-shadow`, `bubble-shine`, `cannon-arrow`, `cannon-barrel`, `cannon-top`, `laser-line`, `satellite`) are legacy/hidden public surfaces until they are added to `assetBundles.js`, the pipeline config, and the scene builder.
- Bubble art must work at dynamic radius; transparent padding should not make bubble collisions look misaligned.
- The pending row must look hittable, not like a forecast-only row.

## 7. Brain Blitz

### Смысл игры

Brain Blitz - trivia quiz with solo and duel modes. Игрок выбирает category/difficulty, отвечает на 5 questions, получает score, streak, time bonus and final gold reward. Duel mode lets players create/join a room via invite code, ready up, answer questions, and see duel history.

Визуально это должна быть быстрая quiz карточка внутри shared game shell, без перегруженного игрового поля.

### Игровой цикл

Solo:

1. Игрок выбирает category или оставляет any.
2. Игрок выбирает difficulty: easy, medium, hard, all.
3. `/api/trivia/start` выбирает 5 questions.
4. Игрок отвечает на question cards.
5. Correct answer дает base points + time bonus.
6. Streak растет на correct и сбрасывается на wrong.
7. После последнего вопроса начисляется gold: win reward if >50% correct, else lose reward.

Duel:

1. Игрок создает room или вводит invite code.
2. Server держит room in process memory.
3. Players ready/start.
4. Answer path пишет duel answers and score.
5. Finished duel попадает в recent history circular buffer.

### Технический контракт

- Активная вкладка: `trivia`.
- Component: `src/games/trivia/TriviaGame.jsx`.
- Runtime: React DOM.
- Routes: `routes/trivia.js`.
- Question data: `data/questions.json`.
- State: `snapshot.trivia`.
- Solo routes: `/api/trivia/start`, `/api/trivia/answer`, `/api/trivia/forfeit`.
- Duel routes: `/api/trivia/duel/create`, `/api/trivia/duel/join`, `/api/trivia/duel/start`, `/api/trivia/duel/answer`, `/api/trivia/duel/status/:roomId`, `/api/trivia/duel/leave`, `/api/trivia/duel/ready`, `/api/trivia/duel/history`.

Important state fields:

- `trivia.totalScore`
- `trivia.totalCorrect`
- `trivia.totalPlayed`
- `trivia.bestStreak`
- `trivia.session`

Runtime room limits:

- Waiting room expiry: 3 minutes.
- Finished room expiry: 10 minutes.
- Max duel rooms: 2000.
- Duel history max: 50.

Economy:

- Trivia win reward: 25 gold.
- Trivia lose reward: 5 gold.
- Cost constant exists as `COST_TRIVIA = 3`, but current start route does not spend energy/gold; it only calls regen.

### Current runtime assets

Current scene is DOM + lucide icons:

- No dedicated Trivia image assets.
- Cards, buttons, status surfaces are CSS/shared shell.
- Question text comes from data, not images.

### Asset sheet materials needed

Must-have art if giving Brain Blitz its own identity:

- Trivia card background.
- Category selector icon set.
- Difficulty badges: easy, medium, hard, all.
- Answer button states: normal, hover, selected, correct, incorrect, disabled.
- Streak meter/flame.
- Timer/time bonus chip.
- Solo icon.
- Duel room icon.
- Invite code ticket.
- Ready/check state.
- Results trophy/badge.
- Recent duel row icons: won, lost, draw, waiting, expired.

Technical constraints:

- Do not bake question text into art.
- Answer buttons must support long localized text.
- Duel codes are dynamic text; art should leave a readable text area.
- This game does not need Pixi bundle unless a future visual scene is added.

## 8. Cozy Farm (legacy/hidden compatibility)

### Current product status

Cozy Farm exists in code but is not currently registered in the visible bottom tabs. It remains technically important because:

- `farm` state is still in default player data.
- Farm routes and `/api/player/mutate` actions still exist.
- Harvested crops are a real resource used by Gacha Merge generator taps.
- `FarmGame.jsx` and `buildFarmScene` still exist and can render if registered again.

Treat this as `Legacy/hidden` in asset planning, not as a currently surfaced main tab.

### Смысл игры

Cozy Farm - plot-based crop idle game. Игрок покупает seeds, выбирает crop, сажает в plots, поливает, ждет growth, harvests crops, sells harvested crops for gold, buys more plots, activates boosters, collects journal/season/badges.

### Игровой цикл

1. Player starts with 6 plots and 5 strawberry seeds.
2. Empty plot tap plants selected seed.
3. Planted plot tap waters if not watered.
4. Mature plot tap harvests.
5. Long press uproots an immature crop.
6. Harvested crops go to inventory, not immediate gold.
7. Player sells harvested crops for gold.
8. Player buys seeds and plots.
9. Farm XP raises farm level.
10. Harvest has a 2% chance to drop a gacha token.

### Технический контракт

- Component: `src/games/farm/FarmGame.jsx`.
- Scene builder: `buildFarmScene` in `src/game-runtime/scenes.js`.
- Pure/logic: `game-logic/farm.js`, `game-logic/crops.js`.
- Routes: `routes/farm.js`, plus `/api/player/mutate` cases.
- Current visible tab: none.

Actions:

- `farm.refresh`
- `farm.plant`
- `farm.water`
- `farm.harvest`
- `farm.harvestAll`
- `farm.uproot`
- `farm.buySeeds`
- `farm.sellCrop`
- `farm.buyPlot`
- `farm.activateBooster`
- `farm.buyTheme`
- `farm.setTheme`

Important state fields:

- `farm.xp`, `farm.level`
- `farm.plots[]`
- `farm.inventory`
- `farm.harvested`
- `cosmetics.activePlotTheme`, `cosmetics.ownedThemes`
- `boosters.fertilizer`
- `journal.discovered`
- `seasonPass`

Crops:

| Crop id | Name | Growth | Seed price | Sell price | XP |
|---|---|---:|---:|---:|---:|
| `strawberry` | Strawberry | 60s | 5 | 15 | 5 |
| `blueberry` | Blueberry | 7m | 8 | 20 | 8 |
| `tomato` | Tomato | 15m | 10 | 30 | 10 |
| `golden` | Golden Rose | 30m | 60 | 150 | 50 |
| `corn` | Corn | 45m | 20 | 50 | 15 |
| `sunflower` | Sunflower | 2h | 35 | 80 | 25 |
| `watermelon` | Watermelon | 4h | 45 | 120 | 35 |
| `pumpkin` | Pumpkin | 8h | 100 | 250 | 80 |

Plot limits:

- Start plots: 6.
- Max plots: 12.
- Buy plot costs double from 200: 200, 400, 800, 1600, 3200, 6400.

### Current runtime assets

Current farm scene is procedural:

- Soil tiles are Pixi `Graphics`.
- Crop visuals are emoji labels plus a simple green stem.
- Progress bars and labels are Pixi `Graphics`/Text.
- No dedicated farm image assets are in the current pipeline.

### Asset sheet materials needed

Must-have if Farm returns as a visible game:

- Field background.
- Plot tile states: empty soil, planted, watered, ready, selected, invalid.
- Crop growth stages for 8 crops.
- Seed packet icons for 8 crops.
- Harvested crop item icons for 8 crops.
- Uproot/long-press warning visual.
- Watering effect.
- Harvest burst.
- Booster/fertilizer icon and active aura.
- Plot theme skins.
- Shop/bag/badge/journal/season panels if not relying on shared CSS.

Technical constraints:

- Farm plot scene expects a 4-column grid and variable rows.
- Crop visuals need dynamic progress/time labels.
- If art replaces emoji, `buildFarmScene` needs crop asset resolver keyed by crop id and growth state.

## Shared assets outside individual games

These assets are not game-specific but should appear in a project-wide asset sheet.

### App icons

Current keys:

- `icons.app192`
- `icons.app512`
- Generated runtime keys also include `icons.icon192`, `icons.icon512`.

Needs:

- App icon 192.
- App icon 512.
- Optional maskable icon variants.

### Pets / legacy companion bodies

Current manual bucket:

- `graphics.pets.basic_dog`
- `graphics.pets.basic_cat`
- `graphics.pets.basic_bunny`
- `graphics.pets.expressions.ecstatic`
- `graphics.pets.expressions.happy`
- `graphics.pets.expressions.content`
- `graphics.pets.expressions.neutral`
- `graphics.pets.expressions.sad`
- `graphics.pets.expressions.miserable`

These are mostly legacy/shared companion assets. Cozy Yard now has its own companion species PNGs, but old pet SVGs still exist in generated runtime.

### Shared shell

Current generated runtime has:

- `assets.game-shell-cycle`
- `assets.game-shell-meditation`

Potential shared assets:

- Shell background bands.
- Pause overlay frame.
- Compact HUD stat chip variants.
- Button icons where lucide is not enough.
- Gold, energy, token icons.
- Toast/notice backgrounds.
- Loading/error panels.

### Audio

Manual manifest bucket:

- `audio.sfx.tap`
- `audio.sfx.success`
- `audio.sfx.warning`
- `audio.sfx.error`
- `audio.sfx.merge`
- `audio.sfx.clear`
- `audio.sfx.harvest`
- `audio.sfx.gacha`
- `audio.music.lobby`
- `audio.music.farm`
- `audio.music.puzzle`

Current audio manager can synthesize tones if no file is configured, but final asset sheet should still include:

- Shared tap/click.
- Success.
- Warning/error.
- Merge/craft.
- Clear/cascade.
- Harvest.
- Gacha/drop.
- Bubbo shot/pop/drop.
- Match-3 swap/invalid/special.
- Cozy Yard gift/visitor/photo.
- Optional low-volume loops per game family.

## Priority asset backlog

### Priority 0 - preserve current runtime contract

1. Keep all existing keys and fallback paths stable.
2. Do not rename catalog ids without migration.
3. Do not remove generated runtime files from `public/assets-runtime` manually; regenerate through `pnpm run assets:build`.
4. For assets that are currently procedural, document proposed keys before changing code.

### Priority 1 - highest leverage production art

1. Gacha Merge polish pass: source-specific crop fuel visuals, invalid/drop-miss state, discovery silhouettes/cards, and reward-drop moment on top of the committed table/HUD/UI/item/FX starter package.
2. Cozy Yard refinement: background safe areas, visitor pose consistency, goodie anchor clarity.
3. Garden Shelf plant sheet: all 8 plants x 4 phases with clean transparent frames.
4. Bubbo complete sheet: include berry parity and cleaner cannon/laser assets.
5. Match-3 drop token art: `drop_gold`, `drop_seeds`, `drop_energy`.

### Priority 2 - procedural-to-art upgrades

1. Building Blox board/cell/tray/clear art.
2. Cozy Farm crop stages if Farm becomes visible again.
3. Brain Blitz quiz identity assets.
4. Shared shell polish.

## Proposed asset sheet grouping

Use these groups when generating the actual spreadsheet:

1. `global.app`
2. `global.shell`
3. `global.audio`
4. `gardenShelf.scene`
5. `gardenShelf.plants`
6. `gardenShelf.ui`
7. `companionYard.backgrounds`
8. `companionYard.foods`
9. `companionYard.goodies`
10. `companionYard.visitors`
11. `companionYard.companions`
12. `companionYard.ui`
13. `gachaMerge.background`
14. `gachaMerge.items`
15. `gachaMerge.ui`
16. `gachaMerge.fx`
17. `blox.board`
18. `blox.pieces`
19. `blox.fx`
20. `match3.pieces`
21. `match3.specials`
22. `match3.board`
23. `match3.fx`
24. `bubbo.bubbles`
25. `bubbo.cannon`
26. `bubbo.board`
27. `bubbo.fx`
28. `trivia.ui`
29. `farm.crops`
30. `farm.board`
31. `farm.ui`

## Validation notes for future asset work

For asset-only changes:

1. Run `pnpm run assets:build`.
2. Run `pnpm test -- tests/assets-pipeline.test.js tests/asset-runtime.test.js` if narrowing is supported by current Node test command; otherwise run `pnpm test`.
3. Run `pnpm run build`.
4. For Pixi changes, smoke the touched game in browser/mobile viewport.
5. Run `git diff --check`.

For new runtime keys:

1. Add pipeline entry or directory convention.
2. Add resolver fallback.
3. Add/update manifest tests.
4. Document replacement contract in this file or a dedicated asset guide.

For manual overrides:

1. Confirm the target game has a manual manifest resolver before setting the path in `public/assets/manifest.json`.
2. Set the path under the supported bucket (`graphics.games.companionYard`, `graphics.games.gachaMerge`, or `audio.sfx` today).
3. Keep the fallback public path unless intentionally removing legacy support.
4. Prefer generated `/assets-runtime/*` for production assets and manual manifest for urgent overrides/prototypes.

## Verified from Code vs Designer Judgment

Verified from code on 2026-05-03:

- Visible bottom-tab games are `garden`, `blox`, `match3`, `merge`, `bubbo`, `trivia`, and `room`; `farm` is legacy/hidden but still has component, Pixi scene, API actions, and harvested-crop coupling into Merge.
- Pixi tabs are `blox`, `match3`, `merge`, and `bubbo`; Garden Shelf, Cozy Yard, and Brain Blitz are React/DOM surfaces.
- Current generated runtime manifest has 186 assets and three active Pixi bundles: `pixi.bubbo`, `pixi.match3`, and `pixi.merge`.
- Current resolver order differs by game as listed above; do not apply manual manifest override assumptions globally.
- Blox, Brain Blitz, and legacy Farm still need new resolver/key work before production art can be treated as runtime contract.

Still needs designer/art-director judgment:

- Final visual style, palette, and material language per game.
- Exact sprite margins, safe areas, pivot points, and pose silhouettes after production art is drafted.
- Whether procedural surfaces like Blox board cells, Trivia cards, and Farm crop stages should remain lightweight UI or become full art assets.
- Whether Cozy Yard HUD atlas should stay as a direct CSS sprite or move into the generated runtime manifest.
