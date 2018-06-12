# obedbot

Because ordering lunches is just way too hard.

## How to set it up

You need a working installation of [Node.js](https://nodejs.org/en/), preferably in version 8.1.3+.

Copy `.env.template` into `.env` and fill it in with your information.
`OBEDBOT_CHANNEL_ID` is the id of the channel which the bot should be monitoring.
`OBEDBOT_DEV` disables some messages, so that development does not bother users and determines
whether to use transpiled code from `build` or directly from `src` with babel-watch.

For production
```
git clone https://github.com/vacuumlabs/obedbot.git && cd obedbot
cp obedbot-template.db obedbot.db
cp .env.template .env
yarn
yarn test
yarn start
```

For development - do not forget to set `OBEDBOT_DEV` and tokens correctly!
```
git clone https://github.com/vacuumlabs/obedbot.git && cd obedbot
cp obedbot-template.db obedbot.db
cp .env.template .env
yarn
yarn test
yarn run dev
```
