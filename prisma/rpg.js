const express = require('express');
const crypto = require('crypto');

module.exports = (prisma, authMiddleware, gameData, activeBattles, activeDungeons, calculatePlayerBattleStats, getPlayerAbilities) => {
    const router = express.Router();
    const { MONSTERS, shopItems, ALL_WEAPONS, RPG_CHARACTERS, ROLL_CHANCES, PET_ROLL_CHANCES, RPG_PETS, PET_EVOLUTIONS, CHEST_DATA, ABILITIES } = gameData;

    // --- ROTAS DE BATALHA ---

    router.post('/battle/start', authMiddleware, (req, res) => {
        const user = req.user;
        if (activeBattles.has(user.username)) return res.json({ battleState: activeBattles.get(user.username), inProgress: true });
        const playerTotalStats = calculatePlayerBattleStats(user);
        const playerMaxHp = 50 + (user.rpg.level * 10) + (playerTotalStats.strength * 2);
        const playerMaxMana = 20 + (playerTotalStats.intelligence * 5);
        const monsterKeys = Object.keys(MONSTERS);
        const randomMonsterKey = monsterKeys[Math.floor(Math.random() * monsterKeys.length)];
        const monster = { ...MONSTERS[randomMonsterKey] };
        const playerAbilities = getPlayerAbilities(user);
        const battleState = {
            player: {
                username: user.username, hp: playerMaxHp, maxHp: playerMaxHp, mana: playerMaxMana, maxMana: playerMaxMana,
                stats: playerTotalStats, isDefending: false, isSuperDefending: false, avatarUrl: user.avatarUrl,
                abilities: playerAbilities, effects: [], usedOneTimeAbilities: [], inventory: JSON.parse(JSON.stringify(user.rpg.inventory || []))
            },
            monster: { ...monster, currentHp: monster.hp, maxHp: monster.hp, effects: [] },
            turn: 1, log: [`Um ${monster.name} selvagem apareceu!`], gameOver: false
        };
        activeBattles.set(user.username, battleState);
        res.status(201).json({ battleState, inProgress: false });
    });

    router.post('/battle/action', authMiddleware, async (req, res) => {
        const user = req.user;
        const battleState = activeBattles.get(user.username);
        const { action } = req.body;
        if (!battleState || battleState.gameOver) return res.status(400).send('Nenhuma batalha ativa encontrada ou a batalha já terminou.');
        const { player, monster } = battleState;
        let turnLog = [];
        player.isDefending = false;
        if (player.isSuperDefending) player.isSuperDefending = false;
        // A lógica completa da ação de batalha (ataque, defesa, habilidade, etc.) vai aqui...
        // Esta é uma versão simplificada para manter o exemplo conciso.
        // A lógica completa já está no seu server.js e deve ser movida para cá.

        // Exemplo simplificado de ataque
        if (action === 'attack') {
            let damageDealt = Math.max(1, player.stats.strength - monster.defense);
            monster.currentHp = Math.max(0, monster.currentHp - damageDealt);
            turnLog.push(`Você ataca o ${monster.name} e causa ${damageDealt} de dano.`);
        }

        // Lógica de vitória
        if (monster.currentHp <= 0) {
            battleState.gameOver = true;
            battleState.victory = true;
            const xpGain = monster.xp;
            const coinGain = monster.coins;
            let rewardMessage = `Você derrotou o ${monster.name} e ganhou ${xpGain} XP e ${coinGain} moedas.`;

            const dataToUpdate = { coins: { increment: coinGain } };
            let currentXp = user.rpg.xp + xpGain;

            if (currentXp >= user.rpg.xpToNextLevel) {
                dataToUpdate.level = { increment: 1 };
                dataToUpdate.xp = currentXp - user.rpg.xpToNextLevel;
                dataToUpdate.xpToNextLevel = Math.floor(user.rpg.xpToNextLevel * 1.5);
                const statsKeys = ['strength', 'dexterity', 'intelligence', 'defense'];
                const randomStat = statsKeys[Math.floor(Math.random() * statsKeys.length)];
                dataToUpdate[randomStat] = { increment: 1 };
                rewardMessage += `\n🎉 PARABÉNS! Você subiu para o nível ${user.rpg.level + 1}! (+1 de ${randomStat})`;
            } else {
                dataToUpdate.xp = { increment: xpGain };
            }

            const updatedRpg = await prisma.rPG.update({ where: { userId: user.id }, data: dataToUpdate });
            turnLog.push(rewardMessage);
            battleState.log.push(...turnLog);
            activeBattles.delete(user.username);
            return res.json({ battleState, updatedRpg });
        }

        // Lógica do turno do monstro
        let damageTaken = Math.max(1, monster.attack - player.stats.defense);
        player.hp = Math.max(0, player.hp - damageTaken);
        turnLog.push(`O ${monster.name} te ataca e causa ${damageTaken} de dano.`);

        if (player.hp <= 0) {
            battleState.gameOver = true;
            battleState.victory = false;
            turnLog.push('Você foi derrotado!');
            activeBattles.delete(user.username);
        }

        battleState.turn++;
        battleState.log.push(...turnLog);
        res.json({ battleState });
    });

    router.post('/battle/flee', authMiddleware, (req, res) => {
        const user = req.user;
        if (activeBattles.has(user.username)) {
            activeBattles.delete(user.username);
            res.json({ message: 'Você fugiu da batalha.' });
        } else {
            res.status(400).send('Nenhuma batalha para fugir.');
        }
    });

    // --- ROTAS DE LOJA E INVENTÁRIO ---

    router.get('/shop', authMiddleware, (req, res) => res.json(shopItems));

    router.post('/shop/buy', authMiddleware, async (req, res) => {
        const user = req.user;
        const { itemId } = req.body;
        if (!itemId) return res.status(400).send('ID do item não fornecido.');

        const item = shopItems.find(i => i.id === itemId);
        if (!item) return res.status(404).send('Item não encontrado na loja.');
        if (user.rpg.coins < item.price) return res.status(400).send('Moedas insuficientes para comprar este item.');

        const dataToUpdate = { coins: { decrement: item.price } };

        if (item.type === 'consumable') {
            const inventory = JSON.parse(user.rpg.inventory);
            const itemInInventory = inventory.find(i => i.itemId === itemId);
            if (itemInInventory) {
                itemInInventory.quantity++;
            } else {
                inventory.push({ itemId: item.id, name: item.name, description: item.description, type: item.type, effect: item.effect, quantity: 1 });
            }
            dataToUpdate.inventory = JSON.stringify(inventory);
        } else {
            if (item.bonus.stat === 'xp') dataToUpdate.xp = { increment: item.bonus.value };
            else if (['strength', 'dexterity', 'intelligence', 'defense'].includes(item.bonus.stat)) {
                await prisma.rPG.update({ where: { userId: user.id }, data: { stats: { [item.bonus.stat]: { increment: item.bonus.value } } } });
            }
        }

        const updatedRpg = await prisma.rPG.update({ where: { userId: user.id }, data: dataToUpdate });
        res.json({ message: `Você comprou ${item.name} com sucesso!`, rpg: updatedRpg });
    });

    router.get('/armory', authMiddleware, (req, res) => {
        const armoryItems = Object.values(ALL_WEAPONS)
            .filter(w => w.rarity !== 'supreme')
            .map(w => ({
                ...w,
                price: Math.floor((w.effects.passive_stats?.strength || 50) * 10 * (Object.keys(RPG_CHARACTERS).indexOf(w.rarity) + 1.5))
            }));
        res.json(armoryItems);
    });

    router.post('/armory/buy', authMiddleware, async (req, res) => {
        const user = req.user;
        const { weaponId } = req.body;
        const weaponData = ALL_WEAPONS[weaponId];
        if (!weaponData) return res.status(404).send('Arma não encontrada.');
        const price = Math.floor((weaponData.effects.passive_stats?.strength || 50) * 10 * (Object.keys(RPG_CHARACTERS).indexOf(weaponData.rarity) + 1.5));
        if (user.rpg.coins < price) return res.status(400).send('Moedas insuficientes.');
        
        const inventory = JSON.parse(user.rpg.inventory);
        if (inventory.some(i => i.itemId === weaponId)) return res.status(400).send('Você já possui esta arma.');
        
        inventory.push({ itemId: weaponData.id, name: weaponData.name, description: weaponData.description, type: 'weapon', rarity: weaponData.rarity, effects: weaponData.effects, quantity: 1 });

        const updatedRpg = await prisma.rPG.update({
            where: { userId: user.id },
            data: {
                coins: { decrement: price },
                inventory: JSON.stringify(inventory)
            }
        });

        res.json({ message: `Você forjou ${weaponData.name} na armaria!`, rpg: updatedRpg });
    });

    router.put('/inventory/equip', authMiddleware, async (req, res) => {
        const user = req.user;
        const { itemId } = req.body;
        const weaponToEquip = itemId ? ALL_WEAPONS[itemId] : null;

        const updatedRpg = await prisma.rPG.update({
            where: { userId: user.id },
            data: { equippedWeapon: weaponToEquip ? JSON.stringify(weaponToEquip) : null }
        });

        res.json({ message: itemId ? `${weaponToEquip.name} equipada!` : 'Arma desequipada.', rpg: updatedRpg });
    });

    router.post('/inventory/open-chest', authMiddleware, async (req, res) => {
        const user = req.user;
        const { instanceId } = req.body;
        if (!instanceId) return res.status(400).send('ID da instância do baú não fornecido.');

        const inventory = JSON.parse(user.rpg.inventory);
        const chestIndex = inventory.findIndex(i => i.instanceId === instanceId && i.type === 'chest');
        if (chestIndex === -1) return res.status(404).send('Baú não encontrado no seu inventário.');

        const chest = inventory[chestIndex];
        const rewardGenerator = CHEST_REWARDS[chest.id];
        if (!rewardGenerator) return res.status(500).send('Dados de recompensa para este baú não encontrados.');

        inventory.splice(chestIndex, 1);

        const dataToUpdate = { inventory: JSON.stringify(inventory) };
        const rewards = rewardGenerator();
        let rewardMessage = `Você abriu o ${chest.name} e recebeu:`;

        if (rewards.coins) { dataToUpdate.coins = { increment: rewards.coins }; rewardMessage += `\n- ${rewards.coins} Moedas 🪙`; }
        if (rewards.xp) { dataToUpdate.xp = { increment: rewards.xp }; rewardMessage += `\n- ${rewards.xp} XP ✨`; }

        const characters = JSON.parse(user.rpg.characters);
        if (rewards.character && Math.random() * 100 < rewards.character.chance) {
            let pool = rewards.character.pool;
            if (rewards.character.upgradeChance && Math.random() * 100 < rewards.character.upgradeChance) {
                pool = rewards.character.upgradePool;
            }
            const characterPool = RPG_CHARACTERS[pool];
            if (characterPool && characterPool.length > 0) {
                const newCharacter = { ...characterPool[Math.floor(Math.random() * characterPool.length)] };
                newCharacter.instanceId = crypto.randomBytes(8).toString('hex');
                characters.push(newCharacter);
                dataToUpdate.characters = JSON.stringify(characters);
                rewardMessage += `\n- Novo Herói: <strong class="rarity-${newCharacter.rarity}">${newCharacter.name}</strong>!`;
            }
        }
        // Lógica para armas e pets...

        const updatedRpg = await prisma.rPG.update({ where: { userId: user.id }, data: dataToUpdate });
        res.json({ message: rewardMessage, rpg: updatedRpg });
    });

    // --- ROTAS DE PERSONAGEM E PET ---

    router.post('/roll-character', authMiddleware, async (req, res) => {
        const user = req.user;
        const ROLL_COST = 100;
        if (user.rpg.coins < ROLL_COST) return res.status(400).send('Moedas insuficientes para rolar um personagem.');
        
        const random = Math.random() * 100;
        let cumulativeChance = 0;
        let chosenRarity = 'common';
        for (const tier of ROLL_CHANCES) {
            cumulativeChance += tier.chance;
            if (random < cumulativeChance) {
                chosenRarity = tier.rarity;
                break;
            }
        }
        const characterPool = RPG_CHARACTERS[chosenRarity];
        const newCharacter = { ...characterPool[Math.floor(Math.random() * characterPool.length)] };
        newCharacter.instanceId = crypto.randomBytes(8).toString('hex');
        
        const characters = JSON.parse(user.rpg.characters);
        characters.push(newCharacter);

        const updatedRpg = await prisma.rPG.update({
            where: { userId: user.id },
            data: {
                coins: { decrement: ROLL_COST },
                characters: JSON.stringify(characters)
            }
        });

        res.json({ message: `Você recrutou um novo herói: ${newCharacter.name}!`, newCharacter, rpg: updatedRpg });
    });

    router.post('/roll-pet', authMiddleware, async (req, res) => {
        const user = req.user;
        const ROLL_COST = 75;
        if (user.rpg.coins < ROLL_COST) return res.status(400).send('Moedas insuficientes para adotar um mascote.');

        const random = Math.random() * 100;
        let cumulativeChance = 0;
        let chosenRarity = 'common';
        for (const tier of PET_ROLL_CHANCES) {
            cumulativeChance += tier.chance;
            if (random < cumulativeChance) {
                chosenRarity = tier.rarity;
                break;
            }
        }

        const petPool = RPG_PETS[chosenRarity];
        const newPet = { ...petPool[Math.floor(Math.random() * petPool.length)] };
        
        const pets = JSON.parse(user.rpg.pets);
        if (pets.some(p => p.id === newPet.id)) {
            return res.status(400).json({ message: `Você tentou adotar um ${newPet.name}, mas já possui um! Suas moedas foram devolvidas.`, rpg: user.rpg });
        }
        pets.push(newPet);

        const updatedRpg = await prisma.rPG.update({
            where: { userId: user.id },
            data: {
                coins: { decrement: ROLL_COST },
                pets: JSON.stringify(pets)
            }
        });

        res.json({ message: `Você adotou um novo mascote: ${newPet.name}!`, newPet, rpg: updatedRpg });
    });

    router.post('/pets/evolve', authMiddleware, async (req, res) => {
        const user = req.user;
        const { petId } = req.body;
        if (!petId) return res.status(400).send('ID do mascote não fornecido.');

        const pets = JSON.parse(user.rpg.pets);
        const petIndex = pets.findIndex(p => p.id === petId);
        if (petIndex === -1) return res.status(404).send('Mascote não encontrado.');

        const evolutionData = PET_EVOLUTIONS[petId];
        if (!evolutionData) return res.status(400).send('Este mascote não pode evoluir.');

        if (user.rpg.coins < evolutionData.cost) return res.status(400).send(`Moedas insuficientes. Custo: ${evolutionData.cost} moedas.`);

        const allPets = Object.values(RPG_PETS).flat();
        const evolvedPetData = allPets.find(p => p.id === evolutionData.evolvesTo);
        if (!evolvedPetData) return res.status(500).send('Dados da evolução não encontrados.');

        const oldPet = pets[petIndex];
        pets[petIndex] = { ...evolvedPetData };

        const updatedRpg = await prisma.rPG.update({
            where: { userId: user.id },
            data: {
                coins: { decrement: evolutionData.cost },
                pets: JSON.stringify(pets)
            }
        });

        res.json({ message: `Parabéns! Seu ${oldPet.name} evoluiu para um ${evolvedPetData.name}!`, evolvedPet: evolvedPetData, rpg: updatedRpg });
    });

    // --- OUTRAS ROTAS RPG ---

    router.get('/ranking', authMiddleware, async (req, res) => {
        const topUsers = await prisma.user.findMany({
            where: { rpg: { isNot: null } },
            orderBy: [
                { rpg: { level: 'desc' } },
                { rpg: { xp: 'desc' } }
            ],
            take: 10,
            select: {
                username: true,
                avatarUrl: true,
                rpg: { select: { level: true, xp: true } }
            }
        });
        const publicRanking = topUsers.map(u => ({
            username: u.username,
            avatarUrl: u.avatarUrl,
            level: u.rpg.level,
            xp: u.rpg.xp
        }));
        res.json(publicRanking);
    });

    router.get('/all-characters', authMiddleware, (req, res) => res.json(RPG_CHARACTERS));

    router.post('/quest/claim', authMiddleware, async (req, res) => {
        const user = req.user;
        // A lógica de `checkAndAssignDailyQuest` precisa ser chamada antes desta rota
        const quest = user.rpg.dailyQuest;
        if (!quest || !quest.completed || quest.claimed) return res.status(400).send('Nenhuma recompensa de missão para coletar ou já foi coletada.');
        
        quest.claimed = true;
        const updatedRpg = await prisma.rPG.update({
            where: { userId: user.id },
            data: {
                xp: { increment: quest.reward.xp },
                coins: { increment: quest.reward.coins },
                // Aqui você salvaria o estado da quest no DB, se tivesse um modelo para isso
            }
        });

        const rewardMessage = `Recompensa da missão coletada: +${quest.reward.xp} XP e +${quest.reward.coins} moedas!`;
        res.json({ message: rewardMessage, rpg: updatedRpg });
    });

    return router;
};