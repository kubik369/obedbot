import database from 'sqlite';
import Promise from 'bluebird';
import {find, get} from 'lodash';
import moment from 'moment';
import {AllHtmlEntities} from 'html-entities';
import request from 'request-promise';

import {getTodaysMessages, processMessages} from './slack';
import {slack, logger} from './resources';
import config from '../config';

/**
 * Returns string with pretty printed json object
 *
 * @param {Object} json - json object
 * @returns {string} - pretty printed json string
 */

export function prettyPrint(json) {
  return JSON.stringify(json, null, 2);
}

/**
 * Strips the @obedbot part of the message
 *
 * @param {string} order - message with the order
 * @returns {string} - order message without the @obedbot mention
 */

export function stripMention(order) {
  //check if user used full colon after @obedbot
  const orderStart = (order.charAt(12) === ':') ? 14 : 13;

  return order.substring(orderStart);
}

export function isObedbotMentioned(order) {
  return new RegExp(`<@${config.slack.botId}>:?`).test(order);
}

export function isChannelPublic(channel) {
  return channel === config.slack.lunchChannelId;
}

export function alreadyReacted(reactions) {
  return !!find(
    reactions,
    ({name, users}) => name === config.orderReaction && users.includes(config.slack.botId)
  );
}

/**
 * Checks if the given message is an order
 *
 * @param {string} order - order message
 * @returns {bool} - true if order matches, false if not identified
 */
export function isOrder(order) {
  const regexes = config.orderRegex;
  if (isObedbotMentioned(order)) {
    order = stripMention(order);
  }
  order = order.toLowerCase().trim();

  logger.devLog('Checking order: ' + order);

  for (let regexKey in regexes) {
    if (regexes.hasOwnProperty(regexKey)) {
      if (regexes[regexKey].test(order)) {
        logger.devLog(`Order type is ${regexKey}`);
        return true;
      }
    }
  }

  logger.devLog('Message is not an order');
  return false;
}

/**
 * Loads the orders since the last noon
 */
export function loadTodayOrders() {
  logger.devLog('Loading today\'s orders');

  getTodaysMessages().then(processMessages);
}

/**
 * Returns the name of the restaurant to which the order belongs to
 *
 * @param {string} order - message with the order
 * @returns {string} - name of the restaurant
 */

export const restaurants = {
  presto: 'presto',
  pizza: 'pizza',
  veglife: 'veglife',
  hamka: 'hamka',
  click: 'click',
  shop: 'shop',
};

export function identifyRestaurant(order) {
  const regexes = config.orderRegex;
  const values = [
    {regex: regexes.presto, name: restaurants.presto},
    {regex: regexes.pizza, name: restaurants.pizza},
    {regex: regexes.veglife, name: restaurants.veglife},
    {regex: regexes.hamka, name: restaurants.hamka},
    {regex: regexes.click, name: restaurants.click},
    {regex: regexes.shop, name: restaurants.shop},
  ];
  let ans;

  values.forEach((restaurant) => {
    if (restaurant.regex.test(order)) {
      ans = restaurant.name;
    }
  });
  return ans;
}

export function getOrderFromMessage(msg, restaurant) {
  const regex = config.orderRegex[restaurant];
  return msg.match(regex)[0];
}

export function saveUser(userId) {
  logger.devLog('Saving user ' + userId);

  slack.web.im.open(userId)
    .then(({channel: {id: channelId}}) => {
      if (!config.dev) {
        slack.web.chat.postMessage(
          channelId,
          'Ahoj, volám sa obedbot a všimol som si ťa na kanáli #obedy ' +
          'ale nemal som ťa ešte v mojom zápisníčku, tak si ťa poznamenávam, ' +
          'budem ti odteraz posielať last cally, pokiaľ v daný deň nemáš nič objednané :)',
          {as_user: true}
        );
      }

      slack.web.users.info(userId)
        .then((userInfo) => {
          const realname = userInfo.user.profile.real_name;
          database.run(
              'INSERT INTO users(user_id, channel_id, username) VALUES($userId, $channelId, $username)',
              {$userId: userId, $channelId: channelId, $username: realname}
            )
            .then(() => {
              logger.devLog(`User ${realname} has been added to database`);
              if (!config.dev) {
                slack.web.chat.postMessage(
                  channelId,
                  'Dobre, už som si ťa zapísal :) Môžeš si teraz objednávať cez kanál ' +
                  '#obedy tak, že napíšeš `@obedbot [tvoja objednávka]`',
                  {as_user: true}
                );
              }
            }).catch((err) => logger.error(`User ${realname} is already in the database`, err));
        });
    }).catch(
      () => logger.error(`Trying to save bot or disabled user ${userId}`)
    );
}

export async function userExists(userId) {
  return database
    .get(
      'SELECT * FROM users WHERE user_id=$userId',
      {$userId: userId}
    ).then((result) => !!result);
}

export function parseOrders() {
  let presto = {
    soups: {},
    meals: Array(7).fill(0),
    pizza: {},
  };
  let hamka = Array(5 + 1).fill(0).map(() => ([]));
  let veglife = {
    meals: Array(4).fill(0),
    soups: 0,
    salads: 0,
  };
  let click = {
    soups: {},
    meals: Array(5).fill(0),
  };
  let shop = [];

  logger.devLog('Parsing orders for webpage display');

  return getTodaysMessages()
    .then((messages) => {
      for (let message of messages) {
        if (!(isObedbotMentioned(message.text) && isOrder(message.text))) {
          continue;
        }
        const text = stripMention(message.text).toLowerCase().trim();

        const restaurant = identifyRestaurant(text);
        const order = getOrderFromMessage(text, restaurant);

        logger.devLog(`Message ${text} is from ${restaurant}, order ${order}`);

        if (restaurant === restaurants.presto) {
          const mainMealNum = parseInt(order.charAt(6), 10) - 1;
          const soup = order.substring(8);

          presto.meals[mainMealNum]++;
          if (soup) {
            presto.soups[soup] = get(presto.soups, soup, 0) + 1;
          }
        } else if (restaurant === restaurants.pizza) {
          const pizzaNum = order.match(/\d+/g)[0];
          const pizzaSize = order.match(/\d+/g)[1];
          const key = (!pizzaSize || pizzaSize === '33')
            ? pizzaNum
            : `${pizzaNum} veľkosti ${pizzaSize}`;

          presto.pizza[key] = get(presto.pizza, key, 0) + 1;
        } else if (restaurant === restaurants.veglife) {
          const mainMealNum = parseInt(order.charAt(3), 10) - 1;
          const saladOrSoup = order.charAt(order.length - 1);

          veglife.meals[mainMealNum]++;
          if (saladOrSoup === 's') {
            veglife.salads++;
          } else {
            veglife.soups++;
          }
        } else if (restaurant === restaurants.hamka) {
          const number = parseInt(order.charAt(3), 10);
          const note = order.slice(order.charAt(4) === 'p' ? 5 : 4).trim();
          hamka[number].push(note);
        } else if (restaurant === restaurants.click) {
          const mainMealNum = parseInt(order.charAt(5), 10) - 1;
          const soup = order.substring(7);
          click.meals[mainMealNum]++;
          if (soup) {
            click.soups[soup] = get(click.soups, soup, 0) + 1;
          }
        } else if (restaurant === restaurants.shop) {
          shop.push(order.substring(6));
        }
      }

      return Promise.resolve({presto, hamka, click, veglife, shop});
    });
}

export function parseOrdersNamed() {
  const orders = {
    presto: [],
    pizza: [],
    veglife: [],
    hamka: [],
    click: [],
    shop: [],
  };
  let messages;

  return getTodaysMessages()
    .then((history) => {
      messages = history;
      return database.all('SELECT * FROM users');
    }).then((users) => {
      for (let message of messages) {
        if (!(isObedbotMentioned(message.text) && isOrder(message.text))) {
          continue;
        }
        const text = stripMention(message.text).toLowerCase().trim();

        const restaurant = identifyRestaurant(text);
        const order = {
          user: find(users, {user_id: message.user}).username,
          order: getOrderFromMessage(text, restaurant),
        };

        if (restaurant === restaurants.shop) {
          order.order = order.order.substring(6);
        }
        orders[restaurant].push(order);
      }
      logger.devLog(`Orders for named display on webpage: ${orders}`);
      return Promise.resolve(orders);
    });
}

function getMomentForMenu() {
  let mom;

  // if it is Saturday, Sunday or Friday afternoon, set day to Monday
  for (mom = moment(); mom.day() === 0 || mom.day() === 6 || mom.hours() > 13; mom.add(1, 'days').startOf('day'));
  return mom;
}

export async function getMenu(link, parseMenu) {
  const block = '```';
  try {
    if (link.endsWith('date=')) {
      const date = getMomentForMenu().format('DD.MM.YYYY');
      link = `${link}${date}`;
    }
    const body = await request(link);
    return `${block}${parseMenu(body)}${block}`;
  } catch (e) {
    logger.error(e);
    return `${block}Chyba počas načítavania menu :disappointed:${block}`;
  }
}

export async function getAllMenus() {
  const [presto, veglife, hamka, click] = await Promise.all([
    getMenu(config.menuLinks.presto, parseTodaysPrestoMenu),
    getMenu(config.menuLinks.veglife, parseTodaysVeglifeMenu),
    getMenu(config.menuLinks.hamka, parseTodaysHamkaMenu),
    getMenu(config.menuLinks.click, parseTodaysClickMenu),
  ]);

  return `*Presto*\n${presto}\n\n*Veglife*\n${veglife}\n\n*Hamka*\n${hamka}\n\n*Click*\n${click}`;
}

export function parseTodaysPrestoMenu(rawMenu) {
  const entities = new AllHtmlEntities();
  // CENA is there as a delimiter because the menu continues on with different things
  const slovakDays = ['', 'PONDELOK', 'UTOROK', 'STREDA', 'ŠTVRTOK', 'PIATOK', 'CENA'];
  const today = getMomentForMenu().day();

  // delete all HTML tags
  let menu = rawMenu.replace(/<[^>]*>/g, '');
  menu = entities.decode(menu);
  const menuStart = menu.indexOf(slovakDays[today]);
  const menuEnd = menu.indexOf(slovakDays[today + 1]);
  if (menuStart === -1 || menuEnd === -1) throw new Error('Parsing Presto menu: unable to find menu for today');
  menu = menu
    // presto has the whole menu on single page, cut out only today
    .substring(menuStart, menuEnd)
    .split('\n')
    .map((row) => row.trim())
    // delete empty lines
    .filter((row) => row.length)
    .join('\n')
    // replace all multiple whitespaces with single space
    .replace(/\s\s+/g, ' ');

  return menu;
}

export function parseTodaysVeglifeMenu(rawMenu) {
  const slovakDays = ['', 'PONDELOK', 'UTOROK', 'STREDA', 'ŠTVRTOK', 'PIATOK', 'SOBOT'];
  const today = getMomentForMenu().day();
  const menuStart = rawMenu.indexOf(slovakDays[today]);
  const menuEnd = rawMenu.indexOf(slovakDays[today + 1]);
  if (menuStart === -1 || menuEnd === -1) throw new Error('Parsing Veglife menu: unable to find menu for today');
  let menu = rawMenu
    .substring(menuStart, menuEnd)
    // delete all HTML tags
    .replace(/<[^>]*>/g, '')
    .split('\n')
    .map((row) => row.trim())
    // delete empty lines
    .filter((row) => row.length)
    .join('\n')
    // replace all multiple whitespaces with single space
    .replace(/\s\s+/g, ' ');

  let infoIndex = menu.indexOf('+ Pestrá');
  if (infoIndex === -1) {
    infoIndex = menu.indexOf('Nemôžete prísť?');
  }
  if (infoIndex !== -1) {
    // delete unnecessary part
    menu = menu.substring(0, infoIndex);
  }
  return menu;
}

export function parseTodaysHamkaMenu(rawMenu) {
  const menuStart = rawMenu.indexOf('<p class');
  if (menuStart === -1) throw new Error('Parsing Hamka menu: "<p class" not found');
  const menuEnd = rawMenu.indexOf('</div>', menuStart);
  if (menuEnd === -1) throw new Error('Parsing Hamka menu: "</div>" not found');
  const menu = rawMenu
    .substring(menuStart, menuEnd)
    .replace(/<p[^>]*>(.*?)<\/p>/g, '$1\n')
    .replace(/<[^>]*>/g, '');
  return menu;
}

function getIndicesOf(searchStrFrom, searchStrTo, str) {
  const searchStrFromLen = searchStrFrom.length;
  const searchStrToLen = searchStrTo.length;
  if (searchStrFromLen === 0 || searchStrToLen === 0) {
    return [];
  }
  let startIndex = 0;
  let index;
  const indices = [];
  while ((index = str.indexOf(searchStrFrom, startIndex)) > -1) {
    const from = index + searchStrFromLen;
    const to = str.indexOf(searchStrTo, from);
    indices.push({from, to});
    startIndex = to + searchStrToLen;
  }
  return indices;
}


export function parseTodaysClickMenu(rawMenu) {
  const menuStart = rawMenu.indexOf('<div id="menu-');
  if (menuStart === -1) {
    throw new Error('Parsing Click menu: "<div id="menu-" not found');
  }
  const menuEnd = rawMenu.indexOf('<div id="salaty"', menuStart);
  if (menuEnd === -1) {
    throw new Error('Parsing Click menu: "<div id="salaty"" not found');
  }
  const menu = rawMenu
    .substring(menuStart, menuEnd);

  const indices = getIndicesOf('<h4 class="modal-title">', '</h4>', menu);
  const dayStartIndex = menu.indexOf('Menu ') + 'Menu '.length;
  const dayEndIndex = menu.indexOf('<', dayStartIndex);
  const soupsIndex = menu.indexOf('<div id="polievky"');

  const day = menu.substring(dayStartIndex, dayEndIndex);
  const soup = [], main = [];
  indices.forEach((index) => {
    const item = menu
      .substring(index.from, index.to)
      .trim()
      .replace(/\s+/, ' ');
    if (index.from < soupsIndex) {
      if (parseInt(item, 10) > 120) { // filter dessert
        main.push(item);
      }
    } else {
      soup.push(item);
    }
  });
  return [
    `Menu na ${day}`,
    'Polievky:',
    ...soup,
    'Hlavné jedlo:',
    ...main,
  ].join('\n');
}
