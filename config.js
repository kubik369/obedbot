// load .env variables into process.env
require('dotenv').config()

const config = {
  dev: process.env.OBEDBOT_DEV === 'true' || false,
  port: process.env.OBEDBOT_PORT || 4000,
  airtable: {
    apiKey: process.env.OBEDBOT_API_KEY || '',
    baseId: process.env.OBEDBOT_BASE_ID || '',
    tableName: process.env.OBEDBOT_TABLE_NAME || '',
  },
  slack: {
    userToken: process.env.OBEDBOT_USER_TOKEN || '',
    botToken: process.env.OBEDBOT_BOT_TOKEN || '',
    lunchChannelId: process.env.OBEDBOT_CHANNEL_ID || '',
    botId: process.env.OBEDBOT_BOT_ID || '',
  },
  menuLinks: {
    presto: process.env.OBEDBOT_PRESTO || '',
    veglife: process.env.OBEDBOT_VEGLIFE || '',
    click: process.env.OBEDBOT_CLICK || '',
  },
  orderRegex: {
    presto: /presto[1-7](p[1-2])?/,
    pizza: /pizza[0-9]{1,2}(v((33)|(40)|(50)))?/,
    veglife: /veg[1-4]\+?[ps]?/,
    click: /click[1-6](p[1-4])?/,
    shop: /^((nakup)|(nákup)|(nakúp)).*/,
  },
  orderReaction: 'taco',
  orderUnknownReaction: 'question',
  messages: require('./messages'),
}

const requiredConfig = [
  config.slack.userToken,
  config.slack.botToken,
  config.slack.lunchChannelId,
  config.slack.botId,
  config.menuLinks.presto,
  config.menuLinks.veglife,
  config.airtable.apiKey,
  config.airtable.baseId,
  config.airtable.tableName,
]

if (requiredConfig.some(value => !value)) {
  console.error('Missing env variables!')
  process.exit(1)
}

module.exports = config
module.exports.default = config
