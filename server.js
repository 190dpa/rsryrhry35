const express = require('express');
const http = require('http');
const fetch = require('node-fetch');
const { Server } = require("socket.io");
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

// --- Importação dos Módulos ---
const gameData = require('./prisma/gameData.js');
const authRoutes = require('./prisma/auth.js');      // Na pasta prisma
const userRoutes = require('./prisma/user.js');      // Na pasta prisma
const adminRoutes = require('./prisma/admin.js');    // Na pasta prisma
const rpgRoutes = require('./prisma/rpg.js');        // Na pasta prisma
const discordRoutes = require('./discord.js');       // Na pasta raiz
const guildRoutes = require('./guild.js');         // Na pasta raiz
const supportRoutes = require('./prisma/support.js');  // Na pasta prisma

// --- Configuração Inicial do Servidor ---
const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.use((req, res, next) => {
    try {
        const credits = Buffer.from('Q1JJQURPIFBPUiBEMExMWSBbUkdCXSBmcm9udGVuZCBlIG8gYmFja2VuZCBmZWl0byB0YW1iZW0gcG9yIGQwbGx5IFtzZXJ2aWRvciB1dGlsaXphZG8gcmVuZGVyXQ==', 'base64').toString('utf-8');
        res.setHeader('X-Created-By', credits);
    } catch (e) { /* ignora em caso de erro */ }
    next();
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 20000
});
const prisma = new PrismaClient();

// --- Constantes e Variáveis de Ambiente ---
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev-only-change-in-production';
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'fallback-secret-for-dev-only-change-in-production') {
    console.error('\n\n\x1b[31m%s\x1b[0m\n\n', '**************************************************************************************');
    console.error('\x1b[31m%s\x1b[0m', 'ATENÇÃO: A APLICAÇÃO ESTÁ USANDO UMA JWT_SECRET PADRÃO E INSEGURA EM PRODUÇÃO!');
    console.error('\x1b[33m%s\x1b[0m', 'Configure a variável de ambiente "JWT_SECRET" no seu serviço do Render com um valor seguro.');
    console.error('\x1b[31m%s\x1b[0m\n', '**************************************************************************************');
}

// --- Sistema de Log em Memória ---
const MAX_LOG_ENTRIES = 150;
const logBuffer = [];
const originalConsole = { log: console.log, error: console.error, warn: console.warn, info: console.info };

function captureLog(level, ...args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' ');
    originalConsole[level](`[${timestamp}] [${level.toUpperCase()}]`, ...args);
    logBuffer.push(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    if (logBuffer.length > MAX_LOG_ENTRIES) logBuffer.shift();
}

console.log = (...args) => captureLog('log', ...args);
console.error = (...args) => captureLog('error', ...args);
console.warn = (...args) => captureLog('warn', ...args);
console.info = (...args) => captureLog('info', ...args);

// --- Servir os arquivos estáticos (Front-end) ---
app.use(express.static(path.join(__dirname)));

// --- Estado Global em Memória (Dados não persistentes) ---
const connectedUsers = new Map();
const bannedIPs = new Set();
const activeBattles = new Map();
const activeDungeons = new Map();
const tempLoginTokens = new Map();
let globalMuteState = { isMuted: false, expiresAt: null, mutedBy: null };
let globalMuteTimeout = null;
let worldBoss = null;

// --- Funções Auxiliares Globais ---
function censorMessage(message) {
    let censoredText = message;
    gameData.badWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        censoredText = censoredText.replace(regex, '*'.repeat(word.length));
    });
    return censoredText;
}

const getPlayerAbilities = (user) => {
    const playerAbilities = [];
    if (!user || !user.rpg || !user.rpg.characters) return [];

    if (user.isSupremeAdmin) {
        playerAbilities.push(...Object.values(gameData.ABILITIES));
    } else {
        user.rpg.characters.forEach(char => {
            if (char.abilityId && gameData.ABILITIES[char.abilityId] && !playerAbilities.some(a => a.id === char.abilityId)) {
                playerAbilities.push(gameData.ABILITIES[char.abilityId]);
            }
        });
    }
    if (user.rpg.characters.some(c => c.id === 'mundo_miojoexp')) {
        ['cozinha_fatal', 'paralisia_cerebral', 'ronaldo'].forEach(abilityId => {
            if (gameData.ABILITIES[abilityId] && !playerAbilities.some(a => a.id === abilityId)) {
                playerAbilities.push(gameData.ABILITIES[abilityId]);
            }
        });
    }
    return playerAbilities;
};

function calculatePlayerBattleStats(user) {
    if (!user || !user.rpg) return { strength: 1, dexterity: 1, intelligence: 1, defense: 1 };

    if (user.isSupremeAdmin && user.rpg.characters.some(c => c.id === 'chatyniboss')) {
        return { strength: 99999, dexterity: 99999, intelligence: 99999, defense: 99999 };
    }
    
    const finalStats = { ...user.rpg.stats };
    (user.rpg.characters || []).forEach(char => {
        finalStats.strength += char.stats.strength;
        finalStats.dexterity += char.stats.dexterity;
        finalStats.intelligence += char.stats.intelligence;
        finalStats.defense += char.stats.defense;
    });
    if (user.rpg.equippedWeapon && user.rpg.equippedWeapon.effects.passive_stats) {
        for (const stat in user.rpg.equippedWeapon.effects.passive_stats) {
            finalStats[stat] = (finalStats[stat] || 0) + user.rpg.equippedWeapon.effects.passive_stats[stat];
        }
    }
    (user.rpg.pets || []).forEach(pet => {
        if (pet.effects && pet.effects.passive_stats) {
            for (const stat in pet.effects.passive_stats) {
                finalStats[stat] = (finalStats[stat] || 0) + pet.effects.passive_stats[stat];
            }
        }
    });
    return finalStats;
}

// --- Middlewares de Autenticação e Autorização ---
const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    try {
        const decodedUser = jwt.verify(token, JWT_SECRET);
        const user = await prisma.user.findUnique({
            where: { username: decodedUser.username },
            include: { rpg: true },
        });

        if (!user) return res.sendStatus(404);
        if (user.status === 'banned') return res.status(403).json({ message: 'Esta conta foi banida.', banDetails: user.banDetails });
        
        if (user.rpg) {
            user.rpg.characters = JSON.parse(user.rpg.characters);
            user.rpg.inventory = JSON.parse(user.rpg.inventory);
            user.rpg.pets = JSON.parse(user.rpg.pets);
            user.rpg.equippedWeapon = user.rpg.equippedWeapon ? JSON.parse(user.rpg.equippedWeapon) : null;
        }

        req.user = user;
        next();
    } catch (err) {
        return res.sendStatus(403);
    }
};

const optionalAuthMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return next();
    jwt.verify(token, JWT_SECRET, async (err, decodedUser) => {
        if (err) return next();
        const foundUser = await prisma.user.findUnique({ where: { username: decodedUser.username }, include: { rpg: true } });
        if (foundUser) {
            if (foundUser.rpg) {
                foundUser.rpg.characters = JSON.parse(foundUser.rpg.characters);
                foundUser.rpg.inventory = JSON.parse(foundUser.rpg.inventory);
                foundUser.rpg.pets = JSON.parse(foundUser.rpg.pets);
                foundUser.rpg.equippedWeapon = foundUser.rpg.equippedWeapon ? JSON.parse(foundUser.rpg.equippedWeapon) : null;
            }
            req.user = foundUser;
        }
        next();
    });
};

const adminMiddleware = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) return res.status(403).send('Acesso negado. Requer privilégios de administrador.');
    next();
};

const supremeAdminMiddleware = (req, res, next) => {
    if (!req.user || !req.user.isSupremeAdmin) return res.status(403).send('Acesso negado. Requer privilégios de administrador supremo.');
    next();
};

const adminOrTesterMiddleware = (req, res, next) => {
    if (!req.user || (!req.user.isAdmin && !req.user.isTester)) return res.status(403).send('Acesso negado. Requer privilégios de administrador ou tester.');
    next();
};

const guildOwnerMiddleware = async (req, res, next) => {
    const user = req.user;
    if (!user.rpg.guildId) return res.status(403).send('Você não está em uma guilda.');
    const guild = await prisma.guild.findUnique({ where: { id: user.rpg.guildId } });
    if (!guild) {
        await prisma.rPG.update({ where: { userId: user.id }, data: { guildId: null } });
        return res.status(404).send('Guilda não encontrada.');
    }
    if (guild.ownerId !== user.id) return res.status(403).send('Apenas o dono da guilda pode realizar esta ação.');
    req.guild = guild;
    next();
};

// --- Rotas Globais Simples ---
app.get('/api/status', (req, res) => res.json({ onlineUsers: connectedUsers.size }));

// --- Lógica do Socket.IO ---
io.on('connection', async (socket) => {
    const token = socket.handshake.auth.token;
    const ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    console.log(`Um usuário se conectou: ${socket.id} do IP: ${ip}`);

    if (bannedIPs.has(ip)) {
        socket.emit('kicked', { reason: 'Seu endereço de IP está banido.' });
        return socket.disconnect(true);
    }

    let user = null;
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            user = await prisma.user.findUnique({ where: { username: decoded.username }, include: { rpg: true } });

            if (user) {
                user.rpg.characters = JSON.parse(user.rpg.characters);
                user.rpg.inventory = JSON.parse(user.rpg.inventory);
                user.rpg.pets = JSON.parse(user.rpg.pets);
                user.rpg.equippedWeapon = user.rpg.equippedWeapon ? JSON.parse(user.rpg.equippedWeapon) : null;

                const oldConnection = connectedUsers.get(user.username);
                if (oldConnection && oldConnection.socketId !== socket.id) {
                    const oldSocket = io.sockets.sockets.get(oldConnection.socketId);
                    if (oldSocket) {
                        oldSocket.emit('kicked', { reason: 'Você se conectou de um novo local. Esta sessão foi encerrada.' });
                        oldSocket.disconnect(true);
                    }
                }
                connectedUsers.set(user.username, { socketId: socket.id, ip: ip });
                if (user.rpg && user.rpg.guildId) socket.join(user.rpg.guildId);
            }
        } catch (err) {
            socket.emit('auth_error', { message: 'Sua sessão expirou. Por favor, faça login novamente.' });
            socket.disconnect(true);
        }
    }

    socket.on('sendMessage', async (message) => {
        if (!user || !user.robloxUsername) return;
        if (message.startsWith('/')) { handleChatCommand(user, message); return; }
        
        if (globalMuteState.isMuted && !user.isAdmin) return socket.emit('chat_error', { message: `O chat está silenciado globalmente por ${globalMuteState.mutedBy}.` });
        
        let guildTag = null;
        if (user.rpg && user.rpg.guildId) {
            const guild = await prisma.guild.findUnique({ where: { id: user.rpg.guildId } });
            if (guild) guildTag = guild.tag;
        }
        
        const censoredMessage = censorMessage(message);
        const messageData = { type: 'text', username: user.username, guildTag: guildTag, avatarUrl: user.avatarUrl, text: censoredMessage, timestamp: new Date() };
        io.emit('newMessage', messageData);
    });

    socket.on('sendGuildMessage', async (message) => {
        if (!user || !user.rpg.guildId) return;
        const guild = await prisma.guild.findUnique({ where: { id: user.rpg.guildId } });
        if (!guild) return;

        const mutedUsers = guild.mutedUsers || {};
        const muteInfo = mutedUsers[user.username];
        if (muteInfo && muteInfo > Date.now()) return socket.emit('guild_error', { message: 'Você está silenciado no chat da guilda.' });

        const censoredMessage = censorMessage(message);
        const messageData = { type: 'text', username: user.username, avatarUrl: user.avatarUrl, text: censoredMessage, timestamp: new Date() };
        io.to(guild.id).emit('newGuildMessage', messageData);
    });

    socket.on('support:sendMessage', async ({ ticketId, text }) => {
        if (!user) return;
        const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket || (!user.isAdmin && user.id !== ticket.creatorId)) return;

        const newMessage = await prisma.ticketMessage.create({
            data: {
                text: censorMessage(text),
                ticketId: ticketId,
                senderId: user.id
            },
            include: { sender: { select: { username: true, isAdmin: true } } }
        });

        const formattedMessage = { ...newMessage, sender: { username: newMessage.sender.username, isAdmin: newMessage.sender.isAdmin } };
        io.to(ticketId).emit('support:newMessage', formattedMessage);

        if (!user.isAdmin && ticket.discordChannelId && botFunctions && botFunctions.sendMessageToChannel) {
            botFunctions.sendMessageToChannel(ticket.discordChannelId, formattedMessage);
        }
    });
    
    // Outros listeners de socket...
    socket.on('disconnect', () => {
        console.log(`Usuário desconectado: ${socket.id}`);
        if (user && user.username) {
            if (connectedUsers.get(user.username)?.socketId === socket.id) {
                connectedUsers.delete(user.username);
            }
        }
    });
});

// --- Rota Curinga (Catch-all) ---
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- INICIA O BOT DO DISCORD ---
let botFunctions = {};
try {
    botFunctions = require('./discord-bot.js')(io);
} catch (error) {
    console.error('Falha ao iniciar o bot do Discord:', error);
}

// --- Integração Final das Rotas Modulares ---
// (Esta seção deve vir DEPOIS da inicialização do bot e ANTES do server.listen)
const middlewares = { authMiddleware, adminMiddleware, supremeAdminMiddleware, adminOrTesterMiddleware, guildOwnerMiddleware, optionalAuthMiddleware };
const serverState = {
    worldBoss: worldBoss,
    setWorldBoss: (newBoss) => { worldBoss = newBoss; },
    bossData: { CUSTOM_BOSSES: gameData.CUSTOM_BOSSES, WORLD_BOSS_DATA: gameData.WORLD_BOSS_DATA },
    connectedUsers: connectedUsers
};

app.use('/api/auth', authRoutes(prisma));
app.use('/api/users', userRoutes(prisma, authMiddleware));
app.use('/api/admin', adminRoutes(prisma, middlewares, io, connectedUsers, bannedIPs, logBuffer, gameData));
app.use('/api/rpg', rpgRoutes(prisma, authMiddleware, gameData, activeBattles, activeDungeons, calculatePlayerBattleStats, getPlayerAbilities));
app.use('/api/guilds', guildRoutes(prisma, authMiddleware, { ...io, connectedUsers }));
app.use('/api/discord', discordRoutes(prisma, io, serverState, gameData, tempLoginTokens));
app.use('/api/support', supportRoutes(prisma, middlewares.authMiddleware, middlewares.adminMiddleware, middlewares.optionalAuthMiddleware, io, botFunctions));

// --- Keep-Alive para o Render ---
setInterval(() => {
    console.log('Ping periódico para manter o servidor do Render ativo.');
}, 13 * 60 * 1000);

// --- Inicia o Servidor ---
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT} e conectado ao banco de dados.`);
});
