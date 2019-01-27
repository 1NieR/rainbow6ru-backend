import { EmojiResolvable, Message, MessageOptions, MessageReaction, ReactionEmoji, Snowflake, User, UserResolvable } from 'discord.js';

interface IPromptOptions {
    [prop: string]: any;
    lifetime?: number;
    aftertime?: number;
    emojis?: string[];
    messageOpt?: MessageOptions;
}

export enum MATCH_TYPE {
  BO1 = 'bo1',
  BO2 = 'bo2',
  BO3 = 'bo3',
  BO5 = 'bo5',
  BO7 = 'bo7',
}
// class Utils {

// }

export async function combinedPrompt(prompt: Message, options: {
  emojis?: string[] | EmojiResolvable[],
  texts?: Array<string | string[]>,
  message: Message,
  time?: number,
  keep?: boolean,
}): Promise<number> {
  const { author } = options.message;
  const time = options.time || 5 * 60 * 1000;

  (async () => {
    for (const e of options.emojis) {
      await prompt.react(e);
    }
  })();

  const emojiFilter = (reaction: MessageReaction, user: User) => options.emojis.includes(reaction.emoji.id || reaction.emoji.name) && user.id === author.id;

  const textFilter = (msg: Message) => {
    const answ = msg.author.id === author.id &&
      options.texts.some(([...t]) =>
        t.some((txt) =>
          msg.content.toLowerCase().includes(txt),
        ));
    if (answ && !options.keep) {
      msg.delete();
    }
    return answ;
  };

  const race = await Promise.race([prompt.awaitReactions(emojiFilter, { max: 1, time }), prompt.channel.awaitMessages(textFilter, { max: 1, time })]);
  const result = race.first() as any;
  if (!options.keep) {
    prompt.delete({timeout: 5000});
  }
  // console.log({result}, result instanceof Message, result instanceof MessageReaction)
  if (result.channel) {
    return options.texts.findIndex(([...t]) =>
    t.some((txt) =>
      result.content.toLowerCase().includes(txt),
    ));
  } else if (result.message) {
    return options.emojis.indexOf(result.emoji.id || result.emoji.name);
  } else {
    return -1;
  }
}
