import { Lobby } from '@r6ru/db';
import { IngameStatus as IS, IUbiBound, ONLINE_TRACKER, RANK_COLORS, VERIFICATION_LEVEL } from '@r6ru/types';
import { MessageEmbedOptions } from 'discord.js';
import ENV from './env';

export default {
  appealMsg: (lobby: Lobby): MessageEmbedOptions => ({
      author: {
          iconURL: `${lobby.dcLeader.user.displayAvatarURL()}`,
          name: ((_) => {
            const slot = lobby.dcMembers.length < lobby.dcChannel.userLimit
              ? ` | +${lobby.dcChannel.userLimit - lobby.dcMembers.length} слот(-а)`
              : '';
            switch (_) {
              case IS.CASUAL_SEARCH:
              case IS.RANKED_SEARCH:
              case IS.CUSTOM_SEARCH:
                return `Поиск матча в ${lobby.dcChannel.name}` + slot;
              case IS.CASUAL:
              case IS.RANKED:
              case IS.CUSTOM:
                return `Играют в ${lobby.dcChannel.name}`;
              case IS.TERRORIST_HUNT:
                return `${lobby.dcChannel.name} разминается в Антитерроре` + slot;
              case IS.OTHER:
              case IS.MENU:
              default:
                return lobby.dcMembers.length >= lobby.dcChannel.userLimit
                  ? `Готовы играть в ${lobby.dcChannel.name}`
                  : `Ищут +${lobby.dcChannel.userLimit - lobby.dcMembers.length} в ${lobby.dcChannel.name}`;
            }
          })(lobby.status),
      },
      color: RANK_COLORS[lobby.members.find((m) => m.id === lobby.dcLeader.id).rank],
      description: (lobby.members.map((m) => `<@${m.id}> (Uplay - [**${m.nickname}**](${ONLINE_TRACKER}${m.genome})) ${m.verificationLevel >= VERIFICATION_LEVEL.QR ? ENV.VERIFIED_BADGE : ''}`).join('\n'))
        + (lobby.description
          ? `\n▫${lobby.description}`
          : '')
        + (![IS.CASUAL, IS.RANKED, IS.CUSTOM].includes(lobby.status)
          ? `\nПрисоединиться: ${lobby.dcInvite.url} 👈`
          : ''),
      fields: [],
      footer: {
          iconURL: 'https://i.imgur.com/sDOEWMV.png',
          text: 'В игре ники участников отличаются от вышеуказанных? Cообщите администрации.\nС вами игрок с плохой репутацией!',
      },
      thumbnail: {
          url: 'https://i.imgur.com/fM2oMLk.png',
      },
      timestamp: new Date(),

  }),

  rank: (bound: IUbiBound, stats: {won?: any, lost?: any, kills?: any, deaths?: any}): MessageEmbedOptions => ({
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
  }),
};
