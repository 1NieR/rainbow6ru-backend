import { Guild, User } from '@r6ru/db';
import { VERIFICATION_LEVEL, VERIFIED_BADGE } from '@r6ru/types';
import { combinedPrompt } from '@r6ru/utils';
import { Command } from 'discord-akairo';
import { Message, User as U } from 'discord.js';
import { debug } from '../../..';
import bot from '../../../bot';
import ENV from '../../../utils/env';
import { verify } from '../../../utils/qr';
import Sync from '../../../utils/sync';

interface IArgs {
    target: U;
    scan: 'scan';
}

export default class Verify extends Command {
    public constructor() {
        super('verify', {
            aliases: ['verify', 'V'],
            args: [{
                default: (msg: Message) => msg.author,
                id: 'target',
                type: 'user',
                unordered: true,
            }, {
                id: 'scan',
                type: ['scan'],
                unordered: true,
            }],
            cooldown: 5000,
        });
        this.typing = true;
    }

    // @TryCatch(debug)
    public exec = async (message: Message, args: IArgs) => {
        const { target, scan } = args;
        if (target.id !== message.author.id && ((message.channel.type === 'text' && message.member.hasPermission('MANAGE_ROLES')) || [...this.client.ownerID].includes(message.author.id))) {
            const dbUserTarget = await User.findByPk(target.id);
            if (!dbUserTarget.platform.PC) {
                return message.reply('верификация аккаунтов с консолей не поддерживается!');
            }
            if (scan === 'scan') {
                return this.verifyDM(await target.send('_...QR-код сканируется администратором..._') as Message, dbUserTarget);
            } else {
                return this.verifyMember(message, dbUserTarget);
            }
        }
        const dbUser = await User.findByPk(message.author.id);
        if (!dbUser.platform.PC) {
            return message.reply('верификация аккаунтов с консолей не поддерживается!');
        }
        if (dbUser?.genome) {
            if (dbUser.verificationLevel >= VERIFICATION_LEVEL.QR) {
                return message.reply('вы уже подтвердили свой аккаунт!');
            }
            if (message.channel.type === 'dm') {
                return this.verifyDM(message, dbUser);
            } else {
                if (dbUser.isInVerification) {
                    await Sync.sendQrRequest(await Guild.findByPk(message.guild.id), dbUser, message.member);
                    return message.reply(`вы уже в процессе верификации. Смотрите инструкцию в ЛС с ${this.client.user}`);
                } else {
                    return this.verifyGuild(message, dbUser);
                }
            }
        } else {
            return message.reply('вы должны сначала зарегистрироваться!');
        }
    }

    // @TryCatch(debug)
    private verifyMember = async (message: Message, dbUser: User) => {
        dbUser.requiredVerification = VERIFICATION_LEVEL.QR;
        await dbUser.save();
        await Sync.updateMember(await Guild.findByPk(message.guild.id), dbUser);
        debug.log(`<@${message.author.id}> запрошена верификация аккаунта <@${dbUser.id}> ${dbUser}`);
        try {
            const member = await message.guild.members.fetch(dbUser.id);
            await member.voice?.setChannel(null);
        } catch (error) {
            console.log('member not in voice');
        }
        return message.reply('верификация запрошена');
    }

    // @TryCatch(debug)
    private verifyDM = async (message: Message, dbUser: User) => {
        try {
            switch (await verify(dbUser.genome, dbUser.id)) {
                case true: {
                        dbUser.verificationLevel = VERIFICATION_LEVEL.QR;
                        dbUser.inactive = false;
                        await dbUser.save();
                        debug.log(`<@${dbUser.id}> верифицировал аккаунт ${dbUser}`);
                        const msg = await message.reply(`Вы успешно подтвердили свой аккаунт ${bot.emojis.resolve(VERIFIED_BADGE)}! Возвращаем роли...`) as Message;
                        const guilds = await Guild.findAll({where: {premium: true}});
                        await Promise.all(guilds.map(g => Sync.updateMember(g, dbUser)));
                        return msg.edit(`Вы успешно подтвердили свой аккаунт ${bot.emojis.resolve(VERIFIED_BADGE)}! Роли возвращены, приятной игры!`);
                    }
                case false: return message.reply('Неккоректный QR-код!\nДля каждой комбинации аккаунтов Discord и Uplay предусмотрен свой уникальный QR-код.');
                case null: return message.reply('QR-код не установлен!');
            }
        } catch (err) {
            console.log(err);
        }
    }

    // @TryCatch(debug)
    private verifyGuild = async (message: Message, dbUser: User) => {
        const prmpt = await combinedPrompt(await message.reply('вы действительно хотите пройти процедуру верификации с помощью QR-кода?\nВам потребуется доступ к панели управления аккаунтом Uplay и немного желания.\nУбедитесь, что не заблокировали ЛС с ботом.') as Message, {
            author: message.author,
            emojis: ['✅', '❎'],
            texts: [['да', 'yes', '+'], ['нет', 'no', '-']],
            time: 10 * 60 * 1000,
        });
        switch (prmpt) {
            case 1: return message.reply('вы отклонили подтверждение.');
            case -1: return message.reply('время на подтверждение истекло.');
            case 0: {
                dbUser.requiredVerification = VERIFICATION_LEVEL.QR;
                await dbUser.save();
                await Sync.updateMember(await Guild.findByPk(message.guild.id), dbUser);
                debug.log(`самостоятельно запрошена верификация аккаунта <@${dbUser.id}> ${dbUser}`);
                await message.member?.voice?.setChannel(null);
                return message.reply('инструкции отправлены вам в ЛС.');
            }
        }

    }
}
