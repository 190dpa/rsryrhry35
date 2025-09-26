const express = require('express');
const crypto = require('crypto');

module.exports = (prisma, authMiddleware, adminMiddleware, optionalAuthMiddleware, io, botFunctions) => {
    const router = express.Router();

    router.post('/tickets', optionalAuthMiddleware, async (req, res) => {
        const { category, description, email } = req.body;
        let creatorId;
        let creatorUsername;

        if (req.user) {
            creatorId = req.user.id;
            creatorUsername = req.user.username;
        } else {
            if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
                return res.status(400).send('Um email de contato válido é obrigatório para visitantes.');
            }
            // Para visitantes, não temos um ID de usuário, então precisamos de uma forma de identificá-los.
            // Por simplicidade, vamos criar um usuário "fantasma" ou apenas usar o email.
            // A melhor abordagem seria ter um campo `contactEmail` no ticket.
            // Por agora, vamos associar a um usuário sistema ou deixar nulo.
            // AVISO: A lógica abaixo precisa de um usuário "sistema" ou ser adaptada.
            // Vamos assumir que não associamos a um usuário por enquanto.
            // Esta parte é complexa sem um usuário. Vamos focar em usuários logados.
            return res.status(403).send("A criação de tickets de suporte está disponível apenas para usuários logados no momento.");
        }

        if (!category || !description) return res.status(400).send('Categoria e descrição são obrigatórias.');

        try {
            const newTicket = await prisma.ticket.create({
                data: {
                    category,
                    description,
                    creatorId: creatorId,
                },
                include: { creator: { select: { username: true } } }
            });

            // Notifica admins online via Socket.IO
            io.emit('admin:newTicket', { ...newTicket, user: { username: creatorUsername } });

            // Cria canal no Discord
            if (botFunctions && botFunctions.createTicketChannel) {
                const channelId = await botFunctions.createTicketChannel({ ...newTicket, user: { username: creatorUsername } });
                if (channelId) {
                    await prisma.ticket.update({ where: { id: newTicket.id }, data: { discordChannelId: channelId } });
                }
            }

            res.status(201).json(newTicket);
        } catch (error) {
            console.error("Erro ao criar ticket:", error);
            res.status(500).send("Erro interno ao criar ticket.");
        }
    });

    router.get('/my-ticket', authMiddleware, async (req, res) => {
        const openTicket = await prisma.ticket.findFirst({
            where: {
                creatorId: req.user.id,
                status: 'open'
            }
        });
        if (openTicket) res.json(openTicket);
        else res.status(404).send('Nenhum ticket aberto encontrado para este usuário.');
    });

    router.get('/tickets', authMiddleware, adminMiddleware, async (req, res) => {
        const tickets = await prisma.ticket.findMany({
            orderBy: { createdAt: 'desc' },
            include: { creator: { select: { username: true } } }
        });
        const formattedTickets = tickets.map(t => ({ ...t, user: { username: t.creator.username } }));
        res.json(formattedTickets);
    });

    router.get('/tickets/:ticketId', authMiddleware, async (req, res) => {
        const { ticketId } = req.params;
        const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });

        if (!ticket) return res.status(404).send('Ticket não encontrado.');
        if (!req.user.isAdmin && req.user.id !== ticket.creatorId) return res.status(403).send('Acesso negado.');

        const messages = await prisma.ticketMessage.findMany({
            where: { ticketId: ticketId },
            orderBy: { createdAt: 'asc' },
            include: { sender: { select: { username: true, isAdmin: true } } }
        });

        const formattedMessages = messages.map(m => ({ ...m, sender: { username: m.sender.username, isAdmin: m.sender.isAdmin } }));
        res.json({ ticket, messages: formattedMessages });
    });

    router.put('/tickets/:ticketId/status', authMiddleware, adminMiddleware, async (req, res) => {
        const { ticketId } = req.params;
        const { status } = req.body;
        if (!['open', 'resolved'].includes(status)) return res.status(400).send("Status inválido. Use 'open' ou 'resolved'.");

        const updatedTicket = await prisma.ticket.update({
            where: { id: ticketId },
            data: { status }
        });

        // Notificar o criador do ticket sobre a mudança de status
        // (Lógica de socket.io pode ser adicionada aqui)

        res.send(`Status do ticket atualizado para ${status}.`);
    });

    return router;
};