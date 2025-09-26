const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, ChannelType, PermissionsBitField } = require('discord.js');
const axios = require('axios');

module.exports = (io) => {
    // --- CONFIGURAÇÃO SEGURA ---
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const SERVER_URL = process.env.SERVER_URL;
    const WEBHOOK_SECRET = process.env.DISCORD_WEBHOOK_SECRET;
    const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
    const GUILD_ID = process.env.DISCORD_GUILD_ID;
    const TICKET_CATEGORY_ID = process.env.DISCORD_TICKET_CATEGORY_ID;
    const ANNOUNCEMENT_CHANNEL_ID = process.env.DISCORD_ANNOUNCEMENT_CHANNEL_ID;
    const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID;
    const UNVERIFIED_ROLE_ID = process.env.UNVERIFIED_ROLE_ID;
    // --- FIM DA CONFIGURAÇÃO ---

    // --- Validação de Configuração ---
    const requiredEnvVars = { BOT_TOKEN, SERVER_URL, WEBHOOK_SECRET, ADMIN_ROLE_ID, GUILD_ID, TICKET_CATEGORY_ID, VERIFIED_ROLE_ID };
    for (const [key, value] of Object.entries(requiredEnvVars)) {
        if (!value) {
            console.error(`\x1b[31m[ERRO DO BOT] A variável de ambiente obrigatória "${key}" não está configurada. O bot não pode funcionar corretamente.\x1b[0m`);
            return {};
        }
    }
    // --- Fim da Validação ---

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMembers,
        ],
    });
    
    client.once('clientReady', () => {
        if (client.user) {
            console.log(`Bot ${client.user.tag} está online e pronto!`);
        } else {
            console.error("O bot conectou, mas o objeto 'client.user' é nulo. Verifique as permissões e o token.");
        }
    });
    
    setInterval(() => {
        if(client.isReady()) console.log('[BOT] Ping periódico para manter o bot do Render ativo.');
    }, 14 * 60 * 1000);

    client.on('guildMemberAdd', async member => {
        if (!UNVERIFIED_ROLE_ID) {
            console.warn('[BOT] UNVERIFIED_ROLE_ID não está configurado. Não foi possível adicionar cargo ao novo membro.');
            return;
        }
        try {
            const role = await member.guild.roles.fetch(UNVERIFIED_ROLE_ID);
            if (role) {
                await member.roles.add(role);
                console.log(`Cargo 'Não Verificado' adicionado para ${member.user.tag}`);
            } else {
                console.error(`[BOT] O cargo com ID ${UNVERIFIED_ROLE_ID} (UNVERIFIED_ROLE_ID) não foi encontrado no servidor.`);
            }
        } catch (error) {
            console.error(`[BOT] Falha ao adicionar cargo para o novo membro ${member.user.tag}:`, error);
        }
    });

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const isAdmin = message.member?.roles.cache.has(ADMIN_ROLE_ID);
        
        if (isAdmin && message.channel.name.startsWith('ticket-')) {
            const ticketId = message.channel.name.split('-')[1];
            const messageData = {
                _id: message.id,
                ticketId,
                sender: { username: message.author.username, isAdmin: true },
                text: message.content,
                createdAt: new Date(),
            };
            io.to(ticketId).emit('support:newMessage', messageData);
            return;
        }

        if (!message.content.startsWith('!')) return;

        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        if (command === 'status') {
            try {
                const res = await axios.get(`${SERVER_URL}/api/status`);
                const { onlineUsers } = res.data;
                const embed = new EmbedBuilder()
                    .setColor(0x3498db)
                    .setTitle('📊 Status do Chatyni V2')
                    .addFields(
                        { name: 'Usuários Online', value: `**${onlineUsers}**`, inline: true },
                        { name: 'Status do Servidor', value: '✅ Online', inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Informações em tempo real' });
                return message.reply({ embeds: [embed] });
            } catch (error) {
                return message.reply('❌ Não foi possível obter o status do servidor no momento.');
            }
        }

        if (!isAdmin) return; // A partir daqui, todos os comandos são para admins

        if (command === 'painel') {
            const targetUser = args[0];
            if (!targetUser) return message.reply('Formato incorreto. Use: `!painel [usuário]`');

            const embed = new EmbedBuilder().setColor(0x6f2dbd).setTitle(`Painel de Controle: ${targetUser}`).setDescription(`Selecione uma ação para executar no usuário **${targetUser}**.\n\n*As ações que requerem mais informações abrirão uma janela pop-up.*`).setTimestamp().setFooter({ text: 'Chatyni V2 Admin System' });
            const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`panel_ban_${targetUser}`).setLabel('Banir').setStyle(ButtonStyle.Danger).setEmoji('🔨'), new ButtonBuilder().setCustomId(`panel_unban_${targetUser}`).setLabel('Desbanir').setStyle(ButtonStyle.Secondary).setEmoji('🔓'), new ButtonBuilder().setCustomId(`panel_kick_${targetUser}`).setLabel('Kickar').setStyle(ButtonStyle.Secondary).setEmoji('👢'), new ButtonBuilder().setCustomId(`panel_warn_${targetUser}`).setLabel('Avisar').setStyle(ButtonStyle.Primary).setEmoji('⚠️'));
            const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`panel_givexp_${targetUser}`).setLabel('Doar XP').setStyle(ButtonStyle.Success).setEmoji('✨'), new ButtonBuilder().setCustomId(`panel_giveitem_${targetUser}`).setLabel('Dar Espada ADM').setStyle(ButtonStyle.Success).setEmoji('⚔️'));
            return message.reply({ embeds: [embed], components: [row1, row2] });
        }

        if (command === 'worldboss') {
            const subCommand = args[0]?.toLowerCase();
            if (subCommand === 'spawn') {
                try {
                    await message.reply('Invocando o Chefe Mundial...');
                    const res = await axios.post(`${SERVER_URL}/api/discord/webhook`, { authorization: WEBHOOK_SECRET, action: 'spawn_world_boss' });
                    const boss = res.data.worldBoss;
                    const announcementChannel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
                    if (announcementChannel) {
                        const embed = new EmbedBuilder().setColor(0xff0000).setTitle('🔥 UM CHEFE MUNDIAL APARECEU! 🔥').setDescription(`O temível **${boss.name}** surgiu! Juntem-se no site para derrotá-lo!`).setImage(boss.imageUrl).addFields({ name: 'Vida do Chefe', value: `**${boss.maxHp} HP**` }).setTimestamp();
                        await announcementChannel.send({ content: '@everyone', embeds: [embed] });
                        await message.reply('✅ Chefe Mundial invocado e anunciado com sucesso!');
                    }
                } catch (error) { message.reply(`❌ **Erro ao invocar chefe:** ${error.response ? error.response.data : error.message}`); }
            }
        }
        // ... outros comandos de texto
    });

    client.on('interactionCreate', async interaction => {
        if (interaction.isButton()) {
            const customId = interaction.customId;
            if (customId.startsWith('panel_')) {
                if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) return interaction.reply({ content: 'Você não tem permissão para usar este painel.', ephemeral: true });
                
                const parts = customId.split('_');
                const action = parts[1];
                const targetUser = parts.slice(2).join('_');

                try {
                    if (['unban', 'giveitem'].includes(action)) {
                        await interaction.deferReply({ ephemeral: true });
                        const payload = { authorization: WEBHOOK_SECRET, targetUser, action: action === 'unban' ? 'unban' : 'give_item' };
                        if (action === 'giveitem') payload.item = 'espada_suprema_adm';
                        const res = await axios.post(`${SERVER_URL}/api/discord/webhook`, payload);
                        await interaction.editReply({ content: `✅ **Sucesso:** ${res.data}` });
                    } else if (['ban', 'warn', 'kick', 'givexp'].includes(action)) {
                        let modal;
                        if (['ban', 'warn', 'kick'].includes(action)) {
                            modal = new ModalBuilder().setCustomId(`modal_${action}_${targetUser}`).setTitle(`${action.charAt(0).toUpperCase() + action.slice(1)} Usuário: ${targetUser}`);
                            const reasonInput = new TextInputBuilder().setCustomId('reasonInput').setLabel("Motivo").setStyle(TextInputStyle.Paragraph).setRequired(true);
                            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
                        } else if (action === 'givexp') {
                            modal = new ModalBuilder().setCustomId(`modal_givexp_${targetUser}`).setTitle(`Doar XP para: ${targetUser}`);
                            const xpInput = new TextInputBuilder().setCustomId('xpInput').setLabel("Quantidade de XP").setStyle(TextInputStyle.Short).setRequired(true);
                            modal.addComponents(new ActionRowBuilder().addComponents(xpInput));
                        }
                        await interaction.showModal(modal);
                    }
                } catch (error) {
                    const errorMessage = error.response ? error.response.data : error.message;
                    if (interaction.deferred || interaction.replied) await interaction.editReply({ content: `❌ **Erro:** ${errorMessage}` });
                    else await interaction.reply({ content: `❌ **Erro:** ${errorMessage}`, ephemeral: true });
                }
            }
        }

        if (interaction.type === InteractionType.ModalSubmit) {
            const customId = interaction.customId;
            if (customId.startsWith('modal_')) {
                await interaction.deferReply({ ephemeral: true });

                const parts = customId.split('_');
                const action = parts[1];
                const targetUser = parts.slice(2).join('_');

                try {
                    let payload = { authorization: WEBHOOK_SECRET, targetUser };
                    let res;

                    switch (action) {
                        case 'ban':
                        case 'warn':
                        case 'kick':
                            payload.action = action;
                            payload.reason = interaction.fields.getTextInputValue('reasonInput');
                            res = await axios.post(`${SERVER_URL}/api/discord/webhook`, payload);
                            break;
                        case 'givexp':
                            const xpAmount = interaction.fields.getTextInputValue('xpInput');
                            if (isNaN(parseInt(xpAmount))) return interaction.editReply({ content: '❌ **Erro:** A quantidade de XP deve ser um número.' });
                            payload.action = 'set_rpg';
                            payload.statToChange = 'xp';
                            payload.value = xpAmount;
                            payload.operation = 'add';
                            res = await axios.post(`${SERVER_URL}/api/discord/webhook`, payload);
                            break;
                        default:
                            return interaction.editReply({ content: '❌ Ação desconhecida no modal.' });
                    }
                    await interaction.editReply({ content: `✅ **Sucesso:** ${res.data}` });
                } catch (error) {
                    const errorMessage = error.response ? error.response.data : error.message;
                    await interaction.editReply({ content: `❌ **Erro:** ${errorMessage}` });
                }
            }
        }
    });

    if (BOT_TOKEN) {
        client.login(BOT_TOKEN).catch(err => {
            console.error(`\n\x1b[31m[ERRO DO BOT] Falha ao fazer login: ${err.message}\x1b[0m`);
            console.error('\x1b[33mVerifique se o BOT_TOKEN configurado no Render está correto e não expirou.\x1b[0m\n');
        });
    }

    async function createTicketChannel(ticket) {
        // ... (código para criar canal de ticket)
    }
    async function sendMessageToChannel(channelId, message) {
        // ... (código para enviar mensagem para canal)
    }
    async function announceWorldBossDefeat(bossName, topDamagers) {
        // ... (código para anunciar derrota do chefe)
    }

    return {
        createTicketChannel,
        sendMessageToChannel,
        announceWorldBossDefeat
    };
};
