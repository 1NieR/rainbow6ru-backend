import { Guild, Lobby, User } from '@r6ru/db';
import { IngameStatus as IS, LobbyStoreStatus as LSS, RANKS} from '@r6ru/types';
import { CategoryChannel, Collection, GuildMember, Message, Snowflake, TextChannel, VoiceChannel } from 'discord.js';
import * as humanizeDuration from 'humanize-duration';
import { Sequelize } from 'sequelize-typescript';
import { debug } from '..';
import bot from '../bot';
import Ratelimiter from '../utils/decorators/ratelimiter';
import WaitLoaded from '../utils/decorators/wait_loaded';
import embeds from '../utils/embeds';
import ENV from '../utils/env';
import { LSBase } from '../utils/lobby_utils';
import { syncMember } from '../utils/sync';

const { Op } = Sequelize;
const initiatedAt = new Date();

export class LobbyStore extends LSBase {

    public constructor(id: Snowflake, type: string, dbGuild: Guild) {
        super();
        this.generateLobby = this.generateLobby.bind(this); // СУКА БЛЯДСКИЙ КОНТЕКСТ ОТВАЛИЛСЯ
        this.atomicJoin = this.atomicJoin.bind(this);
        this.atomicLeave = this.atomicLeave.bind(this);
        this.openLobby = this.openLobby.bind(this);
        this.closeLobby = this.closeLobby.bind(this);
        this.checkLobbyHealth = this.checkLobbyHealth.bind(this);
        (async () => {
            this.guild = dbGuild;
            this.actionCounter = new Collection();
            this.categoryId = id;
            this.category = await bot.channels.fetch(this.categoryId) as CategoryChannel;
            this.type = type;
            this.roomsRange = this.guild.roomsRange[this.type] || this.guild.roomsRange.default;
            this.staticRooms = this.roomsRange[0] === this.roomsRange[1];
            this.lfgChannelId = dbGuild.lfgChannels[this.type];
            this.lfgChannel = await bot.channels.fetch(this.lfgChannelId) as TextChannel;
            this.roomSize = 5;
            await this.lfgChannel.messages.fetch();
            await this.lfgChannel.bulkDelete(this.lfgChannel.messages.filter((m) => m.author.id === bot.user.id));
            if (this.lfgChannel.type === 'text') {
                const voices = this.rawVoices.sort((a, b) => b.members.size - a.members.size).array();
                const cond = (v, i, a) => i >= this.roomsRange[0] && !v.members.size && i !== a.length;
                const toDelete = voices.filter((...args) => cond(...args));
                const rest = voices.filter((...args) => !cond(...args));
                if (rest[0].members.size !== 0 && toDelete.length) {
                    rest.push(toDelete.pop());
                }
                await Promise.all(toDelete.map((v) => v.delete()));
                await this.category.fetch();
                if (!this.rawVoices.some((v) => v.members.size === 0)) {
                    const channelToClone = await this.rawVoices.last();
                    await channelToClone.clone({ name: channelToClone.name.replace(/\d+/g, (n) => (parseInt(n) + 1).toString()), userLimit: this.roomSize });
                }
                const generatedLobbies = await Promise.all(this.rawVoices.map(this.generateLobby));
                this.lobbies = new Collection(generatedLobbies.map((l) => [l.channel, l]));
                this.status = LSS.AVAILABLE;
                await this.syncChannels();
                console.log(this.lfgChannel.guild.name, 'VOICES', this.rawVoices.size, 'LOBBIES', this.lobbies.size, 'ROOMS RANGE', this.roomsRange);
                console.log(this.lfgChannel.guild.name, 'STATUS', LSS[this.status]);

                setInterval(this.watchActions, 500);
                setInterval(this.purgeActions, 10000);
    }
        })();
    }

    public syncChannels = () => Promise.all(this.lobbies.map((l) => l.dcChannel).filter((v) => !v.deleted).sort((a, b) => a.position - b.position).map((v, i) => v.setName(v.name.replace(/\d+/g, (_) => (i + 1).toString()))));

    public async kick(member: GuildMember, timeout: number = 10000, reason?: string) {
        await member.voice.setChannel(null, reason);
        try {
            await member.send(reason);
        } catch (err) {
            await this.lfgChannel.send(`${member}, ${reason}`);
        }
        if (timeout > 10000) {
            await member.roles.set(member.roles.filter((r) => ![...Object.values(this.guild.platformRoles), ...Object.values(this.guild.rankRoles)].includes(r.id)));
            debug.log(`${member} исключен из \`${this.type}\` на ${humanizeDuration(timeout, {conjunction: ' и ', language: 'ru', round: true})} по причине "${reason}"`);
            setTimeout(async () => syncMember(this.guild, await User.findByPk(member.id)), timeout);
        }
    }

    // @Atomic
    public async handleForceLeave(id: Snowflake) {
        console.log('FORCE LEAVE');
        const lobby = this.lobbies.find((l) => Boolean(l.members.find((m) => m.id === id)));
        if (lobby) {
            await this.checkLobbyHealth(lobby);
            if (lobby.dcChannel.members.size === 0 && this.lobbies.size > this.roomsRange[0]) {
                await this.closeLobby(lobby);
            }
        }
    }

    @Ratelimiter
    @WaitLoaded
    // @Atomic
    public async join(member: GuildMember, to: VoiceChannel) {
        // console.log('JOIN');
        const lobby = this.lobbies.get(to.id);
        if (!lobby) {return; }
        if (to.members.size === 1 && this.lobbies.size <= this.roomsRange[1]) {
            lobby.dcLeader = member;
            if (!this.staticRooms || this.voices.size < this.roomsRange[0]) {
                await this.openLobby(lobby);
            }
        }
        await this.atomicJoin(member, lobby);
        await this.checkLobbyHealth(lobby);
    }

    @Ratelimiter
    @WaitLoaded
    // @Atomic
    public async leave(member: GuildMember, from: VoiceChannel) {
        // console.log('LEAVE');
        const lobby = this.lobbies.get(from.id);
        if (!lobby) {return; }
        await this.atomicLeave(member, lobby);
        if (!this.staticRooms && from.members.size === 0 && this.lobbies.size > this.roomsRange[0]) {
            await this.closeLobby(lobby);
        } else {
            await this.checkLobbyHealth(lobby);
        }
    }

    @Ratelimiter
    @WaitLoaded
    // @Atomic
    public async internal(member: GuildMember, from: VoiceChannel, to: VoiceChannel) {
        const lobbyFrom = this.lobbies.get(from.id);
        const lobbyTo = this.lobbies.get(to.id);
        if (lobbyFrom) {
            await this.atomicLeave(member, lobbyFrom);
        }
        if (lobbyTo) {
            await this.atomicJoin(member, lobbyTo);
        }
        if (lobbyFrom) {
            await this.checkLobbyHealth(lobbyFrom);
        }
        if (lobbyTo) {
            await this.checkLobbyHealth(lobbyTo);
        }
    }

    public refreshIngameStatus = async (lobby: Lobby) => {
        const statuses = lobby.dcChannel.members.map((m) => LobbyStore.detectIngameStatus(m.presence)).filter((is) => is !== IS.OTHER);
        statuses.unshift(IS.OTHER);
        const s = lobby.status;
        lobby.status = statuses.reduce((acc, el) => {
            acc.k[el] = acc.k[el] ? acc.k[el] + 1 : 1;
            acc.max = acc.max ? acc.max < acc.k[el] ? el : acc.max : el;
            return acc;
          }, { k: {}, max: null }).max;
        if (s !== lobby.status && ![s, lobby.status].includes(IS.OTHER)) {
            const playing = [IS.CASUAL, IS.RANKED, IS.CUSTOM];
            if (playing.includes(s)) {
                debug.log(`<@${lobby.members.map((m) => m.id).join('>, <@')}> закончили играть (\`${IS[s]} --> ${IS[lobby.status]}\`). ID пати \`${lobby.id}\``);
            }
            if (playing.includes(lobby.status)) {
                debug.log(`<@${lobby.members.map((m) => m.id).join('>, <@')}> начали играть (\`${IS[s]} --> ${IS[lobby.status]}\`). ID пати \`${lobby.id}\``);
            }
        }
    }

    @WaitLoaded
    public async reportIngameStatus(member: GuildMember, status: IS) {
        // console.log(member.user.tag, IngameStatus[status]);
        const lobby = this.lobbies.get(member.voice.channelID);
        if (!lobby) { return; }
        const s = lobby.status;
        await this.refreshIngameStatus(lobby);
        if (lobby.status !== s) {
            this.updateAppealMsg(lobby); // добавить логгирование начавшейся катки
        }
    }

    // @Atomic
    public async generateLobby(voice: VoiceChannel) {
        if (!voice) {
            return null;
        }
        if (voice.userLimit !== this.roomSize) {
            await voice.setUserLimit(this.roomSize);
        }
        if (voice.name.includes('HardPlay')) {
            await voice.setName(voice.name.replace('HardPlay ', ''));
        }
        const lobby = new Lobby({
            channel: voice.id,
            hardplay: false,
            initiatedAt,
            open: true,
            type: this.type,
        });

        lobby.dcCategory = this.category;
        lobby.dcChannel = voice;
        lobby.dcGuild = voice.guild;
        lobby.dcLeader = voice.members.random();

        await lobby.save();
        await lobby.$set('guild', this.guild);
        await lobby.$set('members', await User.findAll({ where: { id: lobby.dcChannel.members.map((m) => m.id) } }));
        await lobby.reload({ include: [{all: true}] });

        if (lobby.dcLeader) {
            // const dbUser = await User.findByPk(lobby.dcLeader.id, { include: [Lobby] });
            // console.log(dbUser);
            // if (dbUser.lobby) {
            //     console.log(dbUser.lobby);
            //     lobby.description = dbUser.lobby.description;
            // }
            const inv = await lobby.dcChannel.createInvite({maxAge: parseInt(ENV.INVITE_AGE) });
            lobby.invite = inv.url;
            lobby.dcInvite = inv;
            await lobby.save();
            lobby.appealMessage = await this.lfgChannel.send('', await embeds.appealMsg(lobby)) as Message;
        }

        return lobby;
    }

    private async checkLobbyHealth(lobby: Lobby) {
        try {
            if (!this.rawVoices.some((v: VoiceChannel) => v.members.size === 0) && !this.staticRooms) {
                console.log('adding new channel due error');
                this.openLobby(lobby);
            }
            await lobby.dcChannel.fetch();
            if (lobby.members.length !== lobby.dcChannel.members.size) {
                await lobby.$set('members', await User.findAll({ where: { id: lobby.dcChannel.members.map((m) => m.id) } }));
                await lobby.reload({ include: [{all: true}] });
                if (lobby.members.length !== lobby.dcChannel.members.size) {
                    await Promise.all(lobby.dcChannel.members.filter((m) => !Boolean(lobby.members.find((dbm) => dbm.id === m.id))).map((m) => this.kick(m, 10000, 'Требуется регистрация. Используйте `$rank ваш_Uplay` в канале для команд бота.')));
                    await this.checkLobbyHealth(lobby);
                }
            }
            if (lobby.dcLeader) {
                if (lobby.dcChannel.members.size === 0) {
                    lobby.dcLeader = null;
                } else if (!lobby.dcChannel.members.has(lobby.dcLeader.id)) {
                    lobby.dcLeader = lobby.dcChannel.members.random();
                }
            }
        } catch (err) {
            console.log('LOBBY CACHE MISS', err);
            await this.lobbies.delete(lobby.channel);
        }
    }

    public async updateAppealMsg(lobby: Lobby) {
        if (lobby.appealMessage) {
            if (lobby.dcInvite.expiresTimestamp < Date.now()) {
                return (!lobby.appealMessage.deleted && lobby.appealMessage.delete());
            }
            lobby.dcChannel = await lobby.dcChannel.fetch() as VoiceChannel;
            try {
                return lobby.appealMessage.edit('', await embeds.appealMsg(lobby));
            } catch (err) {
                return this.lfgChannel.send('', await embeds.appealMsg(lobby));
            }
        }
    }

    private async openLobby(lobby: Lobby) {
        const channelToClone = await this.rawVoices.last();
        const clonedChannel = await channelToClone.clone({ name: channelToClone.name.replace(/\d+/g, (n) => (parseInt(n) + 1).toString()), userLimit: this.roomSize }) as VoiceChannel;
        this.lobbies.set(clonedChannel.id, await this.generateLobby(clonedChannel));
    }

    private async closeLobby(lobby: Lobby) {
        lobby.active = false;
        await lobby.save();

        const toDelete = lobby.dcChannel; // this.voices.get(lobby.channel);
        toDelete.deleted = true; // наеб блядского кэша discord.js
        await this.syncChannels();
        await toDelete.delete();
        this.lobbies.delete(lobby.channel);
        await this.category.fetch();
    }

    private watchActions = () => {
        this.actionCounter.forEach(async (a, key, map) => {
            if (!a.kicked && a.times >= parseInt(ENV.KICK_LIMIT)) {
                a.kicked = true;
                return this.kick(a.member, 10000 * a.times, 'Вы временно отстранены от поиска за чрезмерную активность!');
            }
            if (!a.warned && a.times >= parseInt(ENV.KICK_LIMIT) * 0.75) {
                a.warned = true;
                try {
                    a.member.send('Вы совершаете слишком много действий! Умерьте пыл, или вы будете временно отстранены!');
                } catch (error) {
                    (await this.lfgChannel.send(`${a.member}, вы совершаете слишком много действий! Умерьте пыл, или вы будете временно отстранены!`) as Message).delete({ timeout: 30000 });
                }
            }
        });
    }

    private async atomicLeave(member: GuildMember, lobby: Lobby) {
        await lobby.$remove('members', await User.findByPk(member.id));
        await lobby.reload({include: [{all: true}]});
        if (!lobby.open) {
            lobby.open = true;
            await lobby.dcChannel.setUserLimit(this.roomSize);
        }
        if (!lobby.dcChannel.members.size) {
            lobby.dcLeader = null;
        }
        if (lobby.dcChannel.members.size !== 0 && member.id === lobby.dcLeader.id) {
            const newLeader = lobby.dcChannel.members.random();
            debug.log(`Лидер ${lobby.dcLeader} покинул комнату. Новый лидер - ${newLeader}. Через комнату прошли <@${lobby.log.join('>, <@')}>. ID пати \`${lobby.id}\``);
            lobby.log = [];
            lobby.open = true;
            lobby.hardplay = false;
            try {
                newLeader.send('Теперь Вы - лидер лобби');
            } catch (error) {
                (await this.lfgChannel.send(`${newLeader}, теперь Вы - лидер лобби`) as Message).delete({ timeout: 30000 });
            }
            lobby.dcLeader = newLeader;
        }
        await lobby.save();
        if (lobby.dcChannel.members.size) {
            await this.refreshIngameStatus(lobby);
            return this.updateAppealMsg(lobby);
        } else {
            if (lobby.appealMessage && !lobby.appealMessage.deleted) {
                await lobby.appealMessage.delete();
                lobby.appealMessage = null;
            }
            return;
        }
    }

    private async atomicJoin(member: GuildMember, lobby: Lobby) {
        const dbUser = await User.findByPk(member.id);
        const min = Math.min(...lobby.members.map((m) => m.rank));
        if (lobby.hardplay && dbUser.rank < min) {
            return this.kick(member, 0, `Это лобби доступно только для \`${RANKS[min]}\` и выше!`);
        }
        await lobby.$add('members', dbUser);
        await lobby.reload({include: [{all: true}]});
        if (!lobby.dcLeader) {
            lobby.dcLeader = member;
        }
        if (lobby.dcChannel.members.size >= this.roomSize && !lobby.appealMessage) {
            lobby.appealMessage = await this.lfgChannel.send('', await embeds.appealMsg(lobby)) as Message;
        } else {
            await this.updateAppealMsg(lobby);
        }
        await this.refreshIngameStatus(lobby);
    }
}

export const lobbyStores: Map<Snowflake, LobbyStore> = new Map();

export async function initLobbyStores() {
    if (ENV.ENABLE_LOBBIES !== 'true') {
        return debug.warn('Lobbies disabled');
    } else {
        debug.warn('Lobbies enabled');
    }
    const dbGuilds = await Guild.findAll({ where: { premium: true } });
    dbGuilds.map((g) => {
        Object.entries(g.voiceCategories).map((ent) => lobbyStores.set(ent[1], new LobbyStore(ent[1], ent[0], g)));
    });
    const lobbies = await Lobby.findAll({
        where: {
            [Op.and]: [
                {initiatedAt: {[Op.lt]: initiatedAt}},
                {active: true},
            ],
        },
    });
    await Promise.all(lobbies.map((l) => {
        l.active = false;
        return l.save();
    }));
}
