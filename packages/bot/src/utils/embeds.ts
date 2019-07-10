import { Lobby, User } from '@r6ru/db';
import { IngameStatus as IS, IUbiBound, ONLINE_TRACKER, RANK_BADGES, RANK_COLORS, RANKS, VERIFICATION_LEVEL } from '@r6ru/types';
import { EmbedField, GuildMember, MessageOptions } from 'discord.js';
import { LobbyStore } from '../bot/lobby';
import ENV from './env';

const currentlyPlaying = [IS.CASUAL, IS.RANKED, IS.CUSTOM, IS.NEWCOMER, IS.DISCOVERY];

export default {
  appealMsg: async (lobby: Lobby): Promise<MessageOptions> => ({
    embed: {
      author: {
          iconURL: lobby.dcLeader.user.displayAvatarURL(),
          name: modeSelector(lobby),
      },
      color: await (async () => {
        const dbUser = (lobby.members.find(m => m.id === lobby.dcLeader.id) || await User.findByPk(lobby.dcLeader.id));
        return RANK_COLORS[(dbUser && dbUser.rank) || 0];
      })(),
      description:
        (lobby.members
          .sort((a, b) => b.rank - a.rank)
          .map(m => (lobby.dcLeader.id === m.id ? '\\👑 ' : '')
              + (!m.platform.PC ? '\\🎮' : '')
              + `<@${m.id}> (${RANK_BADGES[m.rank]} \`${m.nickname}\` - [${Object.entries(m.platform).find(e => e[1])[0].replace('PC', 'Uplay').replace('PS4', 'PSN').replace('XBOX', 'Xbox LIVE')}](${ONLINE_TRACKER}${m.genome})${(' | ' + m.region).replace(/.+emea/g, '').replace('ncsa', '🌎').replace('apac', '🌏')})`
              + ((m.verificationLevel >= VERIFICATION_LEVEL.QR) ? ' ' + ENV.VERIFIED_BADGE : ''))
          .join('\n'))
        + (lobby.description
          ? `\n▫${lobby.description}`
          : ''),
      fields: (() => {
        const fields: EmbedField[] = [];
        if (lobby.hardplay) {
          fields.push({
            name: 'Режим "HardPlay"',
            value: `Минимальный ранг для входа: \`${RANKS[lobby.guild.rankRoles.findIndex(r => lobby.guild.rankRoles[lobby.minRank] === r)]}\``,
          });
        }
        if (!lobby.open) {
          fields.push({
            name: 'Закрытое лобби',
            value: 'Лимит пользователей восстановится при выходе кого-либо из лобби.',
          });
        }
        if ([IS.NEWCOMER, IS.NEWCOMER_SEARCH].includes(lobby.status)) {
          fields.push({
            name: 'Режим "Новичок"',
            value: 'Опытным игрокам лучше найти другую комнату, чтобы избежать конфликтов и поражений.',
          });
        }
        if (lobby.joinAllowed) {
          fields.push({
            name: 'Присоединиться',
            value: `${lobby.dcInvite.url} 👈`,
          });
        } else if (lobby.open && (lobby.dcMembers.size < lobby.dcChannel.userLimit) && currentlyPlaying.includes(lobby.status)) {
          fields.push({
            name: 'Лобби играет',
            value: `Сейчас лучше не заходить в комнату, чтобы не беспокоить игроков.`,
          });
        }
        return fields;
      })(),
      footer: {
          iconURL: 'https://i.imgur.com/sDOEWMV.png',
          text: `В игре ники Uplay отличаются? Cообщите администрации со скрином таба. С вами ненадежный игрок! ID: ${lobby.id}`,
      },
      thumbnail: {
          url: `${ENV.LOBBY_PREVIEW_URL}/${lobby.id}/preview?a${lobby.minRank}.${lobby.maxRank}.${lobby.dcChannel.userLimit - lobby.dcMembers.size}=1`,
      },
      timestamp: new Date(),
    },
  }),

  fastAppeal: async (LS: LobbyStore): Promise<MessageOptions> => ({
    embed: {
      author: {
        iconURL: LS.lfgChannel.guild.iconURL(),
        name: `Быстрый поиск команды в ${LS.category.name}`,
      },
      description: `Всего лобби: \`${LS.voices.filter(v => Boolean(v.members.size)).size}\`\n`
        + `Ищут игрока: \`${LS.lobbies.filter(l => Boolean(l.dcMembers.size) && l.joinAllowed).size || 'все комнаты укомплектованы!'}\`\n`
        + `Присоединиться к новой комнате: ${await getInvite4EmptyRoom(LS)} 👈`,
      fields: LS.lobbies
        .filter(l => Boolean(l.dcMembers.size) && l.joinAllowed)
        .sort((a, b) => a.dcChannel.position - b.dcChannel.position)
        .array()
        .slice(0, 24)
        .map(lobby => ({
          inline: true,
          name: modeSelector(lobby),
          value: (lobby.hardplay ? `HardPlay: только \`${RANKS[lobby.guild.rankRoles.findIndex(r => lobby.guild.rankRoles[lobby.minRank] === r)]}\` и выше\n` : '')
            + `Ранг: ${lobby.minRank === lobby.maxRank
              ? (lobby.maxRank === 0
                ? '`любой`'
                : (() => {
                 let n = lobby.minRank;
                 n--;
                 n = n - n % 4 + 1;
                 return `от \`${RANKS[n]}\` до \`${RANKS[n + 3]}\``;
                })())
              : `от \`${RANKS[lobby.minRank]}\` до \`${RANKS[lobby.maxRank]}\``}\n`
            + ([IS.NEWCOMER, IS.NEWCOMER_SEARCH].includes(lobby.status) ? 'Новичок: не выше `50` уровня доступа\n' : '')
            + (lobby.description ? `Описание: ${lobby.description}\n` : '')
            // + `Присоединиться: ${lobby.dcInvite.url} 👈\n`
            + `[подробнее...](${lobby.appealMessage.url})`,
        })),
      footer: {
        text: `ID - ${LS.type}`,
      },
    },
  }),

  rank: (bound: IUbiBound, stats: {won?: any, lost?: any, kills?: any, deaths?: any}): MessageOptions => ({
    embed: {
      author: {
        name: bound.nickname,
        url: `${ONLINE_TRACKER}${bound.genome}`,
      },
      description: `Общая статистика на платформе \`${bound.platform}\``,
      fields: [
        {
          inline: true,
          name: 'Выигрыши/Поражения',
          value: `**В:** ${stats.won || 0} **П:** ${stats.lost || 0}\n**В%:** ${(100 * (stats.won / (stats.won + stats.lost) || 0)).toFixed(2)}%`,
        },
        {
          inline: true,
          name: 'Убийства/Смерти',
          value: `**У:** ${stats.kills || 0} **С:** ${stats.deaths || 0}\n**У/С:** ${(stats.kills / (stats.deaths || 1)).toFixed(2)}`,
        },
      ],
      thumbnail: {
        url: `https://ubisoft-avatars.akamaized.net/${bound.genome}/default_146_146.png`,
      },
    },
  }),

  appealMsgPremium: (member: GuildMember, description: string, invite: string): MessageOptions => ({
    embed: {
      author: {
        iconURL: member.user.displayAvatarURL(),
        name: `${member.user.tag} ищет +${member.voice.channel.userLimit - member.voice.channel.members.size} в свою уютную комнату | ${member.voice.channel.name}`,
      },
      color: 12458289,
      fields: [
        {
          name: '🇷6⃣🇷🇺',
          value: description || ' ឵឵ ឵឵',
        },
        {
          name: 'Присоединиться',
          value: `${invite} 👈`,
        },
      ],
      footer: {
        iconURL: 'https://cdn.discordapp.com/emojis/414787874374942721.png?v=1',
        text: `Хотите так же? Обратитесь в ЛС Сервера, к ${member.guild.members.filter(m => !m.user.bot && m.hasPermission('MANAGE_GUILD')).map(m => m.user.tag).join(', ')} или активируйте Nitro Boost`,
      },
      thumbnail: {
        url: member.user.displayAvatarURL(),
      },
      timestamp: new Date(),
    },
  }),
};

const getInvite4EmptyRoom = async (LS: LobbyStore): Promise<string> => {
  const sorted = LS.lobbies.sort((a, b) => a.dcChannel.position - b.dcChannel.position);
  if (sorted.last().dcMembers.size) {
    const lobby = sorted.filter(l => !l.dcMembers.size).last();
    const inv = await lobby.dcChannel.createInvite({maxAge: parseInt(ENV.INVITE_AGE) });
    lobby.invite = inv.url;
    await lobby.save();
    lobby.dcInvite = inv;
    return inv.url;
  } else {
    return sorted.last().dcInvite.url;
  }

};

const modeSelector = (lobby: Lobby) => {
  const slot = lobby.joinAllowed
    ? ` | +${lobby.dcChannel.userLimit - lobby.dcMembers.size} слот(-а)`
    : '';
  switch (lobby.status) {
    case IS.CASUAL_SEARCH:
    case IS.RANKED_SEARCH:
    case IS.CUSTOM_SEARCH:
      return `Поиск матча в ${lobby.dcChannel.name}` + slot;
    case IS.DISCOVERY_SEARCH:
      return `Поиск Разведки в ${lobby.dcChannel.name}` + slot;
    case IS.NEWCOMER_SEARCH:
      return `Поиск режима Новичок в ${lobby.dcChannel.name}` + slot;
    case IS.CASUAL:
    case IS.RANKED:
    case IS.CUSTOM:
      return `Играют в ${lobby.dcChannel.name}`;
    case IS.NEWCOMER:
      return `Играют режим Новичок в ${lobby.dcChannel.name}`;
    case IS.TERRORIST_HUNT:
      return `${lobby.dcChannel.name} разминается в Антитерроре` + slot;
    case IS.DISCOVERY:
      return `${lobby.dcChannel.name} играет Разведку` + slot;
    case IS.OTHER:
    case IS.MENU:
    default:
      return !lobby.open || lobby.dcMembers.size >= lobby.dcChannel.userLimit
        ? `Готовы играть в ${lobby.dcChannel.name}`
        : `Ищут +${lobby.dcChannel.userLimit - lobby.dcMembers.size} в ${lobby.dcChannel.name}`;
  }
};
