import { Guild as G, User as U } from '@r6ru/db';
import { IUbiBound, ONLINE_TRACKER, PLATFORM } from '@r6ru/types';
import { MessageAttachment } from 'discord.js';
import { $enum } from 'ts-enum-util';
import bot from '../bot';
import r6api from '../r6api';
import ENV from '../utils/env';
import { generate } from './qr';

export async function syncRank(platform: PLATFORM) {
    const UInsts = await U.findAll({
      limit: parseInt(ENV.PACK_SIZE),
      order: [['updatedAt', 'ASC']],
      where: {inactive: false, platform: {
        [platform]: true,
      }},
    });
    if (!UInsts.length) { return []; }
    const res = await r6api.getRank(platform, UInsts.map((u) => u.genome));
    return Promise.all(UInsts.map((u) => {
      u.rank = u.region ? res[u.genome][u.region].rank : Math.max(res[u.genome].apac.rank, res[u.genome].ncsa.rank, res[u.genome].emea.rank);
      return u.save();
    }));
}

export async function syncMember(dbGuild: G, dbUser: U) {
    if (!dbGuild || !dbUser) { return false; }
    const guild = bot.guilds.get(dbGuild.id);
    const member = await guild.members.fetch(dbUser.id);
    if (!member) { return false; }
    if (dbUser.verificationLevel < dbGuild.requiredVerification || dbUser.verificationLevel < dbUser.requiredVerification) {
      dbUser.inactive = true;
      await dbUser.save();
      const QR = await generate(dbUser.genome, dbUser.id);
      await member.send(
        `Привет!\n\nДля дальнейшей обработки тебе необходимо подтвердить факт владения указанным аккаунтом Осады - тебе нужно будет поставить прикрепленное изображение c QR-кодом на аватар **Uplay**.\nПосле смены аватара введи здесь команду \`${ENV.PREFIX}verify\`\nСменить аватар можно на https://account.ubisoft.com/ru-RU/account-information?modal=change-avatar`,
        new MessageAttachment(Buffer.from(QR.buffer), 'QR-verification.png'),
        );
      return false;
    }
    if (!guild.available) { return false; }

    // console.log(dbUser.rank, dbUser.platform, dbGuild.rankRoles[dbUser.rank]);

    const currentRankRoles = member.roles.keyArray().filter((r) => dbGuild.rankRoles.includes(r));

    if (currentRankRoles.length > 1) {
      await member.roles.remove(dbGuild.rankRoles.filter((r) => r), 'удаляю роли перед обновлением...');
      if (dbGuild.rankRoles[dbUser.rank]) {
        await member.roles.add(dbGuild.rankRoles[dbUser.rank], '...готово');
      }
      console.log(`[BOT] User ${member.user.tag} updated!`);
    } else if (currentRankRoles.length === 1) {
      const currentRank = dbGuild.rankRoles.indexOf(currentRankRoles[0]);
      if ((dbUser.rank > currentRank || currentRank < dbGuild.fixAfter || dbUser.rank === 0) && currentRank !== dbUser.rank) {
        await member.roles.remove(dbGuild.rankRoles[currentRank], 'удаляю роли перед обновлением...');
        await member.roles.add(dbGuild.rankRoles[dbUser.rank], '...готово');
        console.log(`[BOT] User ${member.user.tag} updated!`);
      }
    } else {
      if (dbGuild.rankRoles[dbUser.rank]) {
        await member.roles.add(dbGuild.rankRoles[dbUser.rank], 'пользователь обновлен');
        console.log(`[BOT] User ${member.user.tag} updated!`);
      }
    }

    const platformRolesToApply = Object.entries(dbGuild.platformRoles).filter((k) => dbUser.platform[k[0]]).map((k) => k[1]).filter((r) => !member.roles.has(r));
    // console.log(platformRolesToApply);
    if (platformRolesToApply.length) {
      await member.roles.add(platformRolesToApply, 'синхронизация платформы');
    }

    return true;
  }

export async function syncRoles() {
  const guilds = await G.findAll({where: {premium: true}});

  guilds.map((g) => console.log('[BOT] Syncing ' + bot.guilds.get(g.id).name));
  const usersAtPlatforms = await Promise.all($enum(PLATFORM).getValues().map((p) => syncRank(p)));
  const users = usersAtPlatforms.reduce((acc, val) => acc.concat(val), []);
  await Promise.all(guilds.map((g) => bot.guilds.get(g.id).members.fetch()));
  await Promise.all(guilds.map((g) => users.filter((u) => bot.guilds.get(g.id).members.has(u.id)).map((u) => syncMember(g, u))).reduce((acc, val) => acc.concat(val), []));
}

export const embeds = {
    rank: function buildRankEmbed(bound: IUbiBound, stats: {won?: any, lost?: any, kills?: any, deaths?: any}) {
      return {
        author: {
          name: bound.nickname,
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
        url: `${ONLINE_TRACKER}${bound.genome}`,
        };
      },
  };
