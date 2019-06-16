import { Guild } from '@r6ru/db';
import { Command } from 'discord-akairo';
import { Message, TextChannel } from 'discord.js';
import { debug } from '../../..';
import { LobbyStore, lobbyStores } from '../../lobby';

export default class Reboot extends Command {
    public constructor() {
        super('reboot', {
            aliases: ['reboot'],
            channel: 'guild',
            cooldown: 5000,
            userPermissions: 'MANAGE_GUILD',
        });
    }

    public exec = async (message: Message) => {
        const dbGuild = await Guild.findByPk(message.guild.id);
        const channel = message.channel as TextChannel;
        if (lobbyStores.has(channel.parentID)) {
            const LS = lobbyStores.get(channel.parentID);
            lobbyStores.set(channel.parentID, new LobbyStore(channel.parentID, LS.type, dbGuild));
            debug.log(`лобби \`${LS.type}\` на ${message.guild.name} перезагружено`);
            return message.reply(`перезагружаем \`${LS.type}\` лобби`);
        } else {
            Object.entries(dbGuild.voiceCategories).map((ent) => lobbyStores.set(ent[1], new LobbyStore(ent[1], ent[0], dbGuild)));
            debug.log(`лобби на ${message.guild.name} перезагружены`);
            return message.reply('перезагружаем ВСЕ лобби');
        }
    }
}