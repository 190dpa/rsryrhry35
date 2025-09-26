const express = require('express');
const crypto = require('crypto');

module.exports = (prisma, authMiddleware, io) => {
    const router = express.Router();

    router.get('/', authMiddleware, async (req, res) => {
        const guilds = await prisma.guild.findMany({
            include: { _count: { select: { members: true } } }
        });
        const publicGuilds = guilds.map(g => ({
            id: g.id,
            name: g.name,
            tag: g.tag,
            isPrivate: g.isPrivate,
            memberCount: g._count.members
        }));
        res.json(publicGuilds);
    });

    router.get('/my-guild', authMiddleware, async (req, res) => {
        const user = req.user;
        if (!user.rpg.guildId) return res.status(404).send('Você não está em uma guilda.');

        const guild = await prisma.guild.findUnique({
            where: { id: user.rpg.guildId },
            include: {
                members: { include: { user: { select: { username: true, avatarUrl: true } } } }
            }
        });

        if (!guild) {
            await prisma.rPG.update({ where: { userId: user.id }, data: { guildId: null } });
            return res.status(404).send('Sua guilda não foi encontrada e seu status foi corrigido. Por favor, atualize.');
        }

        const owner = await prisma.user.findUnique({ where: { id: guild.ownerId }, select: { username: true } });

        const responseGuild = {
            ...guild,
            owner: owner.username,
            members: guild.members.map(m => m.user)
        };

        res.json(responseGuild);
    });

    router.post('/create', authMiddleware, async (req, res) => {
        const user = req.user;
        const { name, tag } = req.body;
        const creationCost = 100;

        if (!name || !tag) return res.status(400).send('Nome e tag da guilda são obrigatórios.');
        if (tag.length > 5) return res.status(400).send('A tag pode ter no máximo 5 caracteres.');
        if (user.rpg.guildId) return res.status(400).send('Você já está em uma guilda.');
        if (user.rpg.coins < creationCost) return res.status(400).send(`Moedas insuficientes. Custo: ${creationCost} moedas.`);

        const existingGuild = await prisma.guild.findFirst({ where: { OR: [{ name }, { tag }] } });
        if (existingGuild) return res.status(400).send('Já existe uma guilda com este nome ou tag.');

        const newGuild = await prisma.guild.create({
            data: {
                name,
                tag,
                ownerId: user.id,
                news: [{ id: crypto.randomBytes(4).toString('hex'), text: `A guilda "${name}" foi fundada!`, author: 'Sistema', date: new Date() }],
            }
        });

        const updatedRpg = await prisma.rPG.update({
            where: { userId: user.id },
            data: {
                coins: { decrement: creationCost },
                guildId: newGuild.id
            }
        });

        // Busca a conexão do usuário no mapa global para entrar na sala da guilda
        const userConnectionData = io.connectedUsers.get(user.username);
        const socket = userConnectionData ? io.sockets.sockets.get(userConnectionData.socketId) : null;
        if (socket) socket.join(newGuild.id);

        res.status(201).json({ message: `Guilda "${name}" criada com sucesso!`, rpg: updatedRpg });
    });

    router.post('/:guildId/join', authMiddleware, async (req, res) => {
        const user = req.user;
        const { guildId } = req.params;
        const { inviteCode } = req.body;
        if (user.rpg.guildId) return res.status(400).send('Você já está em uma guilda. Saia da atual para entrar em uma nova.');

        const guild = await prisma.guild.findUnique({ where: { id: guildId } });
        if (!guild) return res.status(404).send('Guilda não encontrada.');

        const bannedUsers = guild.bannedUsers || [];
        if (bannedUsers.includes(user.username)) return res.status(403).send('Você está banido desta guilda.');

        if (guild.isPrivate) {
            if (!inviteCode || inviteCode !== guild.inviteCode) return res.status(403).send('Código de convite inválido.');
        }

        const updatedRpg = await prisma.rPG.update({ where: { userId: user.id }, data: { guildId: guild.id } });

        const userConnectionData = io.connectedUsers.get(user.username);
        const socket = userConnectionData ? io.sockets.sockets.get(userConnectionData.socketId) : null;
        if (socket) socket.join(guild.id);

        io.to(guild.id).emit('guild_update');
        res.json({ message: `Você entrou na guilda "${guild.name}"!`, rpg: updatedRpg });
    });

    router.post('/leave', authMiddleware, async (req, res) => {
        const user = req.user;
        if (!user.rpg.guildId) return res.status(400).send('Você não está em uma guilda.');
        const guildId = user.rpg.guildId;

        const guild = await prisma.guild.findUnique({ where: { id: guildId } });
        if (guild.ownerId === user.id) return res.status(400).send('Você é o dono. Você deve dissolver a guilda para sair.');

        const updatedRpg = await prisma.rPG.update({ where: { userId: user.id }, data: { guildId: null } });

        const userConnectionData = io.connectedUsers.get(user.username);
        const socket = userConnectionData ? io.sockets.sockets.get(userConnectionData.socketId) : null;
        if (socket) socket.leave(guildId);

        io.to(guildId).emit('guild_update');
        res.json({ message: `Você saiu da guilda "${guild.name}".`, rpg: updatedRpg });
    });

    return router;
};