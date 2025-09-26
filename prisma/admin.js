const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = (prisma, middlewares, io, connectedUsers, bannedIPs, logBuffer) => {
    const router = express.Router();
    const { authMiddleware, adminMiddleware, supremeAdminMiddleware, adminOrTesterMiddleware, guildOwnerMiddleware } = middlewares;
    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev-only-change-in-production';

    // --- ROTAS DE GERENCIAMENTO DE USUÁRIOS ---

    router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
        const allUsers = await prisma.user.findMany({ include: { rpg: { select: { guildId: true } } } });
        const userList = allUsers.filter(u => u.username !== req.user.username).map(u => {
            const { passwordHash, ...userWithoutPassword } = u;
            return userWithoutPassword;
        });
        res.json(userList);
    });

    router.put('/users/:username/promote', authMiddleware, supremeAdminMiddleware, async (req, res) => {
        const { username } = req.params;
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return res.status(404).send('Usuário não encontrado.');
        if (user.isAdmin) return res.status(400).send('Usuário já é um administrador ou superior.');

        await prisma.user.update({ where: { id: user.id }, data: { isAdmin: true } });

        const targetConnection = connectedUsers.get(username);
        if (targetConnection) {
            const targetSocket = io.sockets.sockets.get(targetConnection.socketId);
            if (targetSocket) targetSocket.emit('force_reload', { reason: 'Seu status de conta foi atualizado. A página será recarregada.' });
        }
        res.send(`Usuário ${username} foi promovido a administrador.`);
    });

    router.put('/users/:username/demote', authMiddleware, supremeAdminMiddleware, async (req, res) => {
        const { username } = req.params;
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return res.status(404).send('Usuário não encontrado.');
        if (!user.isAdmin) return res.status(400).send('Usuário não é um administrador.');
        if (user.isSupremeAdmin) return res.status(403).send('Não é possível rebaixar um administrador supremo.');

        await prisma.user.update({ where: { id: user.id }, data: { isAdmin: false } });

        const targetConnection = connectedUsers.get(username);
        if (targetConnection) io.to(targetConnection.socketId).emit('force_reload', { reason: 'Seu status de conta foi rebaixado. A página será recarregada.' });
        res.send(`Usuário ${username} foi rebaixado para usuário padrão.`);
    });

    router.put('/users/:username/ban', authMiddleware, adminMiddleware, async (req, res) => {
        const { username } = req.params;
        const { reason, durationDays } = req.body;
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return res.status(404).send('Usuário não encontrado.');
        if (user.isSupremeAdmin || (user.isAdmin && !req.user.isSupremeAdmin)) return res.status(403).send('Permissão negada para banir este usuário.');

        if (user.status === 'banned') {
            await prisma.user.update({ where: { id: user.id }, data: { status: 'unbanned', banDetails: null } });
            const socketId = connectedUsers.get(username)?.socketId;
            if (socketId) {
                const targetSocket = io.sockets.sockets.get(socketId);
                if (targetSocket) targetSocket.emit('unbanned');
            }
            res.send(`Usuário ${username} foi desbanido.`);
        } else {
            const expiresAt = durationDays ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000) : null;
            const banDetails = { bannedBy: req.user.username, reason: reason || 'Nenhum motivo fornecido.', expiresAt };

            await prisma.user.update({ where: { id: user.id }, data: { status: 'banned', banDetails: banDetails } });

            const socketId = connectedUsers.get(username)?.socketId;
            if (socketId) {
                const targetSocket = io.sockets.sockets.get(socketId);
                if (targetSocket) targetSocket.emit('banned', banDetails);
            }
            res.send(`Usuário ${username} foi banido.`);
        }
    });

    router.delete('/users/:username', authMiddleware, adminMiddleware, async (req, res) => {
        const { username } = req.params;
        const { reason } = req.body;
        const adminUsername = req.user.username;
        const userToDelete = await prisma.user.findUnique({ where: { username }, include: { rpg: true } });
        if (!userToDelete) return res.status(404).send('Usuário não encontrado.');
        if (userToDelete.isAdmin && !req.user.isSupremeAdmin) return res.status(403).send('Permissão negada para excluir este usuário.');
        if (userToDelete.isSupremeAdmin) return res.status(403).send('Não é possível excluir o Administrador Supremo.');

        const targetConnection = connectedUsers.get(username);
        if (targetConnection) {
            const targetSocket = io.sockets.sockets.get(targetConnection.socketId);
            if (targetSocket) {
                targetSocket.emit('account_deleted', { reason: reason || 'Sua conta foi encerrada por um administrador.' });
                targetSocket.disconnect(true);
            }
        }

        await prisma.guild.deleteMany({ where: { ownerId: userToDelete.id } });
        await prisma.user.delete({ where: { id: userToDelete.id } });

        console.log(`Usuário "${username}" foi excluído pelo admin "${adminUsername}".`);
        res.send(`Usuário ${username} foi excluído com sucesso.`);
    });

    router.put('/users/:username/password', authMiddleware, supremeAdminMiddleware, async (req, res) => {
        const { username } = req.params;
        const { newPassword } = req.body;
        if (!newPassword) return res.status(400).send('Nova senha não fornecida.');
        
        await prisma.user.update({
            where: { username },
            data: { passwordHash: bcrypt.hashSync(newPassword, 10) }
        });

        res.send(`Senha do usuário ${username} alterada com sucesso.`);
    });

    // --- ROTAS DE ADMINISTRAÇÃO DO SISTEMA ---

    router.get('/banned-ips', authMiddleware, adminMiddleware, (req, res) => res.json(Array.from(bannedIPs)));

    router.put('/ip/:ip/toggle-ban', authMiddleware, adminMiddleware, (req, res) => {
        const { ip } = req.params;
        const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$|^::1$|^::ffff:[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/;
        if (!ipRegex.test(ip)) return res.status(400).send('Formato de IP inválido.');
        if (bannedIPs.has(ip)) {
            bannedIPs.delete(ip);
            res.send(`IP ${ip} foi desbanido.`);
        } else {
            bannedIPs.add(ip);
            for (const [username, connectionData] of connectedUsers.entries()) {
                if (connectionData.ip === ip) {
                    const targetSocket = io.sockets.sockets.get(connectionData.socketId);
                    if (targetSocket) {
                        targetSocket.emit('kicked', { reason: 'Seu endereço de IP foi banido por um administrador.' });
                        targetSocket.disconnect(true);
                    }
                }
            }
            res.send(`IP ${ip} foi banido e todos os usuários conectados com este IP foram desconectados.`);
        }
    });

    router.post('/logs', (req, res) => {
        const { authorization } = req.body;
        if (authorization !== (process.env.DISCORD_WEBHOOK_SECRET || 'dolly029592392489385592bo013')) return res.status(403).send('Acesso negado.');
        res.json([...logBuffer]);
    });

    // --- ROTAS DE ADMIN SUPREMO E TESTER ---

    router.post('/impersonate/tester', authMiddleware, supremeAdminMiddleware, async (req, res) => {
        const testerUser = await prisma.user.findFirst({ where: { isTester: true } });
        if (!testerUser) return res.status(404).send('Conta de Tester não encontrada.');
        const token = jwt.sign({ username: testerUser.username }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    });

    router.put('/me/rpg', authMiddleware, supremeAdminMiddleware, async (req, res) => {
        const user = req.user;
        const { level, characterIds } = req.body;
        const dataToUpdate = {};
        if (level !== undefined) dataToUpdate.level = parseInt(level, 10) || user.rpg.level;
        if (Array.isArray(characterIds)) {
            // Lógica para reconstruir a lista de personagens
        }
        await prisma.rPG.update({ where: { userId: user.id }, data: dataToUpdate });
        
        const targetConnection = connectedUsers.get(user.username);
        if (targetConnection) io.to(targetConnection.socketId).emit('rpg_update', { reason: `Seus status de RPG foram alterados por você no painel supremo.` });
        res.json({ message: 'Seus dados de RPG foram atualizados com sucesso.' });
    });

    router.post('/donate-to-player', authMiddleware, supremeAdminMiddleware, async (req, res) => {
        const { username, xp, coins, message } = req.body;
        if (!username) return res.status(400).send('Nome de usuário do jogador é obrigatório.');
        const targetUser = await prisma.user.findUnique({ where: { username } });
        if (!targetUser) return res.status(404).send('Jogador não encontrado.');
        
        const xpToAdd = parseInt(xp, 10) || 0;
        const coinsToAdd = parseInt(coins, 10) || 0;
        if (xpToAdd <= 0 && coinsToAdd <= 0) return res.status(400).send('Forneça uma quantidade positiva de XP ou moedas.');

        await prisma.rPG.update({ where: { userId: targetUser.id }, data: { xp: { increment: xpToAdd }, coins: { increment: coinsToAdd } } });

        const targetConnection = connectedUsers.get(username);
        if (targetConnection) {
            let reason = `Você recebeu ${xpToAdd} XP e ${coinsToAdd} moedas de ${req.user.username}!`;
            if (message) reason += `\n\nMensagem do admin: "${message}"`;
            io.to(targetConnection.socketId).emit('rpg_update', { reason });
        }
        res.json({ message: `Doação para ${username} enviada com sucesso.` });
    });

    // --- ROTAS DE ADMIN DE GUILDA ---

    router.post('/guilds/mute', authMiddleware, guildOwnerMiddleware, async (req, res) => {
        const { username, durationMinutes } = req.body;
        const guild = req.guild;
        const targetUser = await prisma.user.findUnique({ where: { username } });
        if (!targetUser || targetUser.id === guild.ownerId) return res.status(400).send('O dono não pode ser silenciado.');

        const mutedUsers = guild.mutedUsers || {};
        const durationMs = (parseInt(durationMinutes, 10) || 5) * 60 * 1000;
        mutedUsers[username] = Date.now() + durationMs;

        await prisma.guild.update({ where: { id: guild.id }, data: { mutedUsers } });

        const targetConnectionData = connectedUsers.get(username);
        const socket = targetConnectionData ? io.sockets.sockets.get(targetConnectionData.socketId) : null;
        if (socket) socket.emit('guild_notification', { title: 'Punição de Guilda', message: `Você foi silenciado no chat da guilda por ${durationMinutes || 5} minutos.` });
        io.to(guild.id).emit('guild_update');
        res.json({ message: `${username} foi silenciado no chat da guilda.` });
    });

    router.post('/guilds/news', authMiddleware, guildOwnerMiddleware, async (req, res) => {
        const { text } = req.body;
        const guild = req.guild;
        if (!text) return res.status(400).send('O texto da notícia não pode ser vazio.');
        
        const news = guild.news || [];
        const newNews = { id: crypto.randomBytes(4).toString('hex'), text, author: req.user.username, date: new Date() };
        news.unshift(newNews);

        await prisma.guild.update({ where: { id: guild.id }, data: { news } });

        io.to(guild.id).emit('guild_update');
        res.status(201).json({ message: 'Notícia publicada com sucesso.' });
    });

    router.put('/guilds/settings', authMiddleware, guildOwnerMiddleware, async (req, res) => {
        const { isPrivate, inviteCode } = req.body;
        const guild = req.guild;
        const dataToUpdate = {};

        if (typeof isPrivate === 'boolean') {
            dataToUpdate.isPrivate = isPrivate;
            if (isPrivate) {
                dataToUpdate.inviteCode = (inviteCode && inviteCode.trim() !== '') ? inviteCode.trim() : (guild.inviteCode || crypto.randomBytes(3).toString('hex'));
            } else {
                dataToUpdate.inviteCode = null;
            }
        }

        const updatedGuild = await prisma.guild.update({ where: { id: guild.id }, data: dataToUpdate });
        io.to(guild.id).emit('guild_update');
        res.json({ message: 'Configurações da guilda atualizadas.', guild: updatedGuild });
    });

    return router;
};