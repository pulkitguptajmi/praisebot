const router = require('express').Router();
// Require the Node Slack SDK package (github.com/slackapi/node-slack-sdk)
const { WebClient, LogLevel } = require("@slack/web-api");
const { PrismaClient } = require('@prisma/client')
const Sentiment = require('sentiment');

const sentiment = new Sentiment();
const prisma = new PrismaClient();
const tenantId = '33e3f9d0-877a-11ed-a1eb-0242ac120002';

router.get('/', async (req, res, next) => {
  res.send({ message: 'We are up and running! 🚀' });
});


router.get('/conversations', async (req, res, next) => {
  // WebClient instantiates a client that can call API methods
  // When using Bolt, you can use either `app.client` or the `client` passed to listeners.
  const client = new WebClient('xoxb-4130878751557-4566359300102-RogviE9ZrsDcJAO9Z7obXXJ5', {
    // LogLevel can be imported and used to make debugging simpler
    logLevel: LogLevel.DEBUG
  });

  try {
    // Call the conversations.list method using the WebClient
    const conversationsArray = await client.conversations.list();

    conversationsArray.channels.forEach(async function(conversation){
      // Key conversation info on its unique ID
      const conversationId = conversation["id"];
      const channelName = conversation["name"];

      try {
        await prisma.conversations.create({
              data:
                  {
                    id: conversationId,
                    channelName: channelName,
                    tenantId,
                    isInstalled: false,
                  }
            }
        )
      } catch (e) {
        console.log(e);
      }
    });
  }
  catch (error) {
    console.error(error);
  }
});

router.get('/users', async (req, res, next) => {
  // WebClient instantiates a client that can call API methods
  // When using Bolt, you can use either `app.client` or the `client` passed to listeners.
  const client = new WebClient('xoxb-4130878751557-4566359300102-RogviE9ZrsDcJAO9Z7obXXJ5', {
    // LogLevel can be imported and used to make debugging simpler
    logLevel: LogLevel.DEBUG
  });

  try {
    // Call the users.list method using the WebClient
    const usersArray = await client.users.list();

    usersArray.members.forEach(async function(user){
      // Key user info on their unique user ID
      const userId = user["id"];
      const userName = user.profile['first_name'];
      const emailAddress = user.profile['email'];

      try {
        await prisma.users.create({
          data: {
            id: userId,
            name: userName,
            emailAddress,
            isDeleted: false,
            tenantId,
          }
        })
      } catch (e) {
        console.log(e);
      }
    });
  }
  catch (error) {
    console.error(error);
  }
});

router.get('/praises', async (req, res, next) => {
  // WebClient instantiates a client that can call API methods
  // When using Bolt, you can use either `app.client` or the `client` passed to listeners.
  const client = new WebClient('xoxb-4130878751557-4566359300102-RogviE9ZrsDcJAO9Z7obXXJ5', {
    // LogLevel can be imported and used to make debugging simpler
    logLevel: LogLevel.DEBUG
  });

  const channelIds = await prisma.conversations.findMany({
    where: {
      tenantId
    },
    select: {
      id: true,
    }
  });


  const keywords = ['awesome', 'thanks', 'thank you', 'you rock',
    'amazing', 'very happy', 'elated', 'congratulations',
  'kudos', 'great job', 'good job', 'good work', 'well done', 'very happy', 'big win',
  'thanking', 'thankful', 'grateful', 'gratitude', 'appreciation', 'appreciative',
  'appreciated', 'appreciates', 'appreciating', 'appreciations', 'gratitudes', 'way to go',
  'congratulations', 'congratulate', 'congratulated', 'congratulates', 'congratulating, congratulatory'];
  for (const channelId of channelIds) {
    try {
      // Call the conversations.history method using the WebClient
      const messagesArray = await client.conversations.history({
        channel: channelId.id,
        limit: 1000,
      });

      messagesArray.messages.forEach(async function (message) {
        const text = message["text"];
        if (text === null || text === undefined || text === '') return;

        const sentimentResult = sentiment.analyze(text);
        if (sentimentResult.score <= 0) return;

        const keywordsFound = keywords.some(keyword => text.toLowerCase().includes(keyword));
        if (!keywordsFound) return;

        const numberOfReactions = message.reactions?.length;

        const permalink = await client.chat.getPermalink({
            channel: channelId.id,
            message_ts: message.ts,
        });
        const userIds = [];
        text.match(/<@\w+>/g).forEach(function(obj) {
          userIds.push(obj.replace('<', '').
          replace('>', '').
          replace('@', ''))
        })
        if (userIds.length === 0) return; // We only want praise messages with users in them, else no use for us for now

        for (const userId of userIds) {
          try {
            await prisma.praises.create({
              data: {
                id: message["ts"],
                text: `${text.replace(/<@\w+>/g, '')} (${permalink.permalink})`,
                userId,
                numberOfReactions,
              }
            })
          } catch (error) {
            console.error(error);
          }
        }
      })
    } catch (error) {
      console.error(error);
    }
  }
});

router.get('/sendPraises', async (req, res, next) => {
  const client = new WebClient('xoxb-4130878751557-4566359300102-RogviE9ZrsDcJAO9Z7obXXJ5', {
    // LogLevel can be imported and used to make debugging simpler
    logLevel: LogLevel.DEBUG
  });

  const praises = await prisma.praises.findMany({
    where: {
      createdAt: {
        gt: new Date(Date.now() - 604800000),
      }
    },
    select: {
      id: true,
      text: true,
      userId: true,
      numberOfReactions: true,
      createdAt: true,
    }
  });

  let channel;
  for (const praise of praises) {
    const userId = praise.userId;
    try {
      const result = await client.conversations.open({
        users: userId,
      });
      channel = result.channel.id;
    } catch (error) {
      console.error(error);
    }

    const message = `Wooohoooo! Your colleagues love you. They have heaped praises on you last week. 
    Here's one we tumbled on: ${praise.text}`;
    try {
      // Call the chat.postMessage method using the WebClient
      const result = await client.chat.postMessage({
        channel: channel,
        text: message,
      });
      console.log(result);
    }
    catch (error) {
      console.error(error);
    }
  }
});

module.exports = router;
