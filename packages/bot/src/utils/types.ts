import * as Discord from 'discord.js';
// import * as Akairo from 'discord-akairo';

export const RankResolvable = [
    'Unranked',
    'Copper IV', 'Copper III', 'Copper II', 'Copper I',
    'Bronze IV', 'Bronze III', 'Bronze II', 'Bronze I',
    'Silver IV', 'Silver III', 'Silver II', 'Silver I',
    'Gold IV', 'Gold III', 'Gold II', 'Gold I',
    'Platinum III', 'Platinum II', 'Platinum I', 'Diamond'
]

export type UUID = string

export interface IHistoryRecord {
    record: string;
    timestamp: number;
}

export interface IRankArgs {
    genome: UUID;
    nickname: string;
    target: Discord.GuildMember;
    bound: IUbiBound;
}

export interface IUbiBound {
    nickname?: string,
    genome?: string,
    err?: Error
}

class IEnv {
    PREFIX = "";
    OWNERS = "";
    HOME_GUILD = "";
    DISCORD_TOKEN = "";
    DISCORD_SECRET = "";
    CALLBACK_URL = "";
    DB = "";
    R6API_LOGIN = "";
    R6API_PASSWORD = "";
    R6API_LOGLEVEL = "";
    PACK_SIZE = "";
    COOLDOWN = "";
}

class IDefaultEnv extends IEnv {
    DANGER_DROP_BEFORE_START = "";
    DISCORD_ID = "";
    PORT = "";
}

for (const key in new IEnv) {
    if (!process.env[key]) throw new Error(`Enviromental variable ${key} not specified`)
}

export const ENV = process.env as any as IDefaultEnv;

export enum VERIFICATION_LEVEL {
    NONE,
    MATCHNICK,
    R6DB,
    QR,
}

export enum PLATFORM {
    PC = 'PC',
    PS4 = 'PS4',
    XBOX = 'XBOX'
}

export enum REGIONS {
    APAC = 'apac',
    EMEA = 'emea',
    NCSA = 'ncsa'
}

export enum RANKS {
    UNRANKED,
    COPPER4, COPPER3, COPPER2, COPPER1,
    BRONZE4, BRONZE3, BRONZE2, BRONZE1,
    SILVER4, SILVER3, SILVER2, SILVER1,
    GOLD4, GOLD3, GOLD2, GOLD1,
    PLATINUM3, PLATINUM2, PLATINUM1, DIAMOND
}

export enum ACCESS {
    OWNER,
    ABSOLUTE,
    ADMIN,
    MODERATOR,
    CONTENTMANAGER,
    ALLNEWS,
    NEWS,
    // ...
    NONE,
}

export const ONLINE_TRACKER = 'https://r6tab.com/'