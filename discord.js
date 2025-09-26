const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

module.exports = (prisma, io, state, gameData, tempLoginTokens) => {
    const router = express.Router();
    const DISCORD_WEBHOOK_SECRET = process.env.DISCORD_WEBHOOK_SECRET || 'dolly029592392489385592bo013';
    const { ALL_WEAPONS, CHEST_DATA } = gameData;
    const { CUSTOM_BOSSES, WORLD_BOSS_DATA } = state.bossData;

    // --- ROTAS DE AUTENTICAÇÃO PARA O BOT ---

    router.post('/discord-auth/login', async (req, res) => {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).send('Email e senha são obrigatórios.');
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !bcrypt.compareSync(password, user.passwordHash)) return res.status(401).send('Email ou senha inválidos.');
        const tempToken = crypto.randomBytes(32).toString('hex');
        tempLoginTokens.set(tempToken, { username: user.username, expires: Date.now() + 5 * 60 * 1000 });
        res.json({ tempToken });
    });

    router.post('/discord-auth/register', async (req, res) => {
        const { username, email, password, securityQuestion, securityAnswer } = req.body;
        if (!username || !email || !password || !securityQuestion || !securityAnswer) return res.status(400).send('Todos os campos são obrigatórios.');
        const existingUser = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
        if (existingUser) return res.status(400).send('Usuário ou email já existe.');

        const newUser = await prisma.user.create({
            data: {
                username, email,
                passwordHash: bcrypt.hashSync(password, 10),
                ip: 'discord-registration',
                securityQuestion,
                securityAnswerHash: bcrypt.hashSync(securityAnswer, 10),
                rpg: { create: { characters: "[]", inventory: "[]", pets: "[]" } }
            }
        });

        // A função sendToDiscordWebhook pode ser chamada aqui se movida para um utilitário
        const tempToken = crypto.randomBytes(32).toString('hex');
        tempLoginTokens.set(tempToken, { username: newUser.username, expires: Date.now() + 5 * 60 * 1000 });
        res.status(201).json({ tempToken });
    });

    router.post('/login-with-token', async (req, res) => {
        const { tempToken } = req.body;
        if (!tempToken) return res.status(400).json({ message: 'Token não fornecido.' });
        const tokenData = tempLoginTokens.get(tempToken);
        if (!tokenData || tokenData.expires < Date.now()) {
            tempLoginTokens.delete(tempToken);
            return res.status(401).json({ message: 'Token inválido ou expirado. Por favor, gere um novo.' });
        }
        const user = await prisma.user.findUnique({ where: { username: tokenData.username } });
        if (!user) return res.status(404).json({ message: 'Usuário associado ao token não encontrado.' });
        tempLoginTokens.delete(tempToken);
        const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev-only-change-in-production';
        const sessionToken = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token: sessionToken });
    });

    // --- ROTA DE VERIFICAÇÃO ---

    router.post('/verify', async (req, res) => {
        const { authorization, discordId, username, password } = req.body;
        if (authorization !== DISCORD_WEBHOOK_SECRET) return res.status(403).send('Acesso negado.');
        if (!discordId || !username || !password) return res.status(400).send('ID do Discord, nome de usuário e senha são obrigatórios.');
        const user = await prisma.user.findFirst({ where: { username: { equals: username, mode: 'insensitive' } } });
        if (!user) return res.status(404).send('Usuário não encontrado no site. Verifique se o nome está correto.');
        if (!bcrypt.compareSync(password, user.passwordHash)) return res.status(401).send('Senha incorreta.');

        await prisma.user.update({
            where: { id: user.id },
            data: { discordId: discordId }
        });

        console.log(`Usuário '${user.username}' verificado e vinculado ao Discord ID: ${discordId}`);
        res.status(200).send('Usuário verificado e vinculado com sucesso.');
    });

    // --- ROTA PRINCIPAL DO WEBHOOK PARA AÇÕES DE ADMIN ---

    router.post('/webhook', async (req, res) => {
        const { authorization, action, targetUser, reason, newPassword, statToChange, value, item, operation, spawnerDiscordId, bossId, chestRarity } = req.body;
        if (authorization !== DISCORD_WEBHOOK_SECRET) return res.status(403).send('Acesso negado.');

        const actionsWithoutTarget = ['spawn_world_boss', 'spawn_specific_boss'];
        if (!action) return res.status(400).send('Ação não especificada.');
        if (!actionsWithoutTarget.includes(action) && !targetUser) return res.status(400).send('Usuário alvo não especificado.');

        let user, targetSocket;
        if (!actionsWithoutTarget.includes(action)) {
            user = await prisma.user.findUnique({ where: { username: targetUser }, include: { rpg: true } });
            if (!user) return res.status(404).send(`Usuário '${targetUser}' não encontrado.`);
            const targetConnection = state.connectedUsers.get(targetUser);
            targetSocket = targetConnection ? io.sockets.sockets.get(targetConnection.socketId) : null;
        }

        try {
            switch (action) {
                case 'ban':
                    await prisma.user.update({ where: { id: user.id }, data: { status: 'banned', banDetails: { bannedBy: 'Admin via Discord', reason: reason || 'Nenhum motivo fornecido.', expiresAt: null } } });
                    if (targetSocket) targetSocket.emit('banned', user.banDetails);
                    res.status(200).send(`Usuário '${targetUser}' foi banido com sucesso.`);
                    break;
                case 'unban':
                    if (user.status !== 'banned') return res.status(400).send(`Usuário '${targetUser}' não está banido.`);
                    await prisma.user.update({ where: { id: user.id }, data: { status: 'active', banDetails: null } });
                    if (targetSocket) targetSocket.emit('unbanned');
                    res.status(200).send(`Usuário '${targetUser}' foi desbanido com sucesso.`);
                    break;
                case 'kick':
                    if (targetSocket) {
                        targetSocket.emit('kicked', { reason: reason || 'Você foi desconectado por um administrador via Discord.' });
                        targetSocket.disconnect(true);
                        res.status(200).send(`Usuário '${targetUser}' foi desconectado da sessão.`);
                    } else {
                        res.status(404).send(`Usuário '${targetUser}' não está online para ser desconectado.`);
                    }
                    break;
                case 'change_password':
                    if (!newPassword) return res.status(400).send('Nova senha não fornecida.');
                    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: bcrypt.hashSync(newPassword, 10) } });
                    res.status(200).send(`Senha do usuário '${targetUser}' foi alterada com sucesso.`);
                    break;
                case 'set_rpg':
                    if (!statToChange || value === undefined) return res.status(400).send('É necessário especificar o status (level, xp, coins) e o valor.');
                    const numValue = parseInt(value, 10);
                    if (isNaN(numValue)) return res.status(400).send('O valor deve ser um número.');
                    if (['level', 'xp', 'coins'].includes(statToChange)) {
                        const operationType = operation === 'add' ? 'increment' : 'set';
                        await prisma.rPG.update({ where: { userId: user.id }, data: { [statToChange]: { [operationType]: numValue } } });
                        if (targetSocket) targetSocket.emit('rpg_update', { reason: `Seu status de RPG (${statToChange}) foi alterado por um administrador.` });
                        res.status(200).send(`O status '${statToChange}' de '${targetUser}' foi atualizado.`);
                    } else {
                        res.status(400).send("Status de RPG inválido. Use 'level', 'xp' ou 'coins'.");
                    }
                    break;
                case 'warn':
                    if (!reason) return res.status(400).send('O motivo do aviso é obrigatório.');
                    if (targetSocket) {
                        targetSocket.emit('banWarning', { reason: reason, admin: 'Admin via Discord' });
                        res.status(200).send(`Aviso enviado para '${targetUser}'.`);
                    } else {
                        res.status(404).send(`Usuário '${targetUser}' não está online para receber o aviso.`);
                    }
                    break;
                case 'give_item':
                    if (!item) return res.status(400).send('Nome do item não fornecido.');
                    const itemData = ALL_WEAPONS[item];
                    if (itemData && itemData.rarity === 'supreme') {
                        const inventory = JSON.parse(user.rpg.inventory);
                        inventory.push({ itemId: itemData.id, name: itemData.name, description: itemData.description, type: 'weapon', rarity: itemData.rarity, effects: itemData.effects, quantity: 1 });
                        await prisma.rPG.update({ where: { userId: user.id }, data: { inventory: JSON.stringify(inventory) } });
                        if (targetSocket) targetSocket.emit('rpg_update', { reason: `Você recebeu a ${itemData.name} de um administrador!` });
                        res.status(200).send(`Item '${itemData.name}' entregue para ${targetUser}.`);
                    } else {
                        res.status(400).send("Item de admin inválido. Itens disponíveis: 'espada_suprema_adm'.");
                    }
                    break;
                case 'give_luck':
                    const luckMultiplier = parseInt(value, 10);
                    // Esta lógica ainda é complexa para o DB, precisa de um modelo de 'effects' ou similar.
                    // Por agora, vamos apenas notificar.
                    if (targetSocket) targetSocket.emit('rpg_update', { reason: `🍀 SORTE RECEBIDA! Sua próxima rolagem de personagem terá as chances de raridades altas multiplicadas por ${luckMultiplier}x!` });
                    res.status(200).send(`Buff de sorte de ${luckMultiplier}x concedido para ${targetUser} (1 uso).`);
                    break;
                case 'spawn_world_boss':
                    if (state.worldBoss) return res.status(400).send('Um Chefe Mundial já está ativo.');
                    state.setWorldBoss({ ...WORLD_BOSS_DATA, currentHp: WORLD_BOSS_DATA.maxHp, damageDealt: new Map() });
                    console.log(`Chefe Mundial ${state.worldBoss.name} foi invocado por um admin via Discord.`);
                    io.emit('worldboss_update', { name: state.worldBoss.name, currentHp: state.worldBoss.currentHp, maxHp: state.worldBoss.maxHp, imageUrl: state.worldBoss.imageUrl });
                    res.status(200).json({ message: 'Chefe Mundial invocado com sucesso.', worldBoss: state.worldBoss });
                    break;
                case 'spawn_specific_boss':
                    if (state.worldBoss) return res.status(400).send('Um Chefe Mundial ou evento de chefe já está ativo.');
                    const bossData = CUSTOM_BOSSES[bossId];
                    if (!bossData) return res.status(404).send('O chefe especificado não existe.');
                    state.setWorldBoss({ ...bossData, currentHp: bossData.maxHp, damageDealt: new Map() });
                    console.log(`Chefe customizado ${state.worldBoss.name} foi invocado por um admin via Discord.`);
                    io.emit('worldboss_update', { name: state.worldBoss.name, currentHp: state.worldBoss.currentHp, maxHp: state.worldBoss.maxHp, imageUrl: state.worldBoss.imageUrl });
                    res.status(200).json({ message: 'Chefe customizado invocado com sucesso.', worldBoss: state.worldBoss });
                    break;
                case 'give_chest':
                    if (!chestRarity) return res.status(400).send('A raridade do baú é obrigatória.');
                    const chestId = `${chestRarity.toLowerCase()}_chest`;
                    const chestData = CHEST_DATA[chestId];
                    if (!chestData) return res.status(404).send(`A raridade de baú '${chestRarity}' não existe.`);
                    
                    const inventory = JSON.parse(user.rpg.inventory);
                    const chestInstance = { ...chestData, instanceId: crypto.randomBytes(8).toString('hex') };
                    inventory.push(chestInstance);
                    
                    await prisma.rPG.update({ where: { userId: user.id }, data: { inventory: JSON.stringify(inventory) } });
                    
                    if (targetSocket) targetSocket.emit('rpg_update', { reason: `🎁 Você recebeu um ${chestData.name} de um administrador!` });
                    res.status(200).send(`Baú '${chestData.name}' entregue para ${targetUser}.`);
                    break;
                default:
                    res.status(400).send('Ação inválida.');
            }
        } catch (error) {
            console.error('Erro ao processar webhook do Discord:', error);
            res.status(500).send('Erro interno do servidor.');
        }
    });

    return router;
};