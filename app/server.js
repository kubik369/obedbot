'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.runServer = runServer;

var _client = require('@slack/client');

var _lodash = require('lodash');

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _config = require('../config');

var _config2 = _interopRequireDefault(_config);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const token = _config2.default.slack.token;
// #obedbot-testing id - 'G1TT0TBAA'
//const channelId = 'G1TT0TBAA';
const channelId = _config2.default.slack.channelId;
const botUserId = _config2.default.slack.botId;
const atObedbot = new RegExp("^<@" + botUserId + ">");
const reaction = _config2.default.slack.reaction;

let veglife = [];
let jpn = [];
let spaghetti = [];
let nakup = [];
// ts = timestamp
let lastCall = {
  ts: null,
  timeLeft: null
};
const lastCallLength = _config2.default.lastCall.length;
const lastCallStep = _config2.default.lastCall.step;

const port = _config2.default.port;
let rtm;
let web;

/**
 * Makes the last call for orders
 */
function makeLastCall() {
  if ((0, _lodash.isNull)(lastCall.ts)) {
    lastCall.timeLeft = lastCallLength;
    rtm.sendMessage('Last call ' + lastCall.timeLeft, channelId, function messageSent(err, msg) {
      console.log('Sent last call message', err, msg);

      lastCall.ts = msg.ts;
      lastCall.timeLeft = lastCallLength;

      setTimeout(makeLastCall, lastCallStep * 1000);
    });
  } else if (lastCall.timeLeft > 0 && lastCall.timeLeft <= lastCallLength) {
    lastCall.timeLeft -= lastCallStep;

    web.chat.update(lastCall.ts, channelId, 'Last call ' + lastCall.timeLeft);

    setTimeout(makeLastCall, lastCallStep * 1000);
  } else if (lastCall.timeLeft <= 0) {
    web.chat.update(lastCall.ts, channelId, 'Koniec objednavok');

    lastCall.timeLeft = null;
    lastCall.ts = null;
  } else {
    console.log('This should not happen');
  }
}

/**
 * Strips the @obedbot part of the message
 *
 * @param {string} order - message with the order
 * @returns {string} - order message without the @obedbot mention
 */

function stripMention(order) {
  //check if user used full colon after @obedbot
  const orderStart = order.charAt(12) === ':' ? 14 : 13;

  return order.substring(orderStart);
}

/**
 * Checks the incoming order and assigns it to the correct restaurant
 *
 * @param {string} order - order message
 * @param {string} ts - timestamp of the order message
 * @returns {bool} - true if order matches, false if not identified
 */
function processOrder(order, ts) {
  order = order.toLowerCase();
  console.log('Processing order:', order);
  if (order.match(/veg[1-4]\+?[ps]?/)) {
    console.log('Veglife', order);
    veglife.push({ ts: ts, order: order });
  } else if (order.match(/[1-8]\+[pk]/)) {
    console.log('Jedlo pod nos');
    jpn.push({ ts: ts, order: order });
  } else if (order.match(/[a-zA-Z]((300)|(400)|(450)|(600)|(800))[ps]?\+[pt]/)) {
    console.log('Spaghetti');
    spaghetti.push({ ts: ts, order: order });
  } else if (order.match(/^nakup/)) {
    console.log('andy chce kura a', order.substring(6));
    nakup.push({ ts: ts, order: order.substring(6) });
  } else {
    console.log('ziadna restika');
    return false;
  }

  return true;
}

/**
 * Updates the order with the given ts to newOrder
 *
 * @param {string} newOrder - new order message
 * @param {string} ts - timestamp of the order message
 * @returns {bool} - true if order with supplied ts is found, false otherwise
 */
function updateOrder(newOrder, ts) {
  const restaurants = [jpn, veglife, spaghetti];

  for (let restaurant of restaurants) {
    for (let order of restaurant) {
      if (order.ts === ts) {
        order.order = newOrder;
        return true;
      }
    }
  }

  return false;
}

/**
 * Adds reaction to the message to confirm the order
 *
 * @param {string} ts - timestamp of the order message
 *
 */

function confirmOrder(ts) {
  web.reactions.add(reaction, { channel: channelId, timestamp: ts });
}

/**
 * Pads and sorts the array to length 'size' with empty orders at the end.
 * Orders are sorted by arr[].order 
 *
 * @param {Object[]} orders - Array with orders
 * @param {string} orders[].ts - Slack timestamp of the order message
 * @param {string} orders[].order - Message with the order
 * @param {number} size - desired length of the array
 * @returns {Object[]} - padded array with alphabetically ordered orders
 */
function padArray(orders, size) {
  orders.sort((a, b) => a.order.localeCompare(b.order));

  while (orders.length !== size) {
    orders.push({ ts: 'fake time', order: '' });
  }

  return orders;
}

/**
 * Function called by slack api after receiving message event
 *
 * @param {Object} res - response slack api received
 *
 */

function messageReceived(res) {
  console.log('Message Arrived:\n', JSON.stringify(res, null, 2));

  if ((0, _lodash.isNil)(res.subtype)) {
    let order = res.text;

    if (order.match(atObedbot)) {
      order = stripMention(order);

      if (processOrder(order, res.ts)) {
        confirmOrder(res.ts);
      }
    }
  } else if (res.subtype === _client.RTM_MESSAGE_SUBTYPES.MESSAGE_CHANGED) {
    console.log('Received an edited message');

    // edited last call message came in
    if (!(0, _lodash.isNull)(lastCall.ts) && res.previous_message.ts === lastCall.ts) {
      console.log('Received last call message edited by obedbot.');
    } else {
      console.log('Received edited message.');
      let order = res.message.text;

      if (order.match(atObedbot)) {
        order = stripMention(order);

        if (updateOrder(order, res.message.ts)) {
          console.log('Updated some order.');
        } else {
          console.log('Order with such id does not exist.');

          if (processOrder(order, res.message.ts)) {
            confirmOrder(res.message.ts);
          }
        }
      }
    }
  }
}

function orderExists(ts) {
  const restaurants = [jpn, veglife, spaghetti];

  for (let restaurant of restaurants) {
    for (let order of restaurant) {
      if (order.ts === ts) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Loads the orders since the last noon
 */
function loadTodayOrders() {
  console.log('Loading today\'s orders from', channelId);

  let lastNoon = new Date();
  let now = lastNoon.getTime();

  if (lastNoon.getHours() < 12) {
    lastNoon.setDate(lastNoon.getDate() - 1);
  }

  lastNoon.setHours(12);
  lastNoon.setMinutes(0);
  lastNoon.setSeconds(0);

  let messages = web.channels.history(channelId, {
    latest: now / 1000,
    oldest: lastNoon.getTime() / 1000
  }).then(data => {
    for (let message of data.messages) {
      let order = message.text;
      if (!orderExists(message.ts)) {
        if (order.match(atObedbot)) {
          order = stripMention(order);

          if (processOrder(order, message.ts)) {
            web.reactions.get({
              channel: channelId,
              timestamp: message.ts,
              full: true
            }).then(res => {
              console.log('Checking order confirmation:', JSON.stringify(res, null, 2));

              if ((0, _lodash.isNil)(res.message.reactions)) {
                confirmOrder(res.message.ts);
              } else {
                console.log('Reactions:', JSON.stringify(res.message.reactions, null, 2));

                // if order hasn't been confirmed
                if (res.message.reactions.filter(r => r.name === reaction).length === 0) {
                  confirmOrder(res.message.ts);
                }
              }
            });
          }
        }
      }
    }
    console.log('Loaded today\'s orders');
  });
}

function renderOrders(req, res) {
  const maxOrders = Math.max(veglife.length, jpn.length, spaghetti.length);
  /*console.log('Orders:');
  console.log('Veglife:', veglife);
  console.log('Jedlo pod nos:', jpn);
  console.log('Leviathan:', spaghetti);
   console.log('Veglife:', padArray(veglife.slice(), maxOrders));
  console.log('Jedlo pod nos:', padArray(jpn.slice(), maxOrders));
  console.log('Leviathan:', padArray(spaghetti.slice(), maxOrders));
  */
  res.render('index', {
    title: 'Obedbot page',
    tableName: 'Dne\u0161n\u00E9 objedn\u00E1vky',
    maxOrders: maxOrders,
    allOrders: {
      'Jedlo pod nos': padArray(jpn.slice(), maxOrders),
      'Veglife': padArray(veglife.slice(), maxOrders),
      'Spaghetti': padArray(spaghetti.slice(), maxOrders),
      'Nakup': padArray(nakup.slice(), maxOrders)
    }
  });
}

/**
 * Starts the bot server
 */
function runServer() {
  const app = (0, _express2.default)();
  rtm = new _client.RtmClient(token, { logLevel: 'error' });
  web = new _client.WebClient(token);

  app.set('view engine', 'pug');
  app.use(_express2.default.static('public'));

  app.get('/', renderOrders);

  app.listen(port, () => {
    console.log('Server listening on port', port);
  });

  rtm.start();
  console.log('slack server started');

  rtm.on(_client.RTM_EVENTS.MESSAGE, messageReceived);

  rtm.on(_client.CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
    // the timeout is here to go around a bug where connection is opened, but not properly established
    console.log('Connected');

    setTimeout(loadTodayOrders, 3000);
  });
}
//# sourceMappingURL=server.js.map