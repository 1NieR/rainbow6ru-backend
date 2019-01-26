import { Guild as G, User as U } from '@r6ru/db';
import { IUbiBound, ONLINE_TRACKER } from '@r6ru/types';
import { IStats } from 'r6api';
import bot from '../bot';
import ENV from '../utils/env';

class GG extends G {}
// tslint:disable-next-line:max-classes-per-file
class UU extends U {}

export async function syncRank() {
    const UInsts = await U.findAll({
      limit: parseInt(ENV.PACK_SIZE),
      order: ['updatedAt', 'ASC'],
      where: {inactive: false},
    });
}

export async function syncMember(dbGuild: GG, dbUser: UU, currentRoles?: string[]) {
    const guild = bot.guilds.get(dbGuild.id);
    const member = guild.members.get(dbUser.id);
    if (!guild.available) { return; }
    if (!currentRoles) {
      currentRoles = member.roles.keyArray();
    }

    const rolesToApply = [];

    for (const key in dbUser.platform) {
      if (dbUser.platform[key]) { rolesToApply.push(dbGuild.platformRoles[key]); }
    }

    rolesToApply.push(dbGuild.rankRoles[dbUser.rank]);

    member.edit({roles: rolesToApply});
}

export const embeds = {
    rank: function buildRankEmbed(bound: IUbiBound, s: IStats) {
      const stats = s.general;
      return {
        author: {
          name: bound.nickname,
        },
        description: 'Общая статистика',
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
        url: `${ONLINE_TRACKER}${bound.genome}`,
        };
      },
  };
