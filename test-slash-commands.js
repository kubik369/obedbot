const config = require('./config');
const utils = require('./build/utils');

(async () => {
  const veglife = await utils.getMenu(config.menuLinks.veglife, utils.parseTodaysVeglifeMenu);
  const presto = await utils.getMenu(config.menuLinks.presto, utils.parseTodaysPrestoMenu);
  const hamka = await utils.getMenu(config.menuLinks.hamka, utils.parseTodaysHamkaMenu);
  const click = await utils.getMenu(config.menuLinks.click, utils.parseTodayClickMenu);

  console.log(veglife);
  console.log(presto);
  console.log(hamka);
  console.log(click);
})();
