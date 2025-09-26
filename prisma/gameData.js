// --- Dados da Loja RPG ---
const shopItems = [
    { id: 'strength_potion_1', name: 'Poção de Força', price: 25, type: 'permanent', bonus: { stat: 'strength', value: 1 }, description: '+1 de Força permanente.' },
    { id: 'dexterity_potion_1', name: 'Poção de Destreza', price: 25, type: 'permanent', bonus: { stat: 'dexterity', value: 1 }, description: '+1 de Destreza permanente.' },
    { id: 'intelligence_potion_1', name: 'Poção de Inteligência', price: 25, type: 'permanent', bonus: { stat: 'intelligence', value: 1 }, description: '+1 de Inteligência permanente.' },
    { id: 'xp_boost_1', name: 'Pergaminho de XP', price: 50, type: 'permanent', bonus: { stat: 'xp', value: 50 }, description: '+50 de XP instantâneo.' },
    { id: 'health_potion_1', name: 'Poção de Vida Pequena', price: 30, type: 'consumable', effect: { type: 'heal', value: 50 }, description: 'Restaura 50 de HP. Usável em batalha.' },
];

// --- Lógica do RPG (Dados Estáticos) ---
const RPG_CHARACTERS = {
    common: [
        { id: 'garenho', name: 'Garenho, o Lenhador', rarity: 'common', stats: { strength: 6, dexterity: 3, intelligence: 2, defense: 4 }, ability: 'Golpe de Machado: causa dano físico simples em um inimigo.', abilityId: null },
        { id: 'lyra', name: 'Lyra da Aldeia', rarity: 'common', stats: { strength: 3, dexterity: 5, intelligence: 4, defense: 2 }, ability: 'Tiro Rápido: dispara duas flechas rápidas seguidas.', abilityId: 'tiro_rapido' },
        { id: 'bruk', name: 'Bruk, o Ferreiro', rarity: 'common', stats: { strength: 7, dexterity: 2, intelligence: 3, defense: 5 }, ability: 'Escudo Improvisado: cria um escudo que reduz o próximo dano.', abilityId: 'escudo_improvisado' },
        { id: 'nira', name: 'Nira, a Caçadora', rarity: 'common', stats: { strength: 4, dexterity: 6, intelligence: 3, defense: 3 }, ability: 'Armadilha Simples: prende o inimigo por 1 turno.', abilityId: 'armadilha_simples' },
    ],
    uncommon: [
        { id: 'taron', name: 'Taron, o Guardião da Ponte', rarity: 'uncommon', stats: { strength: 8, dexterity: 5, intelligence: 3, defense: 7 }, ability: 'Postura de Defesa: aumenta a defesa de todo o grupo por 2 turnos.', abilityId: 'postura_de_defesa' },
        { id: 'elina', name: 'Elina Sombralua', rarity: 'uncommon', stats: { strength: 4, dexterity: 7, intelligence: 6, defense: 4 }, ability: 'Adaga Envenenada: causa dano contínuo por 3 turnos.', abilityId: 'adaga_envenenada' },
        { id: 'kael', name: 'Kael, o Batedor', rarity: 'uncommon', stats: { strength: 5, dexterity: 8, intelligence: 4, defense: 5 }, ability: 'Olhos de Águia: revela inimigos ocultos e aumenta crítico.', abilityId: null },
        { id: 'brissa', name: 'Brissa, a Herbalista', rarity: 'uncommon', stats: { strength: 2, dexterity: 5, intelligence: 9, defense: 3 }, ability: 'Poção Verde: cura lentamente aliados por 3 turnos.', abilityId: 'pocao_verde' },
    ],
    rare: [
        { id: 'draegor', name: 'Draegor, Cavaleiro Negro', rarity: 'rare', stats: { strength: 12, dexterity: 6, intelligence: 5, defense: 11 }, ability: 'Golpe Sombrio: ataca ignorando parte da defesa inimiga.', abilityId: 'golpe_sombrio' },
        { id: 'seraphine', name: 'Seraphine da Chama Branca', rarity: 'rare', stats: { strength: 7, dexterity: 8, intelligence: 12, defense: 8 }, ability: 'Luz Purificadora: cura aliados e causa dano a inimigos sombrios.', abilityId: 'luz_purificadora' },
        { id: 'zerkan', name: 'Zerkan, o Ladrão de Sombras', rarity: 'rare', stats: { strength: 6, dexterity: 13, intelligence: 7, defense: 5 }, ability: 'Sombra Fatal: teleporta-se atrás do inimigo e acerta crítico garantido.', abilityId: 'sombra_fatal' },
        { id: 'orvus', name: 'Orvus, Mago da Tempestade', rarity: 'rare', stats: { strength: 4, dexterity: 6, intelligence: 14, defense: 7 }, ability: 'Raio Destruidor: dano em área com chance de paralisar.', abilityId: 'raio_destruidor' },
    ],
    mythic: [
        { id: 'valdyr', name: 'Valdyr, o Devorador de Reinos', rarity: 'mythic', stats: { strength: 18, dexterity: 10, intelligence: 12, defense: 16 }, ability: 'Terra em Chamas: invoca erupções massivas em área.', abilityId: 'terra_em_chamas' },
        { id: 'lunarya', name: 'Lunarya, a Deusa da Lua Sangrenta', rarity: 'mythic', stats: { strength: 10, dexterity: 14, intelligence: 18, defense: 12 }, ability: 'Eclipse Carmesim: enfraquece inimigos e fortalece aliados.' },
        { id: 'ragnar', name: 'Ragnar, Senhor dos Dragões', rarity: 'mythic', stats: { strength: 20, dexterity: 9, intelligence: 13, defense: 17 }, ability: 'Sopro Ancestral: fogo dracônico em área ignorando resistências.', abilityId: 'sopro_ancestral' },
        { id: 'isyris', name: 'Isyris, a Guardiã do Tempo', rarity: 'mythic', stats: { strength: 9, dexterity: 12, intelligence: 20, defense: 15 }, ability: 'Reversão Temporal: revive aliado e remove efeitos negativos.', abilityId: 'reversao_temporal' },
    ],
    chatynirare: [
        { id: 'azkhor', name: 'Azkhor, o Coração do Caos', rarity: 'chatynirare', stats: { strength: 25, dexterity: 20, intelligence: 22, defense: 25 }, ability: 'Rasgo Dimensional: dano em todo o mapa.', abilityId: 'rasgo_dimensional' },
        { id: 'morrigar', name: 'Morrigar, a Bruxa das Mil Almas', rarity: 'chatynirare', stats: { strength: 15, dexterity: 17, intelligence: 30, defense: 18 }, ability: 'Exército de Almas: invoca espectros que atacam continuamente.', abilityId: 'exercito_de_almas' },
        { id: 'xypherion', name: 'Xypherion, o Dragão Eterno', rarity: 'chatynirare', stats: { strength: 30, dexterity: 15, intelligence: 20, defense: 28 }, ability: 'Chama Imortal: dano massivo + ressuscita se morrer.', abilityId: 'chama_imortal' },
        { id: 'chatynir', name: 'Chatynir, o Deus Esquecido', rarity: 'chatynirare', stats: { strength: 28, dexterity: 22, intelligence: 28, defense: 30 }, ability: 'Fim da Existência: apaga um inimigo do jogo.', abilityId: 'fim_da_existencia' },
        { id: 'korgath', name: 'Korgath, o Baluarte Inabalável', rarity: 'chatynirare', stats: { strength: 28, dexterity: 10, intelligence: 10, defense: 35 }, ability: 'Desafio do Colosso: Provoca o inimigo, refletindo 50% do dano recebido por 2 turnos.', abilityId: 'desafio_do_colosso' },
    ],
    supreme: [
        { id: 'chatyniboss', name: 'CHATYNIBOSS', rarity: 'supreme', stats: { strength: 99, dexterity: 99, intelligence: 99, defense: 99 }, ability: 'Comanda a própria realidade, possuindo acesso a todas as habilidades conhecidas.', abilityId: null }
    ]
};
RPG_CHARACTERS.secret = [
    { id: 'mundo_miojoexp', name: 'Mundo_MiojoEXP', rarity: 'secret', stats: { strength: 50, dexterity: 35, intelligence: 40, defense: 30 }, ability: 'Mestre da culinária caótica e dos chutes fenomenais.', abilityId: null }
];

// --- Dados dos Mascotes RPG ---
const RPG_PETS = {
    common: [
        { id: 'slime_pet', name: 'Mini Slime', rarity: 'common', description: 'Um companheiro saltitante que te deixa um pouco mais resistente.', effects: { passive_stats: { defense: 2 } } },
        { id: 'wolf_pup_pet', name: 'Filhote de Lobo', rarity: 'common', description: 'Um filhote leal que te inspira a ser mais ágil.', effects: { passive_stats: { dexterity: 2 } } },
    ],
    rare: [
        { id: 'golem_fragment_pet', name: 'Fragmento de Golem', rarity: 'rare', description: 'Um pedaço de golem que emana força.', effects: { passive_stats: { strength: 4, defense: 2 } } },
        { id: 'guardian_slime_pet', name: 'Slime Guardião', rarity: 'rare', description: 'Um slime que absorveu poder mágico e se tornou um protetor resiliente.', effects: { passive_stats: { defense: 5, strength: 2 } } },
        { id: 'spectral_wolf_pet', name: 'Lobo Espectral', rarity: 'rare', description: 'Um lobo que agora caminha entre o mundo físico e o espiritual.', effects: { passive_stats: { dexterity: 5, intelligence: 2 } } },
        { id: 'swift_griffin_pet', name: 'Grifo Veloz', rarity: 'rare', description: 'Um companheiro aéreo majestoso que corta os céus.', effects: { passive_stats: { dexterity: 4, intelligence: 3 } } },
        { id: 'protective_ent_pet', name: 'Ent Protetor', rarity: 'rare', description: 'Uma pequena árvore senciente com sabedoria ancestral.', effects: { passive_stats: { defense: 4, intelligence: 3 } } },
    ],
    mythic: [
        { id: 'baby_dragon_pet', name: 'Dragão Bebê', rarity: 'mythic', description: 'Um pequeno dragão que promete um poder imenso.', effects: { passive_stats: { strength: 8, intelligence: 8 } } },
        { id: 'colossal_golem_pet', name: 'Golem Colossal', rarity: 'mythic', description: 'Um golem que acumulou poder da terra por eras.', effects: { passive_stats: { strength: 10, defense: 10 } } },
        { id: 'chimera_cub_pet', name: 'Quimera Filhote', rarity: 'mythic', description: 'Uma fera de três cabeças em miniatura, cada uma com sua própria personalidade.', effects: { passive_stats: { strength: 6, intelligence: 6, defense: 6 } } },
    ],
    chatynirare: [
        { id: 'emperor_dragon_pet', name: 'Dragão Imperador', rarity: 'chatynirare', description: 'Um dragão que alcançou o ápice de seu poder, comandando os céus.', effects: { passive_stats: { strength: 15, intelligence: 15, defense: 5 } } },
        { id: 'ash_phoenix_pet', name: 'Fênix de Cinzas', rarity: 'chatynirare', description: 'Uma ave imortal renascida do fogo. Sua presença inspira resiliência e poder.', effects: { passive_stats: { intelligence: 18, defense: 12 } } },
        { id: 'primal_behemoth_pet', name: 'Behemoth Primordial', rarity: 'chatynirare', description: 'Uma besta colossal que personifica a força bruta da natureza.', effects: { passive_stats: { strength: 25 } } },
    ],
    secret: [
        { id: 'ohh_beringela', name: 'Ohh Beringela', rarity: 'secret', description: 'Uma beringela senciente que distorce a realidade com seu olhar. Concede um poder inexplicável.', effects: { passive_stats: { strength: 10, dexterity: 10, intelligence: 10, defense: 10 } } }
    ],
    supreme: [
        { id: 'great_eggplant_pet', name: 'A Grande Beringela', rarity: 'supreme', description: 'A forma final da beringela. Sua mera presença reescreve as leis da física e do bom senso. Concede poder absoluto.', effects: { passive_stats: { strength: 25, dexterity: 25, intelligence: 25, defense: 25 } } }
    ],
};

const PET_EVOLUTIONS = {
    'slime_pet': { evolvesTo: 'guardian_slime_pet', cost: 250 },
    'wolf_pup_pet': { evolvesTo: 'spectral_wolf_pet', cost: 250 },
    'golem_fragment_pet': { evolvesTo: 'colossal_golem_pet', cost: 1000 },
    'baby_dragon_pet': { evolvesTo: 'emperor_dragon_pet', cost: 5000 },
    'ohh_beringela': { evolvesTo: 'great_eggplant_pet', cost: 20000 },
};

const ROLL_CHANCES = [
    { rarity: 'chatynirare', chance: 0.5 },
    { rarity: 'mythic', chance: 4.5 },
    { rarity: 'rare', chance: 10 },
    { rarity: 'uncommon', chance: 25 },
    { rarity: 'common', chance: 60 },
];

const PET_ROLL_CHANCES = [
    { rarity: 'mythic', chance: 5 },
    { rarity: 'rare', chance: 25 },
    { rarity: 'common', chance: 70 },
];


// --- Dados dos Monstros ---
const MONSTERS = {
    goblin: { id: 'goblin', name: 'Goblin', hp: 30, attack: 8, defense: 2, xp: 15, coins: 5, imageUrl: 'https://i.imgur.com/M0F4S2g.png' },
    slime: { id: 'slime', name: 'Slime Pegajoso', hp: 20, attack: 5, defense: 5, xp: 10, coins: 3, imageUrl: 'https://i.imgur.com/sZ4VplG.png' },
    shadow_wolf: { id: 'shadow_wolf', name: 'Lobo Sombrio', hp: 40, attack: 12, defense: 3, xp: 25, coins: 8, imageUrl: 'https://i.imgur.com/v8p2uSO.png' },
    orc: { id: 'orc', name: 'Orc Bruto', hp: 60, attack: 15, defense: 6, xp: 40, coins: 15, imageUrl: 'https://i.imgur.com/K22m2s2.png' },
    stone_golem: { id: 'stone_golem', name: 'Golem de Pedra', hp: 100, attack: 10, defense: 15, xp: 60, coins: 20, imageUrl: 'https://i.imgur.com/A8i7b2N.png' },
    ancient_dragon: { id: 'ancient_dragon', name: 'Dragão Ancião', hp: 500, attack: 25, defense: 12, xp: 300, coins: 100, imageUrl: 'https://i.imgur.com/sC8kvLg.png', specialAbilities: ['fire_breath'] }
};

const ALL_WEAPONS = {
    espada_enferrujada: { id: 'espada_enferrujada', name: 'Espada Enferrujada', rarity: 'common', effects: { passive_stats: { strength: 6 } }, description: '+6 de Força.' },
    faca_de_cobre: { id: 'faca_de_cobre', name: 'Faca de Cobre', rarity: 'common', effects: { passive_stats: { strength: 7 } }, description: '+7 de Força.' },
    espada_de_mundo_miojo: { id: 'espada_de_mundo_miojo', name: 'Espada de Mundo_Miojo', rarity: 'secret', effects: { passive_stats: { strength: 79 } }, description: 'Uma lâmina que cheira a tempero e caos. +79 de Força.' },
    espada_suprema_adm: { id: 'espada_suprema_adm', name: 'Espada Suprema do ADM', rarity: 'supreme', effects: { on_hit: { type: 'instant_kill', chance: 100 } }, description: 'Transforma qualquer golpe em morte instantânea.' },
};

// --- Dados das Dungeons ---
const DUNGEONS = {
    goblin_cave: { id: 'goblin_cave', name: 'Caverna dos Goblins', stages: [{ type: 'mob', monsterId: 'slime' }, { type: 'mob', monsterId: 'goblin' }, { type: 'boss', monsterId: 'orc' }], finalReward: { xp: 150, coins: 50 } }
};

// --- Dados das Habilidades ---
const ABILITIES = {
    'raio_destruidor': { id: 'raio_destruidor', name: 'Raio Destruidor', cost: 15, type: 'damage', description: 'Causa dano mágico baseado em Inteligência.' },
    'luz_purificadora': { id: 'luz_purificadora', name: 'Luz Purificadora', cost: 20, type: 'heal', description: 'Cura uma quantidade de vida baseada na Inteligência.' },
    'escudo_improvisado': { id: 'escudo_improvisado', name: 'Escudo Improvisado', cost: 10, type: 'buff', description: 'Reduz o próximo dano sofrido em 75%.' },
    'adaga_envenenada': { id: 'adaga_envenenada', name: 'Adaga Envenenada', cost: 15, type: 'debuff', description: 'Envenena o alvo, causando dano por 3 turnos.' },
    'golpe_sombrio': { id: 'golpe_sombrio', name: 'Golpe Sombrio', cost: 25, type: 'damage_special', description: 'Um ataque que ignora 50% da defesa inimiga.' },
    'armadilha_simples': { id: 'armadilha_simples', name: 'Armadilha Simples', cost: 12, type: 'debuff', description: 'Prende o inimigo, fazendo-o perder o próximo turno.' },
    'postura_de_defesa': { id: 'postura_de_defesa', name: 'Postura de Defesa', cost: 10, type: 'buff', description: 'Aumenta sua defesa por 2 turnos.' },
    'tiro_rapido': { id: 'tiro_rapido', name: 'Tiro Rápido', cost: 10, type: 'multi_hit', description: 'Ataca 2 vezes com 60% da sua força.' },
    'pocao_verde': { id: 'pocao_verde', name: 'Poção Verde', cost: 18, type: 'heal_over_time_buff', description: 'Cura uma pequena quantidade de vida por 3 turnos.' },
    'sombra_fatal': { id: 'sombra_fatal', name: 'Sombra Fatal', cost: 35, type: 'guaranteed_crit', description: 'Seu próximo ataque é um acerto crítico garantido.' },
    'reversao_temporal': { id: 'reversao_temporal', name: 'Reversão Temporal', cost: 30, type: 'cleanse', description: 'Remove todos os efeitos negativos de você.' },
    'terra_em_chamas': { id: 'terra_em_chamas', name: 'Terra em Chamas', cost: 40, type: 'damage', description: 'Causa dano mágico massivo baseado em Inteligência.' },
    'sopro_ancestral': { id: 'sopro_ancestral', name: 'Sopro Ancestral', cost: 50, type: 'damage_special', description: 'Um ataque poderoso que ignora toda a defesa inimiga.' },
    'fim_da_existencia': { id: 'fim_da_existencia', name: 'Fim da Existência', cost: 100, type: 'instant_kill', description: 'Apaga um inimigo da existência. (Uso único por batalha)' },
    'rasgo_dimensional': { id: 'rasgo_dimensional', name: 'Rasgo Dimensional', cost: 60, type: 'damage', description: 'Causa dano massivo baseado na Força e Inteligência.' },
    'exercito_de_almas': { id: 'exercito_de_almas', name: 'Exército de Almas', cost: 55, type: 'debuff', description: 'Aplica dano contínuo por 4 turnos no inimigo.' },
    'chama_imortal': { id: 'chama_imortal', name: 'Chama Imortal', cost: 70, type: 'damage_special', description: 'Causa dano verdadeiro massivo que ignora defesa.' },
    'desafio_do_colosso': { id: 'desafio_do_colosso', name: 'Desafio do Colosso', cost: 60, type: 'buff', description: 'Provoca o inimigo e reflete 50% do dano recebido por 2 turnos.' },    
    'cozinha_fatal': { id: 'cozinha_fatal', name: 'Cozinha Fatal', cost: 45, type: 'damage_special', description: 'Um ataque culinário devastador que ignora 75% da defesa inimiga.' },
    'paralisia_cerebral': { id: 'paralisia_cerebral', name: 'Paralisia Cerebral', cost: 30, type: 'debuff', description: 'Confunde o inimigo com pensamentos complexos, causando atordoamento por 2 turnos.' },
    'ronaldo': { id: 'ronaldo', name: 'Ronaldo', cost: 80, type: 'damage', description: 'Um chute fenomenal que causa dano massivo baseado na Força.' },
};

// --- Dados dos Baús de Recompensa ---
const CHEST_DATA = {
    common_chest: { id: 'common_chest', name: 'Baú Comum', rarity: 'common', description: 'Um baú simples de madeira. O que será que tem dentro?', type: 'chest' },
    rare_chest: { id: 'rare_chest', name: 'Baú Raro', rarity: 'rare', description: 'Um baú reforçado com ferro. Parece conter algo de valor.', type: 'chest' },
    legendary_chest: { id: 'legendary_chest', name: 'Baú Lendário', rarity: 'legendary', description: 'Um baú ornamentado com detalhes em ouro. Irradia uma aura poderosa.', type: 'chest' },
    mythic_chest: { id: 'mythic_chest', name: 'Baú Mítico', rarity: 'mythic', description: 'Um baú celestial que pulsa com energia cósmica.', type: 'chest' },
    chatynirare_chest: { id: 'chatynirare_chest', name: 'Baú ChatyniRare', rarity: 'chatynirare', description: 'Um artefato de realidade distorcida. Seu conteúdo é um mistério insondável.', type: 'chest' },
    admin_chest: { id: 'admin_chest', name: 'Baú do Administrador', rarity: 'secret', description: 'Um presente dos deuses do código. Seu conteúdo é lendário.', type: 'chest' },
};

const DUNGEON_CHEST_DROP_CHANCES = [
    { chestId: 'chatynirare_chest', chance: 0.1 },
    { chestId: 'mythic_chest', chance: 5 },
    { chestId: 'legendary_chest', chance: 10 },
    { chestId: 'rare_chest', chance: 40 },
    { chestId: 'common_chest', chance: 90 },
];

const CHEST_REWARDS = {
    common_chest: () => ({ coins: Math.floor(Math.random() * 50) + 25, xp: Math.floor(Math.random() * 100) + 50 }),
    rare_chest: () => ({ coins: Math.floor(Math.random() * 150) + 75, xp: Math.floor(Math.random() * 250) + 100, character: { chance: 15, pool: 'uncommon' } }),
    legendary_chest: () => ({ coins: Math.floor(Math.random() * 400) + 200, xp: Math.floor(Math.random() * 600) + 300, character: { chance: 100, pool: 'uncommon', upgradeChance: 20, upgradePool: 'rare' } }),
    mythic_chest: () => ({ coins: Math.floor(Math.random() * 1000) + 500, xp: Math.floor(Math.random() * 1500) + 750, character: { chance: 100, pool: 'rare', upgradeChance: 10, upgradePool: 'mythic' } }),
    chatynirare_chest: () => ({ coins: Math.floor(Math.random() * 5000) + 2500, xp: Math.floor(Math.random() * 7500) + 5000, character: { chance: 100, pool: 'mythic', upgradeChance: 2, upgradePool: 'chatynirare' } }),
    admin_chest: () => ({ character: { chance: 100, pool: 'secret' }, weapon: { chance: 100, id: 'espada_de_mundo_miojo' }, pet: { chance: 100, id: 'ohh_beringela' } }),
};

// --- Dados das Missões Diárias ---
const dailyQuests = [
    { id: 'defeat_monsters_3', type: 'FIGHT', description: 'Derrote 3 monstros', target: 3, reward: { xp: 75, coins: 15 } },
    { id: 'earn_coins_20', type: 'EARN_COINS', description: 'Ganhe 20 moedas em batalhas', target: 20, reward: { xp: 50, coins: 10 } },
    { id: 'gain_xp_100', type: 'GAIN_XP', description: 'Ganhe 100 de XP', target: 100, reward: { xp: 50, coins: 25 } },
    { id: 'defeat_monsters_5', type: 'FIGHT', description: 'Derrote 5 monstros', target: 5, reward: { xp: 150, coins: 30 } },
];

module.exports = {
    shopItems,
    RPG_CHARACTERS,
    RPG_PETS,
    PET_EVOLUTIONS,
    ROLL_CHANCES,
    PET_ROLL_CHANCES,
    MONSTERS,
    ALL_WEAPONS,
    DUNGEONS,
    ABILITIES,
    CHEST_DATA,
    DUNGEON_CHEST_DROP_CHANCES,
    CHEST_REWARDS,
    dailyQuests
};

