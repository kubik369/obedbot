// load .env variables into process.env
require('dotenv').config({path: process.env.CIRCLECI ? './.env.test' : './.env'});

const config = {
  dev: (process.env.OBEDBOT_DEV === 'true') || false,
  port: process.env.OBEDBOT_PORT || 4000,
  slack: {
    token: process.env.OBEDBOT_BOT_TOKEN || '',
    lunchChannelId: process.env.OBEDBOT_CHANNEL_ID || '',
    botId: process.env.OBEDBOT_BOT_ID || '',
  },
  menuLinks: {
    presto: process.env.OBEDBOT_PRESTO || '',
    veglife: process.env.OBEDBOT_VEGLIFE || '',
    hamka: process.env.OBEDBOT_HAMKA || '',
    click: process.env.OBEDBOT_CLICK || '',
  },
  orderRegex: {
    presto: /^presto[1-7](p[1-2])?\b/,
    pizza: /^pizza[0-9]{1,2}(v((33)|(40)|(50)))?\b/,
    veglife: /^veg[1-4]\+?[ps]?\b/,
    hamka: /^ham[1-5].*/,
    click: /click[1-6](p[1-3])?\b/,
    shop: /^((nakup)|(nákup)|(nakúp)).*/,
  },
  orderReaction: 'taco',
  orderUnknownReaction: 'question',
  dbPath: './obedbot.db',
  messages: require('./messages'),
};

if (!config.slack.token || !config.slack.lunchChannelId
  || !config.slack.botId || !config.menuLinks.presto || !config.menuLinks.veglife
  || !config.menuLinks.hamka) {
  console.error('Missing env variables!');
  process.exit(1);
}

module.exports = config;
module.exports.default = config;
