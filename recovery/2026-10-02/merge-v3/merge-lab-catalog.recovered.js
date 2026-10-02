/**
 * SEMANTIC RECOVERY, not the original authored source.
 * Recovered from merge-lab-catalog-CcvGk2DJ.js of the isolated Merge v3 r1 preview.
 * Original SHA256: a84c4b3f6bf900ffa4ad4be0b05c2765042bfa8c3066249424d7a1a8c63c3312
 * Data, insertion order and name-fallback semantics are retained.
 * Original compiled exports M/m remain aliases; readable names are recovery labels.
 */
export const MERGE_LAB_CATALOG = {
  "version": "alchemy-v3.1",
  "defaultProjectId": "echo_chimes",
  "copy": {
    "alchemy": {
      "en": "These are storybook workshop connections: properties and ideas can become things.",
      "ru": "Это связи сказочной мастерской: свойства и идеи могут становиться вещами."
    },
    "discovery": {
      "en": "Discovered. Crafting needs real supplies.",
      "ru": "Открыто. Для изготовления нужны реальные запасы."
    },
    "lockedItem": {
      "en": "An undiscovered workshop idea. Follow properties or ask for a hint.",
      "ru": "Неоткрытый замысел мастерской. Следуйте свойствам или попросите подсказку."
    },
    "missingStock": {
      "en": "More supplies needed: {items}. Samples stay available for experiments.",
      "ru": "Не хватает запасов: {items}. Образцы остаются доступны для опытов."
    }
  },
  "items": [
    {
      "id": "seed",
      "name": "Seed",
      "legacyChain": "flora",
      "legacyLevel": 0,
      "source": "existing",
      "names": {
        "en": "Seed",
        "ru": "Семя"
      },
      "properties": {
        "en": [
          "dormant",
          "ready to grow"
        ],
        "ru": [
          "спит",
          "готово расти"
        ]
      },
      "use": {
        "en": "The beginning of the living garden.",
        "ru": "Начало живого сада."
      },
      "baseCost": 1,
      "asset": "/games/gacha-merge/items/seed.png"
    },
    {
      "id": "sprout",
      "name": "Sprout",
      "legacyChain": "flora",
      "legacyLevel": 1,
      "source": "existing",
      "names": {
        "en": "Sprout",
        "ru": "Росток"
      },
      "properties": {
        "en": [
          "young",
          "reaches upward"
        ],
        "ru": [
          "молодой",
          "тянется вверх"
        ]
      },
      "use": {
        "en": "A first step toward leafy places.",
        "ru": "Первый шаг к зелёным уголкам."
      },
      "baseCost": 2,
      "asset": "/games/gacha-merge/items/sprout.png"
    },
    {
      "id": "herb",
      "name": "Herb",
      "legacyChain": "flora",
      "legacyLevel": 2,
      "source": "existing",
      "names": {
        "en": "Herb",
        "ru": "Трава"
      },
      "properties": {
        "en": [
          "leafy",
          "fragrant"
        ],
        "ru": [
          "лиственная",
          "душистая"
        ]
      },
      "use": {
        "en": "Brings greenery and fragrance to workshop ideas.",
        "ru": "Добавляет замыслам мастерской зелень и запах."
      },
      "baseCost": 3,
      "asset": "/games/gacha-merge/items/herb.png"
    },
    {
      "id": "blossom",
      "name": "Blossom",
      "legacyChain": "flora",
      "legacyLevel": 3,
      "source": "existing",
      "names": {
        "en": "Blossom",
        "ru": "Цветок"
      },
      "properties": {
        "en": [
          "fragrant",
          "holds sweetness"
        ],
        "ru": [
          "душистый",
          "хранит сладость"
        ]
      },
      "use": {
        "en": "A source of garden scents and sweetness.",
        "ru": "Источник садовых ароматов и сладости."
      },
      "baseCost": 15,
      "asset": "/games/gacha-merge/items/blossom.png"
    },
    {
      "id": "vine",
      "name": "Vine",
      "legacyChain": "flora",
      "legacyLevel": 4,
      "source": "existing",
      "names": {
        "en": "Vine",
        "ru": "Лоза"
      },
      "properties": {
        "en": [
          "flexible",
          "fibrous"
        ],
        "ru": [
          "гибкая",
          "волокнистая"
        ]
      },
      "use": {
        "en": "A beginning for woven comforts and tangled greenery.",
        "ru": "Начало плетёного уюта и зелёных зарослей."
      },
      "baseCost": 7,
      "asset": "/games/gacha-merge/items/vine.png"
    },
    {
      "id": "grove",
      "name": "Grove",
      "legacyChain": "flora",
      "legacyLevel": 5,
      "source": "existing",
      "names": {
        "en": "Grove",
        "ru": "Роща"
      },
      "properties": {
        "en": [
          "sheltering",
          "wooden"
        ],
        "ru": [
          "даёт тень",
          "древесная"
        ]
      },
      "use": {
        "en": "Forms the green heart of a Living Arbor.",
        "ru": "Создаёт зелёное сердце Живой беседки."
      },
      "baseCost": 9,
      "asset": "/games/gacha-merge/items/grove.png"
    },
    {
      "id": "lifebloom",
      "name": "Lifebloom",
      "legacyChain": "flora",
      "legacyLevel": 6,
      "source": "existing",
      "names": {
        "en": "Lifebloom",
        "ru": "Живоцвет"
      },
      "properties": {
        "en": [
          "alive with magic",
          "renews itself"
        ],
        "ru": [
          "полон чар",
          "обновляется"
        ]
      },
      "use": {
        "en": "Carries the workshop’s idea of renewal.",
        "ru": "Хранит сказочную идею обновления."
      },
      "baseCost": 26,
      "asset": "/games/gacha-merge/items/lifebloom.png"
    },
    {
      "id": "world_tree",
      "name": "World Tree",
      "legacyChain": "flora",
      "legacyLevel": 7,
      "source": "existing",
      "names": {
        "en": "World Tree",
        "ru": "Мировое дерево"
      },
      "properties": {
        "en": [
          "far-reaching roots",
          "sheltering"
        ],
        "ru": [
          "глубокие корни",
          "даёт укрытие"
        ]
      },
      "use": {
        "en": "Replaces the grove and scent in the Living Arbor recipe, saving 30 essence.",
        "ru": "Заменяет рощу и аромат в чертеже Живой беседки, сберегая 30 эссенции."
      },
      "baseCost": 51,
      "asset": "/games/gacha-merge/items/world_tree.png"
    },
    {
      "id": "dust",
      "name": "Dust",
      "legacyChain": "earth",
      "legacyLevel": 0,
      "source": "existing",
      "names": {
        "en": "Dust",
        "ru": "Пыль"
      },
      "properties": {
        "en": [
          "dry",
          "loose"
        ],
        "ru": [
          "сухая",
          "сыпучая"
        ]
      },
      "use": {
        "en": "A humble start for shaped materials.",
        "ru": "Скромное начало материалов, которым можно придать форму."
      },
      "baseCost": 1,
      "asset": "/games/gacha-merge/items/dust.png"
    },
    {
      "id": "clay",
      "name": "Clay",
      "legacyChain": "earth",
      "legacyLevel": 1,
      "source": "existing",
      "names": {
        "en": "Clay",
        "ru": "Глина"
      },
      "properties": {
        "en": [
          "malleable",
          "holds a shape"
        ],
        "ru": [
          "податливая",
          "держит форму"
        ]
      },
      "use": {
        "en": "Useful for vessels and workshop structures.",
        "ru": "Пригодится для сосудов и построек мастерской."
      },
      "baseCost": 3,
      "asset": "/games/gacha-merge/items/clay.png"
    },
    {
      "id": "sand",
      "name": "Sand",
      "legacyChain": "earth",
      "legacyLevel": 2,
      "source": "existing",
      "names": {
        "en": "Sand",
        "ru": "Песок"
      },
      "properties": {
        "en": [
          "grainy",
          "loose"
        ],
        "ru": [
          "зернистый",
          "сыпучий"
        ]
      },
      "use": {
        "en": "A rough beginning for clear workshop wonders.",
        "ru": "Шероховатое начало прозрачных чудес мастерской."
      },
      "baseCost": 6,
      "asset": "/games/gacha-merge/items/sand.png"
    },
    {
      "id": "stone",
      "name": "Stone",
      "legacyChain": "earth",
      "legacyLevel": 3,
      "source": "existing",
      "names": {
        "en": "Stone",
        "ru": "Камень"
      },
      "properties": {
        "en": [
          "hard",
          "reflects a knock"
        ],
        "ru": [
          "твёрдый",
          "отзывается на стук"
        ]
      },
      "use": {
        "en": "Gives experiments weight, edges, and a surface to answer back.",
        "ru": "Даёт опытам вес, грани и поверхность, которая отзывается."
      },
      "baseCost": 5,
      "asset": "/games/gacha-merge/items/stone.png"
    },
    {
      "id": "ore",
      "name": "Ore",
      "legacyChain": "earth",
      "legacyLevel": 4,
      "source": "existing",
      "names": {
        "en": "Ore",
        "ru": "Руда"
      },
      "properties": {
        "en": [
          "hidden metal",
          "rough"
        ],
        "ru": [
          "скрывает металл",
          "шероховатая"
        ]
      },
      "use": {
        "en": "Leads into the workshop’s metalworking ideas.",
        "ru": "Открывает замыслы о работе с металлом."
      },
      "baseCost": 7,
      "asset": "/games/gacha-merge/items/ore.png"
    },
    {
      "id": "crystal",
      "name": "Crystal",
      "legacyChain": "earth",
      "legacyLevel": 5,
      "source": "existing",
      "names": {
        "en": "Crystal",
        "ru": "Кристалл"
      },
      "properties": {
        "en": [
          "faceted",
          "rings clearly"
        ],
        "ru": [
          "гранёный",
          "чисто звенит"
        ]
      },
      "use": {
        "en": "Adds a bright detail to a Night Beacon.",
        "ru": "Добавляет Ночному маяку сияющую деталь."
      },
      "baseCost": 18,
      "asset": "/games/gacha-merge/items/crystal.png"
    },
    {
      "id": "geode",
      "name": "Geode",
      "legacyChain": "earth",
      "legacyLevel": 6,
      "source": "existing",
      "names": {
        "en": "Geode",
        "ru": "Жеода"
      },
      "properties": {
        "en": [
          "rocky shell",
          "secret sparkle"
        ],
        "ru": [
          "каменная оболочка",
          "скрытый блеск"
        ]
      },
      "use": {
        "en": "Invites experiments with hidden worlds.",
        "ru": "Приглашает к опытам со скрытыми мирами."
      },
      "baseCost": 23,
      "asset": "/games/gacha-merge/items/geode.png"
    },
    {
      "id": "monolith",
      "name": "Monolith",
      "legacyChain": "earth",
      "legacyLevel": 7,
      "source": "existing",
      "names": {
        "en": "Monolith",
        "ru": "Монолит"
      },
      "properties": {
        "en": [
          "solid",
          "resonant"
        ],
        "ru": [
          "цельный",
          "гулкий"
        ]
      },
      "use": {
        "en": "Replaces the bowl work in a Listening Fountain recipe, saving 30 essence.",
        "ru": "Заменяет работу над чашей в чертеже Слушающего фонтана, сберегая 30 эссенции."
      },
      "baseCost": 10,
      "asset": "/games/gacha-merge/items/monolith.png"
    },
    {
      "id": "dew",
      "name": "Dew",
      "legacyChain": "water",
      "legacyLevel": 0,
      "source": "existing",
      "names": {
        "en": "Dew",
        "ru": "Роса"
      },
      "properties": {
        "en": [
          "fresh",
          "clings to surfaces"
        ],
        "ru": [
          "свежая",
          "держится на поверхности"
        ]
      },
      "use": {
        "en": "A gentle beginning for water, growth, and colour.",
        "ru": "Мягкое начало опытов с водой, ростом и цветом."
      },
      "baseCost": 1,
      "asset": "/games/gacha-merge/items/dew.png"
    },
    {
      "id": "droplet",
      "name": "Droplet",
      "legacyChain": "water",
      "legacyLevel": 1,
      "source": "existing",
      "names": {
        "en": "Droplet",
        "ru": "Капля"
      },
      "properties": {
        "en": [
          "round",
          "joins other drops"
        ],
        "ru": [
          "округлая",
          "собирается в воду"
        ]
      },
      "use": {
        "en": "Helps explore how little amounts become a flow.",
        "ru": "Помогает понять, как из малого появляется течение."
      },
      "baseCost": 2,
      "asset": "/games/gacha-merge/items/droplet.png"
    },
    {
      "id": "stream",
      "name": "Stream",
      "legacyChain": "water",
      "legacyLevel": 2,
      "source": "existing",
      "names": {
        "en": "Stream",
        "ru": "Ручей"
      },
      "properties": {
        "en": [
          "flowing",
          "carries things"
        ],
        "ru": [
          "течёт",
          "подхватывает"
        ]
      },
      "use": {
        "en": "A moving thread through the water and craft branches.",
        "ru": "Связывает водные и ремесленные открытия."
      },
      "baseCost": 4,
      "asset": "/games/gacha-merge/items/stream.png"
    },
    {
      "id": "spring",
      "name": "Spring",
      "legacyChain": "water",
      "legacyLevel": 3,
      "source": "existing",
      "names": {
        "en": "Spring",
        "ru": "Источник"
      },
      "properties": {
        "en": [
          "fresh flow",
          "rises from below"
        ],
        "ru": [
          "свежий поток",
          "бьёт из земли"
        ]
      },
      "use": {
        "en": "Supplies the water idea for a Listening Fountain.",
        "ru": "Даёт Слушающему фонтану водную основу."
      },
      "baseCost": 9,
      "asset": "/games/gacha-merge/items/spring.png"
    },
    {
      "id": "pond",
      "name": "Pond",
      "legacyChain": "water",
      "legacyLevel": 4,
      "source": "existing",
      "names": {
        "en": "Pond",
        "ru": "Пруд"
      },
      "properties": {
        "en": [
          "still",
          "reflective"
        ],
        "ru": [
          "спокойный",
          "отражает"
        ]
      },
      "use": {
        "en": "A quiet surface for experiments with the sky.",
        "ru": "Тихая поверхность для опытов с небом."
      },
      "baseCost": 12,
      "asset": "/games/gacha-merge/items/pond.png"
    },
    {
      "id": "tide",
      "name": "Tide",
      "legacyChain": "water",
      "legacyLevel": 5,
      "source": "existing",
      "names": {
        "en": "Tide",
        "ru": "Прилив"
      },
      "properties": {
        "en": [
          "rhythmic",
          "rises and falls"
        ],
        "ru": [
          "ритмичный",
          "приходит и уходит"
        ]
      },
      "use": {
        "en": "Carries the sea’s rhythm into the workshop.",
        "ru": "Приносит в мастерскую морской ритм."
      },
      "baseCost": 24,
      "asset": "/games/gacha-merge/items/tide.png"
    },
    {
      "id": "rainstone",
      "name": "Rainstone",
      "legacyChain": "water",
      "legacyLevel": 6,
      "source": "existing",
      "names": {
        "en": "Rainstone",
        "ru": "Камень дождя"
      },
      "properties": {
        "en": [
          "stores a shower",
          "shimmers"
        ],
        "ru": [
          "хранит ливень",
          "мерцает"
        ]
      },
      "use": {
        "en": "A storybook bridge between water and the sky.",
        "ru": "Сказочный мостик между водой и небом."
      },
      "baseCost": 53,
      "asset": "/games/gacha-merge/items/rainstone.png"
    },
    {
      "id": "ocean_heart",
      "name": "Ocean Heart",
      "legacyChain": "water",
      "legacyLevel": 7,
      "source": "existing",
      "names": {
        "en": "Ocean Heart",
        "ru": "Сердце океана"
      },
      "properties": {
        "en": [
          "deep rhythm",
          "feeds roots"
        ],
        "ru": [
          "глубинный ритм",
          "питает корни"
        ]
      },
      "use": {
        "en": "Replaces the spring and filter in a Listening Fountain recipe, saving 30 essence.",
        "ru": "Заменяет источник и фильтр в чертеже Слушающего фонтана, сберегая 30 эссенции."
      },
      "baseCost": 42,
      "asset": "/games/gacha-merge/items/ocean_heart.png"
    },
    {
      "id": "ember",
      "name": "Ember",
      "legacyChain": "fire",
      "legacyLevel": 0,
      "source": "existing",
      "names": {
        "en": "Ember",
        "ru": "Уголёк"
      },
      "properties": {
        "en": [
          "warm",
          "smouldering"
        ],
        "ru": [
          "тёплый",
          "тлеющий"
        ]
      },
      "use": {
        "en": "A small beginning for the workshop’s warm branch.",
        "ru": "Малое начало тёплой ветки мастерской."
      },
      "baseCost": 1,
      "asset": "/games/gacha-merge/items/ember.png"
    },
    {
      "id": "flame",
      "name": "Flame",
      "legacyChain": "fire",
      "legacyLevel": 1,
      "source": "existing",
      "names": {
        "en": "Flame",
        "ru": "Пламя"
      },
      "properties": {
        "en": [
          "hot",
          "dancing"
        ],
        "ru": [
          "горячее",
          "танцующее"
        ]
      },
      "use": {
        "en": "Changes the shape and character of workshop materials.",
        "ru": "Меняет форму и характер материалов мастерской."
      },
      "baseCost": 2,
      "asset": "/games/gacha-merge/items/flame.png"
    },
    {
      "id": "coal",
      "name": "Coal",
      "legacyChain": "fire",
      "legacyLevel": 2,
      "source": "existing",
      "names": {
        "en": "Coal",
        "ru": "Уголь"
      },
      "properties": {
        "en": [
          "porous",
          "leaves a dark mark"
        ],
        "ru": [
          "пористый",
          "оставляет тёмный след"
        ]
      },
      "use": {
        "en": "Useful for dark marks and the fountain’s filter.",
        "ru": "Пригодится для тёмных следов и фильтра фонтана."
      },
      "baseCost": 4,
      "asset": "/games/gacha-merge/items/coal.png"
    },
    {
      "id": "kiln",
      "name": "Kiln",
      "legacyChain": "fire",
      "legacyLevel": 3,
      "source": "existing",
      "names": {
        "en": "Kiln",
        "ru": "Печь"
      },
      "properties": {
        "en": [
          "holds heat",
          "enclosed"
        ],
        "ru": [
          "хранит жар",
          "закрытая"
        ]
      },
      "use": {
        "en": "A place for the workshop’s heated transformations.",
        "ru": "Место для горячих превращений мастерской."
      },
      "baseCost": 5,
      "asset": "/games/gacha-merge/items/kiln.png"
    },
    {
      "id": "forge",
      "name": "Forge",
      "legacyChain": "fire",
      "legacyLevel": 4,
      "source": "existing",
      "names": {
        "en": "Forge",
        "ru": "Кузня"
      },
      "properties": {
        "en": [
          "shaping heat",
          "crafts metal"
        ],
        "ru": [
          "жар для ковки",
          "работает с металлом"
        ]
      },
      "use": {
        "en": "A doorway to sunlit masterwork ideas.",
        "ru": "Открывает путь к солнечным мастерским замыслам."
      },
      "baseCost": 11,
      "asset": "/games/gacha-merge/items/forge.png"
    },
    {
      "id": "sunshard",
      "name": "Sunshard",
      "legacyChain": "fire",
      "legacyLevel": 5,
      "source": "existing",
      "names": {
        "en": "Sunshard",
        "ru": "Солнечный осколок"
      },
      "properties": {
        "en": [
          "warm glow",
          "stores daylight"
        ],
        "ru": [
          "тёплое сияние",
          "хранит день"
        ]
      },
      "use": {
        "en": "Holds a little daytime for larger light experiments.",
        "ru": "Сберегает частицу дня для больших световых опытов."
      },
      "baseCost": 29,
      "asset": "/games/gacha-merge/items/sunshard.png"
    },
    {
      "id": "phoenix_ash",
      "name": "Phoenix Ash",
      "legacyChain": "fire",
      "legacyLevel": 6,
      "source": "existing",
      "names": {
        "en": "Phoenix Ash",
        "ru": "Пепел феникса"
      },
      "properties": {
        "en": [
          "soft",
          "promises renewal"
        ],
        "ru": [
          "мягкий",
          "обещает возрождение"
        ]
      },
      "use": {
        "en": "Replaces the lullaby in a Dream Nest recipe, saving 20 essence.",
        "ru": "Заменяет колыбельную в чертеже Гнезда для снов, сберегая 20 эссенции."
      },
      "baseCost": 28,
      "asset": "/games/gacha-merge/items/phoenix_ash.png"
    },
    {
      "id": "solar_core",
      "name": "Solar Core",
      "legacyChain": "fire",
      "legacyLevel": 7,
      "source": "existing",
      "names": {
        "en": "Solar Core",
        "ru": "Солнечное ядро"
      },
      "properties": {
        "en": [
          "steady glow",
          "sun-warm"
        ],
        "ru": [
          "ровно светит",
          "согрето солнцем"
        ]
      },
      "use": {
        "en": "Replaces the crystal in a Night Beacon recipe, saving 30 essence.",
        "ru": "Заменяет кристалл в чертеже Ночного маяка, сберегая 30 эссенции."
      },
      "baseCost": 41,
      "asset": "/games/gacha-merge/items/solar_core.png"
    },
    {
      "id": "breeze",
      "name": "Breeze",
      "legacyChain": "air",
      "legacyLevel": 0,
      "source": "existing",
      "names": {
        "en": "Breeze",
        "ru": "Бриз"
      },
      "properties": {
        "en": [
          "moving",
          "carries things"
        ],
        "ru": [
          "движется",
          "подхватывает"
        ]
      },
      "use": {
        "en": "Gives experiments movement, breath, and a little lift.",
        "ru": "Дарит опытам движение, дыхание и лёгкость."
      },
      "baseCost": 1,
      "asset": "/games/gacha-merge/items/breeze.png"
    },
    {
      "id": "cloud",
      "name": "Cloud",
      "legacyChain": "air",
      "legacyLevel": 1,
      "source": "existing",
      "names": {
        "en": "Cloud",
        "ru": "Облако"
      },
      "properties": {
        "en": [
          "soft",
          "floating"
        ],
        "ru": [
          "мягкое",
          "плывущее"
        ]
      },
      "use": {
        "en": "Brings sky ideas and cloud-soft comfort.",
        "ru": "Приносит небесные замыслы и облачную мягкость."
      },
      "baseCost": 2,
      "asset": "/games/gacha-merge/items/cloud.png"
    },
    {
      "id": "spark",
      "name": "Spark",
      "legacyChain": "air",
      "legacyLevel": 2,
      "source": "existing",
      "names": {
        "en": "Spark",
        "ru": "Искра"
      },
      "properties": {
        "en": [
          "brief flash",
          "restless"
        ],
        "ru": [
          "короткая вспышка",
          "непоседливая"
        ]
      },
      "use": {
        "en": "A tiny flash for experiments with brightness.",
        "ru": "Маленькая вспышка для опытов с сиянием."
      },
      "baseCost": 3,
      "asset": "/games/gacha-merge/items/spark.png"
    },
    {
      "id": "bolt",
      "name": "Bolt",
      "legacyChain": "air",
      "legacyLevel": 3,
      "source": "existing",
      "names": {
        "en": "Bolt",
        "ru": "Разряд"
      },
      "properties": {
        "en": [
          "sudden",
          "charged"
        ],
        "ru": [
          "внезапный",
          "заряженный"
        ]
      },
      "use": {
        "en": "A quick burst on the way to stormy ideas.",
        "ru": "Короткий всплеск на пути к грозовым замыслам."
      },
      "baseCost": 5,
      "asset": "/games/gacha-merge/items/bolt.png"
    },
    {
      "id": "lightning",
      "name": "Lightning",
      "legacyChain": "air",
      "legacyLevel": 4,
      "source": "existing",
      "names": {
        "en": "Lightning",
        "ru": "Молния"
      },
      "properties": {
        "en": [
          "bright",
          "branching"
        ],
        "ru": [
          "яркая",
          "ветвистая"
        ]
      },
      "use": {
        "en": "Brings a dramatic stroke to sky experiments.",
        "ru": "Добавляет небесным опытам яркий штрих."
      },
      "baseCost": 23,
      "asset": "/games/gacha-merge/items/lightning.png"
    },
    {
      "id": "storm_cell",
      "name": "Storm Cell",
      "legacyChain": "air",
      "legacyLevel": 5,
      "source": "existing",
      "names": {
        "en": "Storm Cell",
        "ru": "Грозовая ячейка"
      },
      "properties": {
        "en": [
          "swirling",
          "thundering"
        ],
        "ru": [
          "клубится",
          "гремит"
        ]
      },
      "use": {
        "en": "A pocket of weather for larger sky wonders.",
        "ru": "Небольшая буря для больших небесных чудес."
      },
      "baseCost": 25,
      "asset": "/games/gacha-merge/items/storm_cell.png"
    },
    {
      "id": "aurora",
      "name": "Aurora",
      "legacyChain": "air",
      "legacyLevel": 6,
      "source": "existing",
      "names": {
        "en": "Aurora",
        "ru": "Сияние"
      },
      "properties": {
        "en": [
          "colourful",
          "rippling"
        ],
        "ru": [
          "разноцветное",
          "переливается"
        ]
      },
      "use": {
        "en": "Pairs with a vial in an alternative Night Beacon recipe, saving 30 essence.",
        "ru": "Вместе с флаконом служит другим рецептом Ночного маяка, сберегая 30 эссенции."
      },
      "baseCost": 78,
      "asset": "/games/gacha-merge/items/aurora.png"
    },
    {
      "id": "tempest_crown",
      "name": "Tempest Crown",
      "legacyChain": "air",
      "legacyLevel": 7,
      "source": "existing",
      "names": {
        "en": "Tempest Crown",
        "ru": "Корона бури"
      },
      "properties": {
        "en": [
          "holds a storm",
          "keeps a rhythm"
        ],
        "ru": [
          "держит бурю",
          "задаёт ритм"
        ]
      },
      "use": {
        "en": "With glass, replaces a wind chime in the Voice of the Wind recipe without essence.",
        "ru": "Со стеклом заменяет музыку ветра в рецепте Голоса ветра без эссенции."
      },
      "baseCost": 37,
      "asset": "/games/gacha-merge/items/tempest_crown.png"
    },
    {
      "id": "mud",
      "name": "Mud",
      "legacyChain": "alchemy",
      "legacyLevel": 0,
      "source": "existing",
      "names": {
        "en": "Mud",
        "ru": "Грязь"
      },
      "properties": {
        "en": [
          "damp",
          "mouldable"
        ],
        "ru": [
          "влажная",
          "лепится"
        ]
      },
      "use": {
        "en": "Supports young growth and the first shaped objects.",
        "ru": "Поддерживает молодую зелень и первые вылепленные вещи."
      },
      "baseCost": 2,
      "asset": "/games/gacha-merge/items/mud.png"
    },
    {
      "id": "brick",
      "name": "Brick",
      "legacyChain": "alchemy",
      "legacyLevel": 1,
      "source": "existing",
      "names": {
        "en": "Brick",
        "ru": "Кирпич"
      },
      "properties": {
        "en": [
          "firm",
          "holds warmth"
        ],
        "ru": [
          "крепкий",
          "держит тепло"
        ]
      },
      "use": {
        "en": "A building block for warm workshop places.",
        "ru": "Основа тёплых построек мастерской."
      },
      "baseCost": 3,
      "asset": "/games/gacha-merge/items/brick.png"
    },
    {
      "id": "glass",
      "name": "Glass",
      "legacyChain": "alchemy",
      "legacyLevel": 2,
      "source": "existing",
      "names": {
        "en": "Glass",
        "ru": "Стекло"
      },
      "properties": {
        "en": [
          "clear",
          "smooth"
        ],
        "ru": [
          "прозрачное",
          "гладкое"
        ]
      },
      "use": {
        "en": "Useful for vessels, clear light, and ringing ornaments.",
        "ru": "Пригодится для сосудов, ясного света и звонких украшений."
      },
      "baseCost": 7,
      "asset": "/games/merge-lab-v3/items/glass.webp"
    },
    {
      "id": "vial",
      "name": "Vial",
      "legacyChain": "alchemy",
      "legacyLevel": 3,
      "source": "existing",
      "names": {
        "en": "Vial",
        "ru": "Флакон"
      },
      "properties": {
        "en": [
          "hollow",
          "narrow-necked"
        ],
        "ru": [
          "полый",
          "с узким горлышком"
        ]
      },
      "use": {
        "en": "Gives delicate things a place to stay.",
        "ru": "Даёт хрупким находкам свой маленький дом."
      },
      "baseCost": 8,
      "asset": "/games/gacha-merge/items/vial.png"
    },
    {
      "id": "elixir",
      "name": "Elixir",
      "legacyChain": "alchemy",
      "legacyLevel": 4,
      "source": "existing",
      "names": {
        "en": "Elixir",
        "ru": "Эликсир"
      },
      "properties": {
        "en": [
          "enchanted",
          "renews"
        ],
        "ru": [
          "зачарованный",
          "обновляет"
        ]
      },
      "use": {
        "en": "An enchanted workshop mixture for impossible growth.",
        "ru": "Зачарованная смесь мастерской для невозможного роста."
      },
      "baseCost": 11,
      "asset": "/games/gacha-merge/items/elixir.png"
    },
    {
      "id": "lens",
      "name": "Lens",
      "legacyChain": "alchemy",
      "legacyLevel": 5,
      "source": "existing",
      "names": {
        "en": "Lens",
        "ru": "Линза"
      },
      "properties": {
        "en": [
          "clear",
          "focuses a view"
        ],
        "ru": [
          "прозрачная",
          "собирает взгляд"
        ]
      },
      "use": {
        "en": "A closer look for the Stargazer Nook.",
        "ru": "Помогает разглядывать детали в Звёздном уголке."
      },
      "baseCost": 10,
      "asset": "/games/gacha-merge/items/lens.png"
    },
    {
      "id": "astrolabe",
      "name": "Astrolabe",
      "legacyChain": "alchemy",
      "legacyLevel": 6,
      "source": "existing",
      "names": {
        "en": "Astrolabe",
        "ru": "Астролябия"
      },
      "properties": {
        "en": [
          "skyward",
          "traces cycles"
        ],
        "ru": [
          "обращена к небу",
          "следит за циклами"
        ]
      },
      "use": {
        "en": "Replaces the lens and two sheets in a Stargazer Nook recipe, saving 20 essence.",
        "ru": "Заменяет линзу и два листа в чертеже Звёздного уголка, сберегая 20 эссенции."
      },
      "baseCost": 12,
      "asset": "/games/gacha-merge/items/astrolabe.png"
    },
    {
      "id": "philosopher_stone",
      "name": "Philosopher’s Stone",
      "legacyChain": "alchemy",
      "legacyLevel": 7,
      "source": "existing",
      "names": {
        "en": "Philosopher’s Stone",
        "ru": "Философский камень"
      },
      "properties": {
        "en": [
          "mysterious",
          "holds possibilities"
        ],
        "ru": [
          "загадочный",
          "хранит возможности"
        ]
      },
      "use": {
        "en": "With one sheet of paper, completes a Stargazer Nook recipe and saves 20 essence.",
        "ru": "С одним листом бумаги завершает чертёж Звёздного уголка и сберегает 20 эссенции."
      },
      "baseCost": 29,
      "asset": "/games/gacha-merge/items/philosopher_stone.png"
    },
    {
      "id": "light",
      "name": "Light",
      "source": "proposed",
      "names": {
        "en": "Light",
        "ru": "Свет"
      },
      "properties": {
        "en": [
          "bright",
          "weightless"
        ],
        "ru": [
          "яркий",
          "невесомый"
        ]
      },
      "use": {
        "en": "Leads toward small living lights and a Night Beacon.",
        "ru": "Ведёт к маленьким живым огонькам и Ночному маяку."
      },
      "baseCost": 12,
      "asset": "/games/merge-lab-v3/items/light.webp"
    },
    {
      "id": "firefly",
      "name": "Firefly",
      "source": "proposed",
      "names": {
        "en": "Firefly",
        "ru": "Светлячок"
      },
      "properties": {
        "en": [
          "little beetle",
          "gentle glow"
        ],
        "ru": [
          "маленький жучок",
          "мягко светится"
        ]
      },
      "use": {
        "en": "A tiny living light for a lantern.",
        "ru": "Маленький живой огонёк для фонаря."
      },
      "baseCost": 13,
      "asset": "/games/merge-lab-v3/items/firefly.webp"
    },
    {
      "id": "glow_lantern",
      "name": "Living Lantern",
      "source": "proposed",
      "names": {
        "en": "Living Lantern",
        "ru": "Живой фонарь"
      },
      "properties": {
        "en": [
          "sheltered glow",
          "gentle"
        ],
        "ru": [
          "защищённый огонёк",
          "мягкий"
        ]
      },
      "use": {
        "en": "The glowing heart of a Night Beacon.",
        "ru": "Светящееся сердце Ночного маяка."
      },
      "baseCost": 20,
      "asset": "/games/merge-lab-v3/items/glow_lantern.webp"
    },
    {
      "id": "thread_fiber",
      "name": "Thread",
      "source": "proposed",
      "names": {
        "en": "Thread",
        "ru": "Нить"
      },
      "properties": {
        "en": [
          "fine",
          "flexible"
        ],
        "ru": [
          "тонкая",
          "гибкая"
        ]
      },
      "use": {
        "en": "Begins the path to woven comfort.",
        "ru": "Начинает путь к тканому уюту."
      },
      "baseCost": 12,
      "asset": "/games/merge-lab-v3/items/thread_fiber.webp"
    },
    {
      "id": "cloth_weave",
      "name": "Cloth",
      "source": "proposed",
      "names": {
        "en": "Cloth",
        "ru": "Ткань"
      },
      "properties": {
        "en": [
          "woven",
          "wraps around things"
        ],
        "ru": [
          "тканая",
          "обволакивает"
        ]
      },
      "use": {
        "en": "Gives softness a cover and a shape.",
        "ru": "Дарит мягкости оболочку и форму."
      },
      "baseCost": 24,
      "asset": "/games/merge-lab-v3/items/cloth_weave.webp"
    },
    {
      "id": "cushion",
      "name": "Cushion",
      "source": "proposed",
      "names": {
        "en": "Cushion",
        "ru": "Подушка"
      },
      "properties": {
        "en": [
          "soft",
          "invites rest"
        ],
        "ru": [
          "мягкая",
          "зовёт отдохнуть"
        ]
      },
      "use": {
        "en": "The soft foundation of a Dream Nest.",
        "ru": "Мягкая основа Гнезда для снов."
      },
      "baseCost": 25,
      "asset": "/games/merge-lab-v3/items/cushion.webp"
    },
    {
      "id": "sound",
      "name": "Sound",
      "source": "proposed",
      "names": {
        "en": "Sound",
        "ru": "Звук"
      },
      "properties": {
        "en": [
          "vibrating",
          "carries a rhythm"
        ],
        "ru": [
          "вибрирует",
          "несёт ритм"
        ]
      },
      "use": {
        "en": "Gives a voice to ornaments and a rhythm to rest.",
        "ru": "Дарит украшениям голос, а отдыху — ритм."
      },
      "baseCost": 8,
      "asset": "/games/merge-lab-v3/items/sound.webp"
    },
    {
      "id": "echo",
      "name": "Echo",
      "source": "proposed",
      "names": {
        "en": "Echo",
        "ru": "Эхо"
      },
      "properties": {
        "en": [
          "answers back",
          "repeats"
        ],
        "ru": [
          "отзывается",
          "повторяется"
        ]
      },
      "use": {
        "en": "With crystal and thread, replaces a wind chime in the Voice of the Wind recipe without essence.",
        "ru": "С кристаллом и нитью заменяет музыку ветра в рецепте Голоса ветра без эссенции."
      },
      "baseCost": 13,
      "asset": "/games/merge-lab-v3/items/echo.webp"
    },
    {
      "id": "wind_chime",
      "name": "Wind Chimes",
      "source": "proposed",
      "names": {
        "en": "Wind Chimes",
        "ru": "Музыка ветра"
      },
      "properties": {
        "en": [
          "ringing",
          "sways gently"
        ],
        "ru": [
          "звенит",
          "слегка качается"
        ]
      },
      "use": {
        "en": "Ready to make the Voice of the Wind project.",
        "ru": "Пригодится для изготовления Голоса ветра."
      },
      "baseCost": 15,
      "asset": "/games/merge-lab-v3/items/wind_chime.webp"
    },
    {
      "id": "lullaby",
      "name": "Lullaby",
      "source": "proposed",
      "names": {
        "en": "Lullaby",
        "ru": "Колыбельная"
      },
      "properties": {
        "en": [
          "soothing",
          "repeating rhythm"
        ],
        "ru": [
          "успокаивает",
          "повторяет ритм"
        ]
      },
      "use": {
        "en": "Brings a quiet mood to a Dream Nest.",
        "ru": "Дарит Гнезду для снов спокойное настроение."
      },
      "baseCost": 28,
      "asset": "/games/merge-lab-v3/items/lullaby.webp"
    },
    {
      "id": "clay_bowl",
      "name": "Bowl",
      "source": "proposed",
      "names": {
        "en": "Bowl",
        "ru": "Чаша"
      },
      "properties": {
        "en": [
          "open vessel",
          "holds water"
        ],
        "ru": [
          "открытый сосуд",
          "держит воду"
        ]
      },
      "use": {
        "en": "The basin of a Listening Fountain.",
        "ru": "Основа водной чаши Слушающего фонтана."
      },
      "baseCost": 11,
      "asset": "/games/merge-lab-v3/items/clay_bowl.webp"
    },
    {
      "id": "charcoal_filter",
      "name": "Charcoal Filter",
      "source": "proposed",
      "names": {
        "en": "Charcoal Filter",
        "ru": "Угольный фильтр"
      },
      "properties": {
        "en": [
          "porous",
          "lets water through"
        ],
        "ru": [
          "пористый",
          "пропускает воду"
        ]
      },
      "use": {
        "en": "A workshop part for the Listening Fountain.",
        "ru": "Деталь мастерской для Слушающего фонтана."
      },
      "baseCost": 8,
      "asset": "/games/merge-lab-v3/items/charcoal_filter.webp"
    },
    {
      "id": "scent",
      "name": "Scent",
      "source": "proposed",
      "names": {
        "en": "Scent",
        "ru": "Аромат"
      },
      "properties": {
        "en": [
          "invisible",
          "drifts"
        ],
        "ru": [
          "невидимый",
          "разносится"
        ]
      },
      "use": {
        "en": "Adds a fragrant detail to a Living Arbor.",
        "ru": "Добавляет Живой беседке душистую деталь."
      },
      "baseCost": 4,
      "asset": "/games/merge-lab-v3/items/scent.webp"
    },
    {
      "id": "nectar",
      "name": "Nectar",
      "source": "proposed",
      "names": {
        "en": "Nectar",
        "ru": "Нектар"
      },
      "properties": {
        "en": [
          "sweet",
          "flowing"
        ],
        "ru": [
          "сладкий",
          "текучий"
        ]
      },
      "use": {
        "en": "Adds a sweet garden detail to a Living Arbor.",
        "ru": "Добавляет Живой беседке сладкую садовую деталь."
      },
      "baseCost": 16,
      "asset": "/games/merge-lab-v3/items/nectar.webp"
    },
    {
      "id": "paper",
      "name": "Paper",
      "source": "proposed",
      "names": {
        "en": "Paper",
        "ru": "Бумага"
      },
      "properties": {
        "en": [
          "thin",
          "holds a mark"
        ],
        "ru": [
          "тонкая",
          "сохраняет след"
        ]
      },
      "use": {
        "en": "Pages for the Stargazer Nook’s stories.",
        "ru": "Страницы для историй Звёздного уголка."
      },
      "baseCost": 13,
      "asset": "/games/merge-lab-v3/items/paper.webp"
    },
    {
      "id": "ink",
      "name": "Ink",
      "source": "proposed",
      "names": {
        "en": "Ink",
        "ru": "Чернила"
      },
      "properties": {
        "en": [
          "dark",
          "leaves a mark"
        ],
        "ru": [
          "тёмные",
          "оставляют след"
        ]
      },
      "use": {
        "en": "Draws stories and sky patterns for the Stargazer Nook.",
        "ru": "Рисует истории и небесные узоры для Звёздного уголка."
      },
      "baseCost": 5,
      "asset": "/games/merge-lab-v3/items/ink.webp"
    }
  ],
  "recipes": [
    {
      "id": "seed_dew_sprout",
      "ingredients": [
        "seed",
        "dew"
      ],
      "result": "sprout",
      "why": {
        "en": "Dew wakes the sleeping seed, and a sprout peeks out.",
        "ru": "Роса будит спящее семя, и наружу выглядывает росток."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Help something dormant wake with a little moisture.",
          "ru": "Помогите чему-то спящему проснуться от влаги."
        },
        {
          "en": "Start with Seed: it is waiting to wake.",
          "ru": "Начните с образца «Семя»: он ждёт пробуждения."
        },
        {
          "en": "Seed + Dew",
          "ru": "Семя + Роса"
        }
      ]
    },
    {
      "id": "seed_mud_sprout",
      "ingredients": [
        "seed",
        "mud"
      ],
      "result": "sprout",
      "why": {
        "en": "Mud gives the seed a damp blanket, and a sprout finds its way out.",
        "ru": "Грязь укрывает семя влажным одеялом, и росток находит выход."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Give sleeping life a soft, damp shelter.",
          "ru": "Дайте спящей жизни мягкое влажное укрытие."
        },
        {
          "en": "Start with Mud: it can make a snug little bed.",
          "ru": "Начните с образца «Грязь»: из него выйдет уютная постель."
        },
        {
          "en": "Seed + Mud",
          "ru": "Семя + Грязь"
        }
      ]
    },
    {
      "id": "dew_dust_mud",
      "ingredients": [
        "dew",
        "dust"
      ],
      "result": "mud",
      "why": {
        "en": "Dew gathers the scattered dust into soft mud.",
        "ru": "Роса собирает рассыпанную пыль в мягкую грязь."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Make something dry and loose hold together.",
          "ru": "Помогите сухому и сыпучему держаться вместе."
        },
        {
          "en": "Start with Dust: its grains need a way to cling.",
          "ru": "Начните с образца «Пыль»: крупинкам нужно сцепиться."
        },
        {
          "en": "Dew + Dust",
          "ru": "Роса + Пыль"
        }
      ]
    },
    {
      "id": "clay_ember_brick",
      "ingredients": [
        "clay",
        "ember"
      ],
      "result": "brick",
      "why": {
        "en": "In the workshop, an ember lends clay the firmness of a brick.",
        "ru": "В мастерской уголёк дарит глине крепость кирпича."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Help a soft shape keep its form in the warmth.",
          "ru": "Помогите мягкой форме окрепнуть в тепле."
        },
        {
          "en": "Start with Clay: it already knows how to hold a shape.",
          "ru": "Начните с образца «Глина»: он уже умеет держать форму."
        },
        {
          "en": "Clay + Ember",
          "ru": "Глина + Уголёк"
        }
      ]
    },
    {
      "id": "mud_ember_brick",
      "ingredients": [
        "mud",
        "ember"
      ],
      "result": "brick",
      "why": {
        "en": "Workshop magic lets an ember give humble mud a brick’s firm shape.",
        "ru": "Чары мастерской позволяют угольку придать простой грязи крепкую форму кирпича."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Give a damp, shapeless lump a lasting form.",
          "ru": "Придайте влажному бесформенному комку прочную форму."
        },
        {
          "en": "Start with Mud: imagine it becoming something sturdy.",
          "ru": "Начните с образца «Грязь»: представьте его крепким."
        },
        {
          "en": "Mud + Ember",
          "ru": "Грязь + Уголёк"
        }
      ]
    },
    {
      "id": "sand_flame_glass",
      "ingredients": [
        "sand",
        "flame"
      ],
      "result": "glass",
      "why": {
        "en": "In the workshop’s heat, rough sand dreams itself into smooth glass.",
        "ru": "В жаре мастерской шершавый песок мечтает стать гладким стеклом."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Turn a grainy surface into something smooth and clear.",
          "ru": "Превратите зернистую поверхность в гладкую и прозрачную."
        },
        {
          "en": "Start with Sand: imagine its grains flowing together.",
          "ru": "Начните с образца «Песок»: представьте, как крупинки сливаются."
        },
        {
          "en": "Sand + Flame",
          "ru": "Песок + Пламя"
        }
      ]
    },
    {
      "id": "sand_ember_glass",
      "ingredients": [
        "sand",
        "ember"
      ],
      "result": "glass",
      "why": {
        "en": "A storybook ember lends sand enough warmth to become clear glass.",
        "ru": "Сказочный уголёк делится с песком теплом для прозрачного стекла."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Let a small warmth reshape something rough.",
          "ru": "Позвольте маленькому теплу преобразить шероховатость."
        },
        {
          "en": "Start with Ember: even a little warmth matters here.",
          "ru": "Начните с образца «Уголёк»: здесь важно даже малое тепло."
        },
        {
          "en": "Sand + Ember",
          "ru": "Песок + Уголёк"
        }
      ]
    },
    {
      "id": "glass_droplet_vial",
      "ingredients": [
        "glass",
        "droplet"
      ],
      "result": "vial",
      "why": {
        "en": "Glass borrows the droplet’s round shape and becomes a vial to hold it.",
        "ru": "Стекло заимствует округлость капли и становится флаконом для неё."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Give something flowing a clear little home.",
          "ru": "Подарите чему-то текучему прозрачный домик."
        },
        {
          "en": "Start with Glass: a clear wall could become a vessel.",
          "ru": "Начните с образца «Стекло»: прозрачная стенка может стать сосудом."
        },
        {
          "en": "Glass + Droplet",
          "ru": "Стекло + Капля"
        }
      ]
    },
    {
      "id": "glass_dew_vial",
      "ingredients": [
        "glass",
        "dew"
      ],
      "result": "vial",
      "why": {
        "en": "Dew asks the glass for shelter, and the workshop imagines a tiny vial.",
        "ru": "Роса просит у стекла укрытия, и мастерская придумывает маленький флакон."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Shelter a little moisture without hiding it.",
          "ru": "Укройте немного влаги, не пряча её от глаз."
        },
        {
          "en": "Start with Dew: it needs a place to gather.",
          "ru": "Начните с образца «Роса»: ему нужно место, где собраться."
        },
        {
          "en": "Glass + Dew",
          "ru": "Стекло + Роса"
        }
      ]
    },
    {
      "id": "vial_herb_elixir",
      "ingredients": [
        "vial",
        "herb"
      ],
      "result": "elixir",
      "why": {
        "en": "A vial holds the herb’s green promise as an enchanted elixir.",
        "ru": "Флакон хранит зелёное обещание травы в зачарованном эликсире."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Keep a little greenery’s promise inside a vessel.",
          "ru": "Сохраните обещание зелени внутри сосуда."
        },
        {
          "en": "Start with Herb: imagine saving its fresh character.",
          "ru": "Начните с образца «Трава»: попробуйте сберечь его свежесть."
        },
        {
          "en": "Vial + Herb",
          "ru": "Флакон + Трава"
        }
      ]
    },
    {
      "id": "vial_blossom_elixir",
      "ingredients": [
        "vial",
        "blossom"
      ],
      "result": "elixir",
      "why": {
        "en": "The blossom fills its vial with a storybook promise of new growth.",
        "ru": "Цветок наполняет флакон сказочным обещанием нового роста."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Give a fleeting bloom a way to be kept.",
          "ru": "Найдите способ сберечь мимолётное цветение."
        },
        {
          "en": "Start with Blossom: its lively character is worth keeping.",
          "ru": "Начните с образца «Цветок»: его живость стоит сохранить."
        },
        {
          "en": "Vial + Blossom",
          "ru": "Флакон + Цветок"
        }
      ]
    },
    {
      "id": "glass_spark_lens",
      "ingredients": [
        "glass",
        "spark"
      ],
      "result": "lens",
      "why": {
        "en": "A spark teaches the glass where to gather its shine: the workshop makes a lens.",
        "ru": "Искра учит стекло собирать сияние в одной точке: мастерская создаёт линзу."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Give a clear surface a single point of attention.",
          "ru": "Помогите прозрачной поверхности сосредоточиться на одной точке."
        },
        {
          "en": "Start with Glass: it lets you see through it.",
          "ru": "Начните с образца «Стекло»: сквозь него можно смотреть."
        },
        {
          "en": "Glass + Spark",
          "ru": "Стекло + Искра"
        }
      ]
    },
    {
      "id": "lens_cloud_astrolabe",
      "ingredients": [
        "lens",
        "cloud"
      ],
      "result": "astrolabe",
      "why": {
        "en": "The lens follows the cloud’s skyward path and dreams up an astrolabe.",
        "ru": "Линза следит за небесным путём облака и придумывает астролябию."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Turn a close look into a way of reading the sky.",
          "ru": "Превратите пристальный взгляд в способ читать небо."
        },
        {
          "en": "Start with Lens: where could you point its view?",
          "ru": "Начните с образца «Линза»: куда можно направить взгляд?"
        },
        {
          "en": "Lens + Cloud",
          "ru": "Линза + Облако"
        }
      ]
    },
    {
      "id": "crystal_elixir_philosopher_stone",
      "ingredients": [
        "crystal",
        "elixir"
      ],
      "result": "philosopher_stone",
      "why": {
        "en": "The elixir fills the crystal with possibilities, the secret of this storybook stone.",
        "ru": "Эликсир наполняет кристалл возможностями — секретом этого сказочного камня."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Give a perfect shape a promise of transformation.",
          "ru": "Подарите совершенной форме обещание превращений."
        },
        {
          "en": "Start with Elixir: it carries the idea of renewal.",
          "ru": "Начните с образца «Эликсир»: он хранит идею обновления."
        },
        {
          "en": "Crystal + Elixir",
          "ru": "Кристалл + Эликсир"
        }
      ]
    },
    {
      "id": "geode_astrolabe_philosopher_stone",
      "ingredients": [
        "geode",
        "astrolabe"
      ],
      "result": "philosopher_stone",
      "why": {
        "en": "A hidden world inside the geode meets the astrolabe’s sky: a stone of possibilities.",
        "ru": "Скрытый мир жеоды встречает небо астролябии: рождается камень возможностей."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Bring a hidden inner world into conversation with the sky.",
          "ru": "Познакомьте скрытый внутренний мир с небом."
        },
        {
          "en": "Start with Geode: a whole little world waits inside.",
          "ru": "Начните с образца «Жеода»: внутри ждёт маленький мир."
        },
        {
          "en": "Geode + Astrolabe",
          "ru": "Жеода + Астролябия"
        }
      ]
    },
    {
      "id": "breeze_droplet_cloud",
      "ingredients": [
        "breeze",
        "droplet"
      ],
      "result": "cloud",
      "why": {
        "en": "The breeze carries a droplet skyward, where the workshop imagines a cloud.",
        "ru": "Бриз уносит каплю в небо, где мастерская воображает облако."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Help something wet leave the ground and float.",
          "ru": "Помогите чему-то влажному подняться над землёй и поплыть."
        },
        {
          "en": "Start with Breeze: it can give things a lift.",
          "ru": "Начните с образца «Бриз»: он умеет поднимать лёгкое."
        },
        {
          "en": "Breeze + Droplet",
          "ru": "Бриз + Капля"
        }
      ]
    },
    {
      "id": "breeze_dew_cloud",
      "ingredients": [
        "breeze",
        "dew"
      ],
      "result": "cloud",
      "why": {
        "en": "The breeze gathers dew into a little floating dream of a cloud.",
        "ru": "Бриз собирает росу в маленькую плывущую мечту об облаке."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Gather scattered moisture into something airborne.",
          "ru": "Соберите рассеянную влагу во что-то парящее."
        },
        {
          "en": "Start with Dew: imagine its freshness above the garden.",
          "ru": "Начните с образца «Роса»: представьте его свежесть над садом."
        },
        {
          "en": "Breeze + Dew",
          "ru": "Бриз + Роса"
        }
      ]
    },
    {
      "id": "cloud_ember_spark",
      "ingredients": [
        "cloud",
        "ember"
      ],
      "result": "spark",
      "why": {
        "en": "A warm ember wakes a mischievous spark in this storybook cloud.",
        "ru": "Тёплый уголёк будит озорную искру в сказочном облаке."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Wake a little flash inside a drifting softness.",
          "ru": "Разбудите маленькую вспышку внутри плывущей мягкости."
        },
        {
          "en": "Start with Cloud: what could wake its sleepy mood?",
          "ru": "Начните с образца «Облако»: что разбудит его сонное настроение?"
        },
        {
          "en": "Cloud + Ember",
          "ru": "Облако + Уголёк"
        }
      ]
    },
    {
      "id": "cloud_spark_bolt",
      "ingredients": [
        "cloud",
        "spark"
      ],
      "result": "bolt",
      "why": {
        "en": "The cloud gives a tiny spark room for one bold burst.",
        "ru": "Облако даёт маленькой искре простор для смелого разряда."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Give a tiny flash room to make a sudden leap.",
          "ru": "Дайте маленькой вспышке простор для резкого скачка."
        },
        {
          "en": "Start with Spark: it is restless and wants room.",
          "ru": "Начните с образца «Искра»: ему не сидится на месте."
        },
        {
          "en": "Cloud + Spark",
          "ru": "Облако + Искра"
        }
      ]
    },
    {
      "id": "ore_coal_forge",
      "ingredients": [
        "ore",
        "coal"
      ],
      "result": "forge",
      "why": {
        "en": "Ore brings the work and coal brings the warmth: together they suggest a forge.",
        "ru": "Руда приносит работу, уголь — тепло: вместе они подсказывают замысел кузни."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Bring a hidden material together with a lasting warmth.",
          "ru": "Соедините скрытый материал с долгим теплом."
        },
        {
          "en": "Start with Ore: its hidden metal needs a working place.",
          "ru": "Начните с образца «Руда»: скрытому металлу нужно рабочее место."
        },
        {
          "en": "Ore + Coal",
          "ru": "Руда + Уголь"
        }
      ]
    },
    {
      "id": "forge_crystal_sunshard",
      "ingredients": [
        "forge",
        "crystal"
      ],
      "result": "sunshard",
      "why": {
        "en": "The forge gives a crystal the warm glow of a captured piece of day.",
        "ru": "Кузня дарит кристаллу тёплый блеск пойманной частицы дня."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Let a clear, ordered shape remember a powerful warmth.",
          "ru": "Позвольте прозрачной стройной форме запомнить сильное тепло."
        },
        {
          "en": "Start with Crystal: imagine its shine becoming warm.",
          "ru": "Начните с образца «Кристалл»: представьте, как его блеск согревает."
        },
        {
          "en": "Forge + Crystal",
          "ru": "Кузня + Кристалл"
        }
      ]
    },
    {
      "id": "sunshard_tide_rainstone",
      "ingredients": [
        "sunshard",
        "tide"
      ],
      "result": "rainstone",
      "why": {
        "en": "The tide cools the sunshard’s story into a stone that remembers rain.",
        "ru": "Прилив остужает историю солнечного осколка до камня, который помнит дождь."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Give stored daytime a memory of returning water.",
          "ru": "Подарите сохранённому дню память о возвращающейся воде."
        },
        {
          "en": "Start with Sunshard: it has a warm memory to share.",
          "ru": "Начните с образца «Солнечный осколок»: ему есть чем согреть воспоминание."
        },
        {
          "en": "Sunshard + Tide",
          "ru": "Солнечный осколок + Прилив"
        }
      ]
    },
    {
      "id": "rainstone_storm_cell_aurora",
      "ingredients": [
        "rainstone",
        "storm_cell"
      ],
      "result": "aurora",
      "why": {
        "en": "The rainstone spills its colours through the storm, painting a storybook aurora.",
        "ru": "Камень дождя разливает краски по буре и рисует сказочное сияние."
      },
      "source": "existing cross-reaction",
      "hints": [
        {
          "en": "Turn a restless sky into a moving ribbon of colour.",
          "ru": "Превратите беспокойное небо в движущуюся цветную ленту."
        },
        {
          "en": "Start with Rainstone: imagine releasing its hidden shimmer.",
          "ru": "Начните с образца «Камень дождя»: выпустите его скрытое мерцание."
        },
        {
          "en": "Rainstone + Storm Cell",
          "ru": "Камень дождя + Грозовая ячейка"
        }
      ]
    },
    {
      "id": "v3_sprout_dew_herb",
      "ingredients": [
        "sprout",
        "dew"
      ],
      "result": "herb",
      "why": {
        "en": "Dew helps the sprout unfurl into a fuller patch of green.",
        "ru": "Роса помогает ростку развернуться в густую траву."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Help a tender beginning grow fuller and leafier.",
          "ru": "Помогите нежному началу стать гуще и зеленее."
        },
        {
          "en": "Start with Sprout: it still has room to grow.",
          "ru": "Начните с образца «Росток»: ему ещё есть куда расти."
        },
        {
          "en": "Sprout + Dew",
          "ru": "Росток + Роса"
        }
      ]
    },
    {
      "id": "v3_herb_light_blossom",
      "ingredients": [
        "herb",
        "light"
      ],
      "result": "blossom",
      "why": {
        "en": "Light invites the herb to reveal its hidden blossom.",
        "ru": "Свет приглашает траву раскрыть спрятанный цветок."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Invite greenery to show a brighter side of itself.",
          "ru": "Предложите зелени показать свою яркую сторону."
        },
        {
          "en": "Start with Herb: imagine what it could open toward.",
          "ru": "Начните с образца «Трава»: навстречу чему он может раскрыться?"
        },
        {
          "en": "Herb + Light",
          "ru": "Трава + Свет"
        }
      ]
    },
    {
      "id": "v3_herb_stream_vine",
      "ingredients": [
        "herb",
        "stream"
      ],
      "result": "vine",
      "why": {
        "en": "The herb follows the stream’s long path and learns the reach of a vine.",
        "ru": "Трава следует длинному пути ручья и учится тянуться, как лоза."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Teach short shoots to follow a long, winding path.",
          "ru": "Научите короткие побеги следовать длинному извилистому пути."
        },
        {
          "en": "Start with Stream: it knows how to stretch across a place.",
          "ru": "Начните с образца «Ручей»: он знает, как протянуться через весь уголок."
        },
        {
          "en": "Herb + Stream",
          "ru": "Трава + Ручей"
        }
      ]
    },
    {
      "id": "v3_vine_sprout_grove",
      "ingredients": [
        "vine",
        "sprout"
      ],
      "result": "grove",
      "why": {
        "en": "The vine gives a young sprout company, and the workshop imagines a grove.",
        "ru": "Лоза составляет компанию молодому ростку, и мастерская воображает рощу."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Help a young green life become part of a leafy shelter.",
          "ru": "Помогите молодой зелени стать частью лиственного укрытия."
        },
        {
          "en": "Start with Vine: it can weave a welcoming green frame.",
          "ru": "Начните с образца «Лоза»: из него выйдет гостеприимный зелёный каркас."
        },
        {
          "en": "Vine + Sprout",
          "ru": "Лоза + Росток"
        }
      ]
    },
    {
      "id": "v3_blossom_elixir_lifebloom",
      "ingredients": [
        "blossom",
        "elixir"
      ],
      "result": "lifebloom",
      "why": {
        "en": "An enchanted elixir gives the blossom a story that begins again.",
        "ru": "Зачарованный эликсир дарит цветку историю, которая начинается заново."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Give fleeting beauty the promise of another beginning.",
          "ru": "Подарите мимолётной красоте обещание нового начала."
        },
        {
          "en": "Start with Blossom: imagine its beauty returning.",
          "ru": "Начните с образца «Цветок»: представьте возвращение его красоты."
        },
        {
          "en": "Blossom + Elixir",
          "ru": "Цветок + Эликсир"
        }
      ]
    },
    {
      "id": "v3_grove_ocean_heart_world_tree",
      "ingredients": [
        "grove",
        "ocean_heart"
      ],
      "result": "world_tree",
      "why": {
        "en": "The ocean heart lends the grove a deep rhythm, and its roots dream of holding a world.",
        "ru": "Сердце океана дарит роще глубинный ритм, и корни мечтают удержать целый мир."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Give a leafy shelter roots as far-reaching as a whole world.",
          "ru": "Подарите лиственному укрытию корни величиной с целый мир."
        },
        {
          "en": "Start with Grove: imagine nourishment far beyond its edges.",
          "ru": "Начните с образца «Роща»: представьте питание далеко за его краями."
        },
        {
          "en": "Grove + Ocean Heart",
          "ru": "Роща + Сердце океана"
        }
      ]
    },
    {
      "id": "v3_mud_breeze_clay",
      "ingredients": [
        "mud",
        "breeze"
      ],
      "result": "clay",
      "why": {
        "en": "In the workshop’s tale, the breeze coaxes mud into shape-holding clay.",
        "ru": "В сказке мастерской бриз уговаривает грязь стать глиной, которая держит форму."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Make a damp lump easier to shape without making it hard.",
          "ru": "Сделайте влажный комок удобнее для лепки, не превращая его в твёрдый."
        },
        {
          "en": "Start with Mud: it needs a little breathing room.",
          "ru": "Начните с образца «Грязь»: дайте ему немного подышать."
        },
        {
          "en": "Mud + Breeze",
          "ru": "Грязь + Бриз"
        }
      ]
    },
    {
      "id": "v3_stone_breeze_sand",
      "ingredients": [
        "stone",
        "breeze"
      ],
      "result": "sand",
      "why": {
        "en": "The workshop’s patient breeze tells a stone’s long story as grains of sand.",
        "ru": "Терпеливый бриз мастерской пересказывает долгую историю камня песчинками."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Imagine a patient movement wearing something solid into grains.",
          "ru": "Представьте, как терпеливое движение стирает твёрдое в крупинки."
        },
        {
          "en": "Start with Stone: even a hard edge has a long story.",
          "ru": "Начните с образца «Камень»: даже у твёрдой грани есть долгая история."
        },
        {
          "en": "Stone + Breeze",
          "ru": "Камень + Бриз"
        }
      ]
    },
    {
      "id": "v3_clay_flame_stone",
      "ingredients": [
        "clay",
        "flame"
      ],
      "result": "stone",
      "why": {
        "en": "In this workshop tale, flame gives soft clay a stone’s lasting strength.",
        "ru": "В этой сказке мастерской пламя дарит мягкой глине долгую крепость камня."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Trade a yielding shape for a lasting hardness.",
          "ru": "Смените податливость формы на долгую твёрдость."
        },
        {
          "en": "Start with Clay: it can take a shape before it hardens.",
          "ru": "Начните с образца «Глина»: ему можно придать форму до затвердения."
        },
        {
          "en": "Clay + Flame",
          "ru": "Глина + Пламя"
        }
      ]
    },
    {
      "id": "v3_stone_flame_ore",
      "ingredients": [
        "stone",
        "flame"
      ],
      "result": "ore",
      "why": {
        "en": "The workshop’s flame reveals the metal the stone has been dreaming of.",
        "ru": "Пламя мастерской открывает металл, о котором мечтал камень."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Ask a hard surface to reveal what it hides inside.",
          "ru": "Попросите твёрдую поверхность открыть то, что спрятано внутри."
        },
        {
          "en": "Start with Stone: imagine a useful secret beneath its surface.",
          "ru": "Начните с образца «Камень»: представьте полезный секрет под поверхностью."
        },
        {
          "en": "Stone + Flame",
          "ru": "Камень + Пламя"
        }
      ]
    },
    {
      "id": "v3_glass_elixir_crystal",
      "ingredients": [
        "glass",
        "elixir"
      ],
      "result": "crystal",
      "why": {
        "en": "The enchanted elixir teaches smooth glass to grow ordered facets.",
        "ru": "Зачарованный эликсир учит гладкое стекло отращивать стройные грани."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Give something clear a new, carefully ordered shape.",
          "ru": "Придайте чему-то прозрачному новую, стройную форму."
        },
        {
          "en": "Start with Glass: imagine its smoothness growing facets.",
          "ru": "Начните с образца «Стекло»: представьте, как гладкость обрастает гранями."
        },
        {
          "en": "Glass + Elixir",
          "ru": "Стекло + Эликсир"
        }
      ]
    },
    {
      "id": "v3_crystal_stone_geode",
      "ingredients": [
        "crystal",
        "stone"
      ],
      "result": "geode",
      "why": {
        "en": "The stone becomes a quiet shell around the crystal’s secret sparkle.",
        "ru": "Камень становится тихой оболочкой вокруг тайного блеска кристалла."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Hide a little brightness inside a rugged shelter.",
          "ru": "Спрячьте немного блеска в прочном укрытии."
        },
        {
          "en": "Start with Crystal: its sparkle could become a hidden treasure.",
          "ru": "Начните с образца «Кристалл»: его блеск может стать скрытым сокровищем."
        },
        {
          "en": "Crystal + Stone",
          "ru": "Кристалл + Камень"
        }
      ]
    },
    {
      "id": "v3_stone_stone_monolith",
      "ingredients": [
        "stone",
        "stone"
      ],
      "result": "monolith",
      "why": {
        "en": "Two stones lend each other their weight and imagine one unbroken monolith.",
        "ru": "Два камня складывают свой вес и воображают единый монолит."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Bring separate weight together into one unbroken whole.",
          "ru": "Соберите раздельный вес в одно нерушимое целое."
        },
        {
          "en": "Start with Stone: think about its solid weight.",
          "ru": "Начните с образца «Камень»: ощутите его тяжесть."
        },
        {
          "en": "Stone + Stone",
          "ru": "Камень + Камень"
        }
      ]
    },
    {
      "id": "v3_dew_dew_droplet",
      "ingredients": [
        "dew",
        "dew"
      ],
      "result": "droplet",
      "why": {
        "en": "Tiny beads of dew gather into a single round droplet.",
        "ru": "Мелкие бусины росы собираются в одну круглую каплю."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Gather little beads of moisture into one larger shape.",
          "ru": "Соберите маленькие бусины влаги в одну крупную форму."
        },
        {
          "en": "Start with Dew: notice the little beads on its surface.",
          "ru": "Начните с образца «Роса»: присмотритесь к его маленьким бусинам."
        },
        {
          "en": "Dew + Dew",
          "ru": "Роса + Роса"
        }
      ]
    },
    {
      "id": "v3_droplet_droplet_stream",
      "ingredients": [
        "droplet",
        "droplet"
      ],
      "result": "stream",
      "why": {
        "en": "Droplets stop standing alone and find a shared flowing path.",
        "ru": "Капли перестают стоять порознь и находят общий текучий путь."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Help separate little pools find a shared direction.",
          "ru": "Помогите отдельным лужицам найти общее направление."
        },
        {
          "en": "Start with Droplet: imagine it no longer standing alone.",
          "ru": "Начните с образца «Капля»: представьте его уже не одиноким."
        },
        {
          "en": "Droplet + Droplet",
          "ru": "Капля + Капля"
        }
      ]
    },
    {
      "id": "v3_stream_stone_spring",
      "ingredients": [
        "stream",
        "stone"
      ],
      "result": "spring",
      "why": {
        "en": "The stream finds a doorway through stone and becomes a spring.",
        "ru": "Ручей находит проход сквозь камень и становится источником."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Give flowing water a doorway from below.",
          "ru": "Найдите для текущей воды выход снизу."
        },
        {
          "en": "Start with Stream: it is looking for a place to emerge.",
          "ru": "Начните с образца «Ручей»: он ищет место, откуда появиться."
        },
        {
          "en": "Stream + Stone",
          "ru": "Ручей + Камень"
        }
      ]
    },
    {
      "id": "v3_spring_clay_pond",
      "ingredients": [
        "spring",
        "clay"
      ],
      "result": "pond",
      "why": {
        "en": "Clay holds the spring’s water in a broad, quiet pond.",
        "ru": "Глина удерживает воду источника в широком тихом пруду."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Give fresh flowing water somewhere to rest.",
          "ru": "Дайте свежей текущей воде место для покоя."
        },
        {
          "en": "Start with Spring: its water needs a holding shape.",
          "ru": "Начните с образца «Источник»: его воде нужна удерживающая форма."
        },
        {
          "en": "Spring + Clay",
          "ru": "Источник + Глина"
        }
      ]
    },
    {
      "id": "v3_pond_astrolabe_tide",
      "ingredients": [
        "pond",
        "astrolabe"
      ],
      "result": "tide",
      "why": {
        "en": "The astrolabe lends the pond a sky-written rhythm: water learns to come and go.",
        "ru": "Астролябия дарит пруду небесный ритм: вода учится приходить и уходить."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Teach still water to follow a repeating heavenly rhythm.",
          "ru": "Научите спокойную воду следовать повторяющемуся небесному ритму."
        },
        {
          "en": "Start with Pond: what could give its stillness a rhythm?",
          "ru": "Начните с образца «Пруд»: что подарит его покою ритм?"
        },
        {
          "en": "Pond + Astrolabe",
          "ru": "Пруд + Астролябия"
        }
      ]
    },
    {
      "id": "v3_tide_crystal_ocean_heart",
      "ingredients": [
        "tide",
        "crystal"
      ],
      "result": "ocean_heart",
      "why": {
        "en": "A crystal keeps the tide’s returning rhythm as a shining ocean heart.",
        "ru": "Кристалл сохраняет ритм возвращающегося прилива в сияющем сердце океана."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Keep the rhythm of returning water inside a lasting shape.",
          "ru": "Сохраните ритм возвращающейся воды в прочной форме."
        },
        {
          "en": "Start with Tide: imagine carrying its rhythm in your hand.",
          "ru": "Начните с образца «Прилив»: представьте его ритм у себя в ладони."
        },
        {
          "en": "Tide + Crystal",
          "ru": "Прилив + Кристалл"
        }
      ]
    },
    {
      "id": "v3_ember_breeze_flame",
      "ingredients": [
        "ember",
        "breeze"
      ],
      "result": "flame",
      "why": {
        "en": "The breeze gives the ember a breath, and its glow begins to dance.",
        "ru": "Бриз даёт угольку дыхание, и его огонёк начинает танцевать."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Help a sleepy warmth stand up and dance.",
          "ru": "Помогите сонному теплу подняться и затанцевать."
        },
        {
          "en": "Start with Ember: its warmth is waiting to stir.",
          "ru": "Начните с образца «Уголёк»: его тепло ждёт движения."
        },
        {
          "en": "Ember + Breeze",
          "ru": "Уголёк + Бриз"
        }
      ]
    },
    {
      "id": "v3_herb_ember_coal",
      "ingredients": [
        "herb",
        "ember"
      ],
      "result": "coal",
      "why": {
        "en": "In the workshop’s slow warmth, herb trades its green for a dark, porous memory.",
        "ru": "В медленном тепле мастерской трава меняет зелень на тёмную пористую память."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Let greenery leave a dark memory of itself.",
          "ru": "Позвольте зелени оставить тёмную память о себе."
        },
        {
          "en": "Start with Herb: imagine what remains after its green fades.",
          "ru": "Начните с образца «Трава»: представьте, что остаётся после зелени."
        },
        {
          "en": "Herb + Ember",
          "ru": "Трава + Уголёк"
        }
      ]
    },
    {
      "id": "v3_brick_flame_kiln",
      "ingredients": [
        "brick",
        "flame"
      ],
      "result": "kiln",
      "why": {
        "en": "Brick gives flame a room that can hold its warmth: a kiln.",
        "ru": "Кирпич дарит пламени комнату, способную удержать тепло: печь."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Give dancing heat a sturdy room of its own.",
          "ru": "Подарите танцующему жару собственную крепкую комнату."
        },
        {
          "en": "Start with Brick: it can make walls that remember warmth.",
          "ru": "Начните с образца «Кирпич»: из него выйдут стены, которые помнят тепло."
        },
        {
          "en": "Brick + Flame",
          "ru": "Кирпич + Пламя"
        }
      ]
    },
    {
      "id": "v3_kiln_ore_forge",
      "ingredients": [
        "kiln",
        "ore"
      ],
      "result": "forge",
      "why": {
        "en": "Ore gives the kiln a new purpose: the workshop imagines a forge.",
        "ru": "Руда даёт печи новую цель: мастерская воображает кузню."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Give a place of heat some hidden metal to work with.",
          "ru": "Найдите для места жара скрытый металл, с которым можно работать."
        },
        {
          "en": "Start with Kiln: its warmth is ready for a new craft.",
          "ru": "Начните с образца «Печь»: его тепло готово к новому ремеслу."
        },
        {
          "en": "Kiln + Ore",
          "ru": "Печь + Руда"
        }
      ]
    },
    {
      "id": "v3_lifebloom_flame_phoenix_ash",
      "ingredients": [
        "lifebloom",
        "flame"
      ],
      "result": "phoenix_ash",
      "why": {
        "en": "Even in flame, the lifebloom keeps a promise of return in its phoenix ash.",
        "ru": "Даже в пламени живоцвет сохраняет обещание возвращения в пепле феникса."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Imagine a living promise surviving a fiery ending.",
          "ru": "Представьте живое обещание, пережившее огненный конец."
        },
        {
          "en": "Start with Lifebloom: its story always finds another beginning.",
          "ru": "Начните с образца «Живоцвет»: его история всегда находит новое начало."
        },
        {
          "en": "Lifebloom + Flame",
          "ru": "Живоцвет + Пламя"
        }
      ]
    },
    {
      "id": "v3_sunshard_light_solar_core",
      "ingredients": [
        "sunshard",
        "light"
      ],
      "result": "solar_core",
      "why": {
        "en": "Light fills the sunshard’s promise until it holds a steady little sun.",
        "ru": "Свет исполняет обещание солнечного осколка, пока тот не удерживает маленькое ровное солнце."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Help stored daytime become a steady source of its own.",
          "ru": "Помогите сохранённому дню стать собственным ровным источником."
        },
        {
          "en": "Start with Sunshard: it already remembers a little daytime.",
          "ru": "Начните с образца «Солнечный осколок»: он уже помнит частицу дня."
        },
        {
          "en": "Sunshard + Light",
          "ru": "Солнечный осколок + Свет"
        }
      ]
    },
    {
      "id": "v3_bolt_crystal_lightning",
      "ingredients": [
        "bolt",
        "crystal"
      ],
      "result": "lightning",
      "why": {
        "en": "The crystal gives a brief bolt a bold, branching shape in the workshop sky.",
        "ru": "Кристалл дарит короткому разряду смелую ветвистую форму в небе мастерской."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Give a sudden burst a bright, branching shape.",
          "ru": "Придайте внезапному всплеску яркую ветвистую форму."
        },
        {
          "en": "Start with Bolt: imagine its quick leap taking a shape.",
          "ru": "Начните с образца «Разряд»: представьте форму его резкого скачка."
        },
        {
          "en": "Bolt + Crystal",
          "ru": "Разряд + Кристалл"
        }
      ]
    },
    {
      "id": "v3_cloud_lightning_storm_cell",
      "ingredients": [
        "cloud",
        "lightning"
      ],
      "result": "storm_cell",
      "why": {
        "en": "Lightning gives the cloud a dramatic mood, and a pocket storm gathers.",
        "ru": "Молния дарит облаку грозное настроение, и собирается карманная буря."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Wake a whole skyful of weather in something drifting.",
          "ru": "Разбудите целое небо непогоды внутри чего-то плывущего."
        },
        {
          "en": "Start with Cloud: what could make its quiet sky restless?",
          "ru": "Начните с образца «Облако»: что встревожит его тихое небо?"
        },
        {
          "en": "Cloud + Lightning",
          "ru": "Облако + Молния"
        }
      ]
    },
    {
      "id": "v3_storm_cell_astrolabe_tempest_crown",
      "ingredients": [
        "storm_cell",
        "astrolabe"
      ],
      "result": "tempest_crown",
      "why": {
        "en": "The astrolabe gives the storm a sky-written rhythm and a crown to keep it.",
        "ru": "Астролябия задаёт буре небесный ритм и дарит корону, чтобы его хранить."
      },
      "source": "proposed legacy bridge",
      "hints": [
        {
          "en": "Give wild weather a pattern it can follow.",
          "ru": "Предложите дикой непогоде узор, которому можно следовать."
        },
        {
          "en": "Start with Storm Cell: even its swirling could find a rhythm.",
          "ru": "Начните с образца «Грозовая ячейка»: даже вихрь может обрести ритм."
        },
        {
          "en": "Storm Cell + Astrolabe",
          "ru": "Грозовая ячейка + Астролябия"
        }
      ]
    },
    {
      "id": "v3_lens_spark_light",
      "ingredients": [
        "lens",
        "spark"
      ],
      "result": "light",
      "why": {
        "en": "The lens gathers the spark’s brief flash into a clear beam.",
        "ru": "Линза собирает короткую вспышку искры в ясный луч."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Give a fleeting flash a clear direction.",
          "ru": "Задайте мимолётной вспышке ясное направление."
        },
        {
          "en": "Start with Spark: its brightness is brief and scattered.",
          "ru": "Начните с образца «Искра»: его вспышка коротка и рассеянна."
        },
        {
          "en": "Lens + Spark",
          "ru": "Линза + Искра"
        }
      ]
    },
    {
      "id": "v3_flame_lens_light",
      "ingredients": [
        "flame",
        "lens"
      ],
      "result": "light",
      "why": {
        "en": "A lens borrows the flame’s glow and gives it a direction.",
        "ru": "Линза заимствует сияние пламени и задаёт ему направление."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Guide a dancing glow into a steady direction.",
          "ru": "Направьте танцующее сияние в одну сторону."
        },
        {
          "en": "Start with Flame: its glow reaches in every direction.",
          "ru": "Начните с образца «Пламя»: его сияние тянется во все стороны."
        },
        {
          "en": "Flame + Lens",
          "ru": "Пламя + Линза"
        }
      ]
    },
    {
      "id": "v3_light_dew_firefly",
      "ingredients": [
        "light",
        "dew"
      ],
      "result": "firefly",
      "why": {
        "en": "In this storybook workshop, dew gives a speck of light a little beetle’s life.",
        "ru": "В сказочной мастерской роса дарит частице света жизнь маленького жучка."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Imagine a tiny glow waking into a moving creature.",
          "ru": "Представьте, как маленький огонёк просыпается подвижным существом."
        },
        {
          "en": "Start with Light: imagine its smallest piece coming alive.",
          "ru": "Начните с образца «Свет»: представьте ожившую крошку сияния."
        },
        {
          "en": "Light + Dew",
          "ru": "Свет + Роса"
        }
      ]
    },
    {
      "id": "v3_light_lifebloom_firefly",
      "ingredients": [
        "light",
        "lifebloom"
      ],
      "result": "firefly",
      "why": {
        "en": "The lifebloom lends light a little beetle’s body in the workshop’s living tale.",
        "ru": "В живой сказке мастерской живоцвет дарит свету тело маленького жучка."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Give a weightless glow a tiny living body.",
          "ru": "Подарите невесомому огоньку маленькое живое тело."
        },
        {
          "en": "Start with Lifebloom: it carries the promise of new life.",
          "ru": "Начните с образца «Живоцвет»: он хранит обещание новой жизни."
        },
        {
          "en": "Light + Lifebloom",
          "ru": "Свет + Живоцвет"
        }
      ]
    },
    {
      "id": "v3_firefly_vial_glow_lantern",
      "ingredients": [
        "firefly",
        "vial"
      ],
      "result": "glow_lantern",
      "why": {
        "en": "The firefly’s glow finds a clear little shelter and becomes a living lantern.",
        "ru": "Огонёк светлячка находит прозрачное укрытие и становится живым фонарём."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Give a wandering glow a clear place to rest.",
          "ru": "Дайте блуждающему огоньку прозрачное место для отдыха."
        },
        {
          "en": "Start with Firefly: imagine a shelter for its gentle glow.",
          "ru": "Начните с образца «Светлячок»: представьте укрытие для его мягкого огонька."
        },
        {
          "en": "Firefly + Vial",
          "ru": "Светлячок + Флакон"
        }
      ]
    },
    {
      "id": "v3_light_vial_glow_lantern",
      "ingredients": [
        "light",
        "vial"
      ],
      "result": "glow_lantern",
      "why": {
        "en": "The vial keeps a little light as the warm heart of a storybook lantern.",
        "ru": "Флакон сохраняет немного света как тёплое сердце сказочного фонаря."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Keep a little brightness somewhere it can be carried.",
          "ru": "Сохраните немного сияния так, чтобы его можно было унести."
        },
        {
          "en": "Start with Vial: it knows how to hold delicate things.",
          "ru": "Начните с образца «Флакон»: он умеет хранить хрупкое."
        },
        {
          "en": "Light + Vial",
          "ru": "Свет + Флакон"
        }
      ]
    },
    {
      "id": "v3_vine_stone_thread_fiber",
      "ingredients": [
        "vine",
        "stone"
      ],
      "result": "thread_fiber",
      "why": {
        "en": "The stone teases the vine’s long fibres apart into a useful thread.",
        "ru": "Камень разделяет длинные волокна лозы на полезную нить."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Find something fine and flexible inside a tough green strand.",
          "ru": "Найдите тонкое и гибкое внутри крепкого зелёного побега."
        },
        {
          "en": "Start with Vine: look at its long fibres.",
          "ru": "Начните с образца «Лоза»: присмотритесь к его длинным волокнам."
        },
        {
          "en": "Vine + Stone",
          "ru": "Лоза + Камень"
        }
      ]
    },
    {
      "id": "v3_thread_fiber_thread_fiber_cloth_weave",
      "ingredients": [
        "thread_fiber",
        "thread_fiber"
      ],
      "result": "cloth_weave",
      "why": {
        "en": "Threads cross and hold each other, making cloth from a little patience.",
        "ru": "Нити перекрещиваются и держат друг друга, создавая ткань из капли терпения."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Make narrow, flexible strands hold together side by side.",
          "ru": "Помогите узким гибким волокнам держаться рядом."
        },
        {
          "en": "Start with Thread: imagine the pattern it could follow.",
          "ru": "Начните с образца «Нить»: представьте узор, которому он может следовать."
        },
        {
          "en": "Thread + Thread",
          "ru": "Нить + Нить"
        }
      ]
    },
    {
      "id": "v3_cloth_weave_cloud_cushion",
      "ingredients": [
        "cloth_weave",
        "cloud"
      ],
      "result": "cushion",
      "why": {
        "en": "Cloth keeps the cloud’s impossible softness in the shape of a cushion.",
        "ru": "Ткань удерживает невозможную мягкость облака в форме подушки."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Give floating softness a cover that can keep it close.",
          "ru": "Подарите парящей мягкости оболочку, которая удержит её рядом."
        },
        {
          "en": "Start with Cloud: imagine being able to rest against its softness.",
          "ru": "Начните с образца «Облако»: представьте, что на его мягкость можно опереться."
        },
        {
          "en": "Cloth + Cloud",
          "ru": "Ткань + Облако"
        }
      ]
    },
    {
      "id": "v3_cloth_weave_breeze_cushion",
      "ingredients": [
        "cloth_weave",
        "breeze"
      ],
      "result": "cushion",
      "why": {
        "en": "The breeze fills the cloth with a soft breath, and the workshop makes a cushion.",
        "ru": "Бриз наполняет ткань мягким дыханием, и мастерская создаёт подушку."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Give something woven a soft, airy fullness.",
          "ru": "Подарите чему-то тканому мягкую воздушную полноту."
        },
        {
          "en": "Start with Cloth: it can wrap around an empty space.",
          "ru": "Начните с образца «Ткань»: он может обнять пустое пространство."
        },
        {
          "en": "Cloth + Breeze",
          "ru": "Ткань + Бриз"
        }
      ]
    },
    {
      "id": "v3_breeze_vial_sound",
      "ingredients": [
        "breeze",
        "vial"
      ],
      "result": "sound",
      "why": {
        "en": "The breeze passes the vial’s narrow neck, and an empty vessel finds its voice.",
        "ru": "Бриз проходит у узкого горлышка флакона, и пустой сосуд обретает голос."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Help an empty vessel find its voice.",
          "ru": "Помогите пустому сосуду обрести голос."
        },
        {
          "en": "Start with Breeze: its movement can set something vibrating.",
          "ru": "Начните с образца «Бриз»: его движение может вызвать вибрацию."
        },
        {
          "en": "Breeze + Vial",
          "ru": "Бриз + Флакон"
        }
      ]
    },
    {
      "id": "v3_breeze_glass_sound",
      "ingredients": [
        "breeze",
        "glass"
      ],
      "result": "sound",
      "why": {
        "en": "In the workshop, the breeze nudges the glass awake with a clear little note.",
        "ru": "В мастерской бриз будит стекло лёгким толчком, и оно отвечает чистой нотой."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Nudge a quiet, clear surface until it answers.",
          "ru": "Легонько толкните тихую прозрачную поверхность, чтобы она ответила."
        },
        {
          "en": "Start with Glass: imagine its smooth surface trembling.",
          "ru": "Начните с образца «Стекло»: представьте, как дрожит его гладкая поверхность."
        },
        {
          "en": "Breeze + Glass",
          "ru": "Бриз + Стекло"
        }
      ]
    },
    {
      "id": "v3_sound_stone_echo",
      "ingredients": [
        "sound",
        "stone"
      ],
      "result": "echo",
      "why": {
        "en": "The stone answers the sound by sending its voice back.",
        "ru": "Камень отвечает звуку, возвращая его голос."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Find a hard surface that can answer a voice.",
          "ru": "Найдите твёрдую поверхность, которая может ответить голосу."
        },
        {
          "en": "Start with Sound: imagine hearing it return.",
          "ru": "Начните с образца «Звук»: представьте, что слышите его возвращение."
        },
        {
          "en": "Sound + Stone",
          "ru": "Звук + Камень"
        }
      ]
    },
    {
      "id": "v3_sound_monolith_echo",
      "ingredients": [
        "sound",
        "monolith"
      ],
      "result": "echo",
      "why": {
        "en": "The monolith lends a passing sound a long, returning voice.",
        "ru": "Монолит дарит проходящему звуку долгий возвращающийся голос."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Give a brief voice a grand place to return from.",
          "ru": "Дайте короткому голосу большое место, откуда можно вернуться."
        },
        {
          "en": "Start with Monolith: its broad face could answer a call.",
          "ru": "Начните с образца «Монолит»: его широкая грань может ответить на зов."
        },
        {
          "en": "Sound + Monolith",
          "ru": "Звук + Монолит"
        }
      ]
    },
    {
      "id": "v3_glass_sound_wind_chime",
      "ingredients": [
        "glass",
        "sound"
      ],
      "result": "wind_chime",
      "why": {
        "en": "Glass borrows sound’s voice, and the workshop hangs it as wind chimes.",
        "ru": "Стекло заимствует голос звука, и мастерская подвешивает его как музыку ветра."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Give a clear ornament a voice of its own.",
          "ru": "Подарите прозрачному украшению собственный голос."
        },
        {
          "en": "Start with Glass: imagine a little hanging piece that can ring.",
          "ru": "Начните с образца «Стекло»: представьте подвеску, способную звенеть."
        },
        {
          "en": "Glass + Sound",
          "ru": "Стекло + Звук"
        }
      ]
    },
    {
      "id": "v3_crystal_sound_wind_chime",
      "ingredients": [
        "crystal",
        "sound"
      ],
      "result": "wind_chime",
      "why": {
        "en": "Crystal gives sound a set of bright, ringing shapes to hang together.",
        "ru": "Кристалл дарит звуку яркие звенящие формы, которые можно подвесить рядом."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Let bright facets carry a clear, hanging melody.",
          "ru": "Пусть яркие грани несут чистую мелодию подвески."
        },
        {
          "en": "Start with Crystal: its facets suggest small ringing pieces.",
          "ru": "Начните с образца «Кристалл»: его грани подсказывают маленькие звонкие детали."
        },
        {
          "en": "Crystal + Sound",
          "ru": "Кристалл + Звук"
        }
      ]
    },
    {
      "id": "v3_sound_cushion_lullaby",
      "ingredients": [
        "sound",
        "cushion"
      ],
      "result": "lullaby",
      "why": {
        "en": "Sound meets a place to rest and softens into a lullaby.",
        "ru": "Звук встречает место отдыха и смягчается до колыбельной."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Give a voice the gentle mood of a resting place.",
          "ru": "Подарите голосу мягкое настроение места для отдыха."
        },
        {
          "en": "Start with Cushion: it already invites a quiet rest.",
          "ru": "Начните с образца «Подушка»: он уже зовёт к тихому отдыху."
        },
        {
          "en": "Sound + Cushion",
          "ru": "Звук + Подушка"
        }
      ]
    },
    {
      "id": "v3_wind_chime_echo_lullaby",
      "ingredients": [
        "wind_chime",
        "echo"
      ],
      "result": "lullaby",
      "why": {
        "en": "An echo repeats the wind chimes softly until their ringing becomes a lullaby.",
        "ru": "Эхо тихо повторяет музыку ветра, пока звон не становится колыбельной."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Let a gentle ringing repeat until it feels soothing.",
          "ru": "Пусть тихий звон повторяется, пока не начнёт успокаивать."
        },
        {
          "en": "Start with Echo: it knows how to repeat a gentle phrase.",
          "ru": "Начните с образца «Эхо»: он умеет повторять тихую фразу."
        },
        {
          "en": "Wind Chimes + Echo",
          "ru": "Музыка ветра + Эхо"
        }
      ]
    },
    {
      "id": "v3_clay_vial_clay_bowl",
      "ingredients": [
        "clay",
        "vial"
      ],
      "result": "clay_bowl",
      "why": {
        "en": "Clay borrows the vial’s idea of holding things and opens into a bowl.",
        "ru": "Глина заимствует у флакона идею хранения и раскрывается в чашу."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Teach a shapeable material the idea of a vessel.",
          "ru": "Научите податливый материал идее сосуда."
        },
        {
          "en": "Start with Clay: it can learn a useful hollow shape.",
          "ru": "Начните с образца «Глина»: ему можно придать полезную полую форму."
        },
        {
          "en": "Clay + Vial",
          "ru": "Глина + Флакон"
        }
      ]
    },
    {
      "id": "v3_coal_stream_charcoal_filter",
      "ingredients": [
        "coal",
        "stream"
      ],
      "result": "charcoal_filter",
      "why": {
        "en": "Coal’s pores give the stream a slower passage, inspiring a workshop filter.",
        "ru": "Поры угля дают ручью медленный проход и подсказывают фильтр мастерской."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Let flowing water find a path through tiny spaces.",
          "ru": "Позвольте текущей воде найти путь сквозь маленькие промежутки."
        },
        {
          "en": "Start with Coal: its tiny pores leave room for a passage.",
          "ru": "Начните с образца «Уголь»: его поры оставляют место для прохода."
        },
        {
          "en": "Coal + Stream",
          "ru": "Уголь + Ручей"
        }
      ]
    },
    {
      "id": "v3_blossom_breeze_scent",
      "ingredients": [
        "blossom",
        "breeze"
      ],
      "result": "scent",
      "why": {
        "en": "The breeze carries the blossom’s fragrant greeting beyond its petals.",
        "ru": "Бриз уносит душистый привет цветка за пределы лепестков."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Carry an invisible greeting beyond the petals.",
          "ru": "Унесите невидимый привет за пределы лепестков."
        },
        {
          "en": "Start with Blossom: it has more to share than colour.",
          "ru": "Начните с образца «Цветок»: ему есть чем поделиться, кроме цвета."
        },
        {
          "en": "Blossom + Breeze",
          "ru": "Цветок + Бриз"
        }
      ]
    },
    {
      "id": "v3_herb_breeze_scent",
      "ingredients": [
        "herb",
        "breeze"
      ],
      "result": "scent",
      "why": {
        "en": "The breeze gathers the herb’s green fragrance and lets it wander.",
        "ru": "Бриз собирает зелёный запах травы и отпускает его гулять."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Let a fresh green character travel without its leaves.",
          "ru": "Позвольте зелёной свежести путешествовать без листьев."
        },
        {
          "en": "Start with Herb: imagine noticing it with your eyes closed.",
          "ru": "Начните с образца «Трава»: представьте, как узнать его с закрытыми глазами."
        },
        {
          "en": "Herb + Breeze",
          "ru": "Трава + Бриз"
        }
      ]
    },
    {
      "id": "v3_blossom_dew_nectar",
      "ingredients": [
        "blossom",
        "dew"
      ],
      "result": "nectar",
      "why": {
        "en": "The blossom lends a bead of dew its storybook sweetness.",
        "ru": "Цветок дарит бусине росы свою сказочную сладость."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Give a little moisture the sweet character of a garden.",
          "ru": "Подарите влаге немного садовой сладости."
        },
        {
          "en": "Start with Blossom: its sweetness is waiting to be shared.",
          "ru": "Начните с образца «Цветок»: его сладость ждёт, чтобы ею поделились."
        },
        {
          "en": "Blossom + Dew",
          "ru": "Цветок + Роса"
        }
      ]
    },
    {
      "id": "v3_grove_stream_paper",
      "ingredients": [
        "grove",
        "stream"
      ],
      "result": "paper",
      "why": {
        "en": "The stream loosens the grove’s woody fibres, and the workshop lays them into a page.",
        "ru": "Ручей распускает древесные волокна рощи, а мастерская укладывает их в страницу."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Turn woody fibres into a thin surface for keeping stories.",
          "ru": "Превратите древесные волокна в тонкую поверхность для историй."
        },
        {
          "en": "Start with Grove: its wood holds more than sturdy trunks.",
          "ru": "Начните с образца «Роща»: в его древесине есть не только крепкие стволы."
        },
        {
          "en": "Grove + Stream",
          "ru": "Роща + Ручей"
        }
      ]
    },
    {
      "id": "v3_coal_dew_ink",
      "ingredients": [
        "coal",
        "dew"
      ],
      "result": "ink",
      "why": {
        "en": "Dew carries coal’s dark mark, giving the workshop something to write with.",
        "ru": "Роса подхватывает тёмный след угля, и мастерская получает то, чем можно писать."
      },
      "source": "proposed new branch",
      "hints": [
        {
          "en": "Help a dark mark flow instead of crumble.",
          "ru": "Помогите тёмному следу течь вместо того, чтобы крошиться."
        },
        {
          "en": "Start with Coal: notice the dark trace it leaves behind.",
          "ru": "Начните с образца «Уголь»: заметьте тёмный след, который он оставляет."
        },
        {
          "en": "Coal + Dew",
          "ru": "Уголь + Роса"
        }
      ]
    }
  ],
  "projects": [
    {
      "id": "night_beacon",
      "title": "Ночной маяк",
      "output": {
        "game": "yard",
        "itemId": "moon_lamp"
      },
      "inputs": [
        "glow_lantern",
        "crystal"
      ],
      "optionalMasterwork": [
        "solar_core",
        "aurora"
      ],
      "use": {
        "en": "Makes a Moon Lamp for your Yard inventory. Place it separately in the Yard; a guest visit is never guaranteed.",
        "ru": "Создаёт Лунную лампу для инвентаря двора. Разместите её отдельно во дворе; визит гостя не гарантирован."
      },
      "names": {
        "en": "Night Beacon",
        "ru": "Ночной маяк"
      },
      "description": {
        "en": "A small pool of gentle light for the Yard after dusk.",
        "ru": "Маленький островок мягкого света для двора после заката."
      },
      "locked": {
        "en": "Discover {items} to prepare the beacon’s gentle glow.",
        "ru": "Откройте {items}, чтобы подготовить мягкое сияние маяка."
      },
      "missing": {
        "en": "The beacon needs more supplies: {items}.",
        "ru": "Маяку не хватает запасов: {items}."
      },
      "essenceCost": 30,
      "variants": [
        {
          "id": "solar_core",
          "names": {
            "en": "Solar-core route",
            "ru": "Путь солнечного ядра"
          },
          "description": {
            "en": "A solar core replaces the crystal work and covers the essence cost.",
            "ru": "Солнечное ядро заменяет работу с кристаллом и расход эссенции."
          },
          "inputs": [
            "glow_lantern",
            "solar_core"
          ],
          "essenceCost": 0
        },
        {
          "id": "aurora",
          "names": {
            "en": "Aurora route",
            "ru": "Путь сияния"
          },
          "description": {
            "en": "A vial and aurora replace the lantern assembly and its essence cost.",
            "ru": "Флакон и сияние заменяют сборку фонаря и расход эссенции."
          },
          "inputs": [
            "vial",
            "aurora"
          ],
          "essenceCost": 0
        }
      ],
      "requiresYardV3": false,
      "asset": "/games/companion-yard/goodies/moon_lamp.png"
    },
    {
      "id": "listening_fountain",
      "title": "Слушающий фонтан",
      "output": {
        "game": "yard",
        "itemId": "fountain_bowl"
      },
      "inputs": [
        "clay_bowl",
        "charcoal_filter",
        "spring"
      ],
      "optionalMasterwork": [
        "monolith",
        "ocean_heart"
      ],
      "use": {
        "en": "Makes a Fountain Bowl for your Yard inventory. Place it separately in the Yard.",
        "ru": "Создаёт Чашу-фонтан для инвентаря двора. Разместите её отдельно во дворе."
      },
      "names": {
        "en": "Listening Fountain",
        "ru": "Слушающий фонтан"
      },
      "description": {
        "en": "A quiet water corner shaped around a little spring.",
        "ru": "Тихий водный уголок вокруг маленького источника."
      },
      "locked": {
        "en": "Discover {items} to give the fountain its basin and water.",
        "ru": "Откройте {items}, чтобы у фонтана появились чаша и вода."
      },
      "missing": {
        "en": "The fountain needs more supplies: {items}.",
        "ru": "Фонтану не хватает запасов: {items}."
      },
      "essenceCost": 30,
      "variants": [
        {
          "id": "monolith",
          "names": {
            "en": "Monolith route",
            "ru": "Путь монолита"
          },
          "description": {
            "en": "A monolith supplies the basin work; the spring and filter complete it without essence.",
            "ru": "Монолит заменяет работу над чашей; источник и фильтр завершают её без эссенции."
          },
          "inputs": [
            "monolith",
            "spring",
            "charcoal_filter"
          ],
          "essenceCost": 0
        },
        {
          "id": "ocean_heart",
          "names": {
            "en": "Ocean-heart route",
            "ru": "Путь сердца океана"
          },
          "description": {
            "en": "An ocean heart replaces the spring and filter work, saving the essence cost.",
            "ru": "Сердце океана заменяет работу над источником и фильтром, сберегая эссенцию."
          },
          "inputs": [
            "clay_bowl",
            "ocean_heart"
          ],
          "essenceCost": 0
        }
      ],
      "requiresYardV3": false,
      "asset": "/games/companion-yard/goodies/fountain_bowl.png"
    },
    {
      "id": "dream_nest",
      "title": "Гнездо для снов",
      "output": {
        "game": "yard",
        "itemId": "cloud_bed"
      },
      "inputs": [
        "cushion",
        "lullaby"
      ],
      "optionalMasterwork": [
        "phoenix_ash"
      ],
      "use": {
        "en": "Makes a Cloud Bed for your Yard inventory. Place it separately in the Yard.",
        "ru": "Создаёт Облачную лежанку для инвентаря двора. Разместите её отдельно во дворе."
      },
      "names": {
        "en": "Dream Nest",
        "ru": "Гнездо для снов"
      },
      "description": {
        "en": "Cloud-soft comfort with the quiet mood of a lullaby.",
        "ru": "Облачная мягкость с тихим настроением колыбельной."
      },
      "locked": {
        "en": "Discover {items} to bring softness and calm to the nest.",
        "ru": "Откройте {items}, чтобы подарить гнезду мягкость и покой."
      },
      "missing": {
        "en": "The nest needs more supplies: {items}.",
        "ru": "Гнезду не хватает запасов: {items}."
      },
      "essenceCost": 20,
      "variants": [
        {
          "id": "phoenix_ash",
          "names": {
            "en": "Phoenix-ash route",
            "ru": "Путь пепла феникса"
          },
          "description": {
            "en": "Phoenix ash takes the lullaby’s place in the plan and removes the essence cost.",
            "ru": "Пепел феникса занимает место колыбельной в чертеже и заменяет расход эссенции."
          },
          "inputs": [
            "cushion",
            "phoenix_ash"
          ],
          "essenceCost": 0
        }
      ],
      "requiresYardV3": false,
      "asset": "/games/companion-yard/goodies/cloud_bed.png"
    },
    {
      "id": "living_arbor",
      "title": "Живая беседка",
      "output": {
        "game": "yard",
        "itemId": "alchemy_living_arbor",
        "newId": true
      },
      "inputs": [
        "grove",
        "scent",
        "nectar"
      ],
      "optionalMasterwork": [
        "world_tree"
      ],
      "use": {
        "en": "Crafting adds an owned arbor to your Yard inventory for preview. Placement and pet interactions await a Yard update.",
        "ru": "Изготовление добавляет беседку в инвентарь двора для просмотра. Размещение и взаимодействия питомцев ждут обновления двора."
      },
      "names": {
        "en": "Living Arbor",
        "ru": "Живая беседка"
      },
      "description": {
        "en": "A leafy shelter imagined with fragrance and a sweet garden detail.",
        "ru": "Лиственное укрытие с ароматом и сладкой садовой деталью."
      },
      "locked": {
        "en": "Discover {items} to complete the arbor’s leafy idea.",
        "ru": "Откройте {items}, чтобы завершить зелёный замысел беседки."
      },
      "missing": {
        "en": "The arbor needs more supplies: {items}.",
        "ru": "Беседке не хватает запасов: {items}."
      },
      "essenceCost": 30,
      "variants": [
        {
          "id": "world_tree",
          "names": {
            "en": "World-tree route",
            "ru": "Путь мирового дерева"
          },
          "description": {
            "en": "A world tree replaces the grove and scent work; nectar finishes the plan without essence.",
            "ru": "Мировое дерево заменяет работу с рощей и ароматом; нектар завершает чертёж без эссенции."
          },
          "inputs": [
            "world_tree",
            "nectar"
          ],
          "essenceCost": 0
        }
      ],
      "requiresYardV3": true,
      "asset": "/games/merge-lab-v3/living-arbor.webp"
    },
    {
      "id": "echo_chimes",
      "title": "Голос ветра",
      "output": {
        "game": "yard",
        "itemId": "alchemy_echo_chimes",
        "newId": true
      },
      "inputs": [
        "wind_chime"
      ],
      "optionalMasterwork": [
        "echo",
        "tempest_crown"
      ],
      "use": {
        "en": "Crafting adds owned chimes to your Yard inventory for preview. Placement and pet interactions await a Yard update.",
        "ru": "Изготовление добавляет подвеску в инвентарь двора для просмотра. Размещение и взаимодействия питомцев ждут обновления двора."
      },
      "names": {
        "en": "Voice of the Wind",
        "ru": "Голос ветра"
      },
      "description": {
        "en": "A ringing ornament that gives a gentle breeze a voice.",
        "ru": "Звонкое украшение, которое дарит лёгкому ветру голос."
      },
      "locked": {
        "en": "Discover {items} to give the ornament its voice.",
        "ru": "Откройте {items}, чтобы у украшения появился голос."
      },
      "missing": {
        "en": "The ornament needs more supplies: {items}.",
        "ru": "Украшению не хватает запасов: {items}."
      },
      "essenceCost": 0,
      "variants": [
        {
          "id": "echo",
          "names": {
            "en": "Echo assembly",
            "ru": "Сборка с эхом"
          },
          "description": {
            "en": "Echo, crystal, and thread replace a ready-made wind chime. This route also costs no essence.",
            "ru": "Эхо, кристалл и нить заменяют готовую музыку ветра. Этот путь тоже не требует эссенции."
          },
          "inputs": [
            "echo",
            "crystal",
            "thread_fiber"
          ],
          "essenceCost": 0
        },
        {
          "id": "tempest_crown",
          "names": {
            "en": "Tempest-crown route",
            "ru": "Путь короны бури"
          },
          "description": {
            "en": "A tempest crown and glass replace the wind-chime assembly, with no essence cost.",
            "ru": "Корона бури и стекло заменяют сборку музыки ветра без расхода эссенции."
          },
          "inputs": [
            "tempest_crown",
            "glass"
          ],
          "essenceCost": 0
        }
      ],
      "requiresYardV3": true,
      "asset": "/games/merge-lab-v3/items/wind_chime.webp"
    },
    {
      "id": "stargazer_nook",
      "title": "Звёздный уголок",
      "output": {
        "game": "yard",
        "itemId": "book_nook"
      },
      "inputs": [
        "paper",
        "paper",
        "paper",
        "ink",
        "lens"
      ],
      "optionalMasterwork": [
        "astrolabe",
        "philosopher_stone"
      ],
      "use": {
        "en": "Makes a Book Nook for your Yard inventory. Place it separately in the Yard.",
        "ru": "Создаёт Книжный уголок для инвентаря двора. Разместите его отдельно во дворе."
      },
      "names": {
        "en": "Stargazer Nook",
        "ru": "Звёздный уголок"
      },
      "description": {
        "en": "A place for pages, curious eyes, and stories about the sky.",
        "ru": "Место для страниц, любопытных взглядов и историй о небе."
      },
      "locked": {
        "en": "Discover {items} to prepare the nook’s pages and view.",
        "ru": "Откройте {items}, чтобы подготовить страницы и обзор для уголка."
      },
      "missing": {
        "en": "The nook needs more supplies: {items}.",
        "ru": "Уголку не хватает запасов: {items}."
      },
      "essenceCost": 20,
      "variants": [
        {
          "id": "astrolabe",
          "names": {
            "en": "Astrolabe route",
            "ru": "Путь астролябии"
          },
          "description": {
            "en": "An astrolabe replaces the lens work and saves two sheets of paper and the essence cost.",
            "ru": "Астролябия заменяет работу с линзой, сберегая два листа бумаги и эссенцию."
          },
          "inputs": [
            "paper",
            "ink",
            "astrolabe"
          ],
          "essenceCost": 0
        },
        {
          "id": "philosopher_stone",
          "names": {
            "en": "Philosopher’s route",
            "ru": "Путь философского камня"
          },
          "description": {
            "en": "The philosopher’s stone replaces the ink and lens work, saving two sheets and the essence cost.",
            "ru": "Философский камень заменяет работу с чернилами и линзой, сберегая два листа бумаги и эссенцию."
          },
          "inputs": [
            "paper",
            "philosopher_stone"
          ],
          "essenceCost": 0
        }
      ],
      "requiresYardV3": false,
      "asset": "/games/companion-yard/goodies/book_nook.png"
    }
  ],
  "starterItemIds": [
    "seed",
    "dust",
    "dew",
    "ember",
    "breeze",
    "sprout",
    "mud",
    "clay",
    "brick",
    "droplet",
    "cloud",
    "glass",
    "vial"
  ],
  "starterRecipeIds": [
    "seed_dew_sprout",
    "dew_dust_mud",
    "clay_ember_brick",
    "breeze_droplet_cloud"
  ],
  "supplyItemIds": [
    "seed",
    "sprout",
    "herb",
    "vine",
    "dust",
    "clay",
    "sand",
    "stone",
    "ore",
    "dew",
    "droplet",
    "stream",
    "ember",
    "flame",
    "coal",
    "kiln",
    "breeze",
    "cloud",
    "spark",
    "bolt",
    "mud",
    "brick",
    "glass",
    "vial",
    "sound",
    "charcoal_filter",
    "scent",
    "ink"
  ],
  "starterKit": {
    "breeze": 1,
    "vial": 1,
    "glass": 1
  },
  "tokenPacks": [
    {
      "id": "workshop",
      "names": {
        "en": "Workshop",
        "ru": "Мастерская"
      },
      "cost": 10,
      "items": {
        "glass": 2,
        "vial": 1,
        "clay": 2,
        "ember": 1
      }
    },
    {
      "id": "greenery",
      "names": {
        "en": "Living Garden",
        "ru": "Живой сад"
      },
      "cost": 10,
      "items": {
        "herb": 2,
        "blossom": 1,
        "vine": 1,
        "dew": 2
      }
    },
    {
      "id": "sky",
      "names": {
        "en": "Sky and Sound",
        "ru": "Небо и звук"
      },
      "cost": 10,
      "items": {
        "cloud": 2,
        "spark": 2,
        "breeze": 2
      }
    }
  ],
  "cropSupplies": {
    "strawberry": {
      "cropId": "strawberry",
      "quantity": 1,
      "names": {
        "en": "Strawberry",
        "ru": "Клубника"
      },
      "items": {
        "seed": 2,
        "dew": 1
      }
    },
    "blueberry": {
      "cropId": "blueberry",
      "quantity": 1,
      "names": {
        "en": "Blueberry",
        "ru": "Черника"
      },
      "items": {
        "seed": 2,
        "dew": 1
      }
    },
    "tomato": {
      "cropId": "tomato",
      "quantity": 1,
      "names": {
        "en": "Tomato",
        "ru": "Помидор"
      },
      "items": {
        "seed": 2,
        "dew": 1,
        "dust": 1
      }
    },
    "golden": {
      "cropId": "golden",
      "quantity": 1,
      "names": {
        "en": "Golden Rose",
        "ru": "Золотая роза"
      },
      "items": {
        "seed": 2,
        "dew": 1,
        "dust": 1
      }
    },
    "corn": {
      "cropId": "corn",
      "quantity": 1,
      "names": {
        "en": "Corn",
        "ru": "Кукуруза"
      },
      "items": {
        "seed": 2,
        "dew": 1,
        "dust": 1
      }
    },
    "sunflower": {
      "cropId": "sunflower",
      "quantity": 1,
      "names": {
        "en": "Sunflower",
        "ru": "Подсолнух"
      },
      "items": {
        "seed": 2,
        "dew": 2,
        "dust": 1
      }
    },
    "watermelon": {
      "cropId": "watermelon",
      "quantity": 1,
      "names": {
        "en": "Watermelon",
        "ru": "Арбуз"
      },
      "items": {
        "seed": 2,
        "dew": 2,
        "dust": 1
      }
    },
    "pumpkin": {
      "cropId": "pumpkin",
      "quantity": 1,
      "names": {
        "en": "Pumpkin",
        "ru": "Тыква"
      },
      "items": {
        "seed": 2,
        "dew": 2,
        "dust": 1
      }
    }
  },
  "economy": {
    "discoveryEssence": 4,
    "chargeCap": 30,
    "rechargeMs": 1200000,
    "dailySupply": {
      "seed": 1,
      "dew": 1,
      "breeze": 1
    },
    "distillDivisor": 4,
    "distillCap": 6
  },
  "exchangeOffers": [
    {
      "id": "yard_treats_small",
      "cost": 50,
      "reward": {
        "treats": 120
      },
      "perDayLimit": 4
    },
    {
      "id": "yard_shiny_treat",
      "cost": 120,
      "reward": {
        "shinyTreats": 1
      },
      "perDayLimit": 2
    }
  ]
};

export function mergeLabName(item, language = 'en') {
  return item?.names?.[language] || item?.names?.en || item?.name || item?.id || '';
}

export { MERGE_LAB_CATALOG as M, mergeLabName as m };
