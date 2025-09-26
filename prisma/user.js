const express = require('express');
const bcrypt = require('bcryptjs');
const fetch = require('node-fetch');

module.exports = (prisma, authMiddleware) => {
    const router = express.Router();

    router.get('/me', authMiddleware, (req, res) => {
        // A lógica de conceder itens de admin já está no server.js,
        // mas idealmente seria movida para uma função de "verificação de login" mais centralizada.
        const { passwordHash, ...userWithoutPassword } = req.user;
        res.json(userWithoutPassword);
    });

    router.put('/me/roblox', authMiddleware, async (req, res) => {
        const { robloxUsername } = req.body;
        if (!robloxUsername) return res.status(400).send('Nome de usuário do Roblox não fornecido.');
        try {
            const usersApiUrl = 'https://users.roblox.com/v1/usernames/users';
            const usersResponse = await fetch(usersApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ usernames: [robloxUsername], excludeBannedUsers: true })
            });
            if (!usersResponse.ok) return res.status(404).send('Usuário do Roblox não encontrado ou erro na API de usuários.');

            const usersData = await usersResponse.json();
            if (!usersData.data || usersData.data.length === 0) return res.status(404).send('Nome de usuário do Roblox não encontrado.');

            const userId = usersData.data[0].id;
            const canonicalUsername = usersData.data[0].name;

            const thumbResponse = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`);
            if (!thumbResponse.ok) return res.status(500).send('Não foi possível carregar o avatar do Roblox.');

            const thumbData = await thumbResponse.json();
            const avatarUrl = thumbData.data[0].imageUrl;

            await prisma.user.update({
                where: { id: req.user.id },
                data: { robloxUsername: canonicalUsername, avatarUrl: avatarUrl }
            });

            res.json({ message: 'Perfil do Roblox atualizado com sucesso.', avatarUrl: avatarUrl });
        } catch (error) {
            console.error('Erro ao buscar dados do Roblox:', error);
            res.status(500).send('Erro interno do servidor ao processar a solicitação do Roblox.');
        }
    });

    router.put('/me/avatar', authMiddleware, async (req, res) => {
        const { avatarData } = req.body;
        if (!avatarData || !avatarData.startsWith('data:image/')) {
            return res.status(400).send('Dados de avatar inválidos. Esperado um Data URL (Base64).');
        }

        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: { avatarUrl: avatarData }
        });

        res.json({ message: 'Avatar atualizado com sucesso.', avatarUrl: updatedUser.avatarUrl });
    });

    router.put('/me/password', authMiddleware, async (req, res) => {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).send('Senha atual e nova senha são obrigatórias.');
        }

        const user = req.user;
        if (!bcrypt.compareSync(currentPassword, user.passwordHash)) {
            return res.status(403).send('Senha atual incorreta.');
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash: bcrypt.hashSync(newPassword, 10) }
        });

        res.send('Senha alterada com sucesso.');
    });

    return router;
};