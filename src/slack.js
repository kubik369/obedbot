import moment from 'moment';
import {isNil, find} from 'lodash';
import {RTM_MESSAGE_SUBTYPES} from '@slack/client';

import {slack, logger} from './resources';
import {userExists, saveUser, isObedbotMentioned, stripMention, identifyRestaurant,
  restaurants, prettyPrint, isChannelPublic, alreadyReacted, isOrder, getAllMenus,
} from './utils';
import config from '../config';
import {listRecords, updateRecord} from './airtable';

export function loadUsers() {
  slack.web.channels.info(config.slack.lunchChannelId)
    .then(async ({channel: {members}}) => {
      for (const member of members) {
        if (member === config.slack.botId) {
          logger.devLog('Skipping member obedbot');
          continue;
        }
        if (!(await userExists(member))) {
          saveUser(member);
        }
      }
    });
}

export async function getTodaysMessages() {
  let lastNoon = moment();
  let now = moment();

  // set the date to last Friday if it is Saturday (6), Sunday (0) or Monday (1)
  if (now.day() === 0 || (now.day() === 1 && now.hours() < 13) || now.day() === 6) {
    lastNoon.day(lastNoon.day() >= 5 ? 5 : -2);
  } else if (now.hours() < 13) {
    lastNoon.subtract(1, 'day');
  }

  lastNoon.hours(13);
  lastNoon.minutes(0);
  lastNoon.seconds(0);

  const timeRange = {
    latest: now.valueOf() / 1000,
    oldest: lastNoon.valueOf() / 1000,
  };

  return (await slack.web.channels.history(config.slack.lunchChannelId, timeRange)).messages;
}

export async function notifyAllThatOrdered(callRestaurant, willThereBeFood) {
  logger.devLog('Notifying about food arrival', callRestaurant);
  const messages = await getTodaysMessages();
  const users = await listRecords();
  const restaurantNames = {
    [restaurants.presto]: 'Pizza Presto',
    [restaurants.hamka]: 'Hamka',
    [restaurants.click]: 'Click',
    [restaurants.veglife]: 'Veglife',
    [restaurants.shop]: 'obchodu',
  };

  slack.web.chat.postMessage(
    config.slack.lunchChannelId,
    willThereBeFood
      ? `Prišli obedy z ${restaurantNames[callRestaurant]} :slightly_smiling_face:`
      : `Dneska bohužiaľ obedy z ${restaurantNames[callRestaurant]} neprídu :disappointed:`,
    {as_user: true}
  );

  for (let message of messages) {
    if (!(isObedbotMentioned(message.text) && isOrder(message.text))) {
      continue;
    }
    const text = stripMention(message.text).toLowerCase().trim();
    const restaurant = identifyRestaurant(text);

    // FIXME merge presto and pizza restaurants into one
    if (restaurant === callRestaurant ||
      (callRestaurant === restaurants.presto && restaurant === restaurants.pizza)) {
      const userChannelId = find(users, ({user_id}) => user_id === message.user).channel_id;
      const notification = willThereBeFood
        ? `Prišiel ti obed ${text} z ${restaurantNames[callRestaurant]} :slightly_smiling_face:`
        : `Dneska bohužiaľ obed z ${restaurantNames[callRestaurant]} nepríde :disappointed:`;

      if (userChannelId) {
        slack.web.chat.postMessage(userChannelId, notification, {as_user: true});
      }
    }
  }
}

/**
 * Adds reaction to the message to confirm the order
 *
 * @param {string} ts - timestamp of the order message
 * @param {string} channel - channel on which to add reaction to the message
 */

function confirmOrder(ts) {
  slack.web.reactions.add(
    config.orderReaction,
    {channel: config.slack.lunchChannelId, timestamp: ts}
  );
}

function removeConfirmation(ts) {
  slack.web.reactions.remove(
    config.orderReaction,
    {channel: config.slack.lunchChannelId, timestamp: ts}
  );
}

/**
 * @param {string} key - order (parent) timestamp
 * @param {string} value - unknown order message timestamp
 */
const unknownOrderMessages = {};

function unknownOrder(ts) {
  slack.web.reactions.add(
    config.orderUnknownReaction,
    {channel: config.slack.lunchChannelId, timestamp: ts}
  );
  slack.web.chat.postMessage(
    config.slack.lunchChannelId,
    config.messages.unknownOrder,
    {as_user: true, thread_ts: ts}
  ).then((resp) => {
    const {ts, thread_ts} = resp.message;
    unknownOrderMessages[thread_ts] = ts;
  });
}

function removeUnknownOrder(ts) {
  slack.web.reactions.remove(
    config.orderUnknownReaction,
    {channel: config.slack.lunchChannelId, timestamp: ts}
  );
  const messageTs = unknownOrderMessages[ts];
  if (messageTs) {
    slack.web.chat.delete(messageTs, config.slack.lunchChannelId);
    delete unknownOrderMessages[ts];
  }
}

/**
 * User has tried to order in private channel
 * send him message that this feature is deprecated
 * @param {string} userChannel - IM channel of the user
 */
function privateIsDeprecated(userChannel) {
  slack.web.chat.postMessage(
    userChannel,
    config.messages.privateIsDeprecated,
    {as_user: true}
  );
}

/**
 * Changes notification status for a single user.
 * @param {string} userChannel - DM channel of the user
 * @param {boolean} notifications - new notifications status for the user
 */
export async function changeMute(userChannel, notifications) {
  return await updateRecord(userChannel, notifications).then(() => {
    slack.web.chat.postMessage(
      userChannel,
      `Notifikácie ${notifications ? 'zapnuté' : 'vypnuté'}`,
      {as_user: true}
    );
  }).catch(() => {
    slack.web.chat.postMessage(
      userChannel,
      'Stala sa chyba, skús operáciu vykonať znovu, poprípade kontaktuj administrátora',
      {as_user: true}
    );
  });
}

/**
 * Function called by slack api after receiving message event
 * @param {Object} res - response slack api received
 */

export async function messageReceived(msg) {
  logger.devLog('Message received');

  if (isNil(msg.subtype)) {
    logger.devLog('Message type: new message\n');
    logger.devLog(prettyPrint(msg));

    const {text: messageText, ts: timestamp, channel, user} = msg;

    if (user === config.slack.botId) {
      logger.devLog('Message was from obedbot');
      return;
    }

    if (!(await userExists(user))) {
      saveUser(user);
    }

    if (isChannelPublic(channel) && isObedbotMentioned(messageText)) {
      if (isOrder(messageText)) {
        confirmOrder(timestamp);
      } else {
        unknownOrder(timestamp);
      }
    } else if (channel.charAt(0) === 'D') {
      // if the user sent order into private channel, notify him this feature is deprecated
      if (isOrder(messageText)) {
        privateIsDeprecated(channel);
      } else if (messageText.includes('unmute')) {
        changeMute(channel, true);
      } else if (messageText.includes('mute')) {
        changeMute(channel, false);
      }
    }
  } else if (msg.subtype === RTM_MESSAGE_SUBTYPES.MESSAGE_CHANGED) {
    logger.devLog('Message type: edited message\n');
    logger.devLog(prettyPrint(msg));

    const {
      previous_message: {
        text: previousMessageText,
      },
      message: {
        text: messageText,
        ts: timestamp,
        subtype,
        user,
      },
      channel,
    } = msg;

    if (subtype === 'tombstone') { // message is deleted
      removeUnknownOrder(timestamp);
      return;
    }

    if (user === config.slack.botId) {
      logger.devLog('Message was from obedbot');
      return;
    }

    if (!(await userExists(user))) {
      saveUser(user);
    }

    slack.web.reactions.get({channel: config.slack.lunchChannelId, timestamp: timestamp})
      .then(({message: {reactions = []}}) => {
        if (isChannelPublic(channel)) {
          if (isObedbotMentioned(messageText) && isOrder(messageText)) {
            if (!alreadyReacted(reactions)) {
              removeUnknownOrder(timestamp);
              confirmOrder(timestamp);
            }
          } else if (isObedbotMentioned(previousMessageText) && isOrder(previousMessageText)) {
            if (alreadyReacted(reactions)) {
              removeConfirmation(timestamp);
              unknownOrder(timestamp);
            }
          }
        } else if (channel.charAt(0) === 'D') {
          // if the user sent order into private channel, notify him this feature is deprecated
          if (isOrder(messageText)) {
            privateIsDeprecated(channel);
          }
        }
      }).catch((err) => logger.error('Error during loading of reactions:', err));
  } else {
    logger.devLog('Message type: probably deleted message\n');
  }
}

export async function processMessages(messages) {
  for (let message of messages) {
    logger.devLog('Processing message');
    logger.devLog(prettyPrint(message));

    const {text: messageText, ts: timestamp, user, reactions} = message;

    if (user === config.slack.botId) {
      logger.devLog('Message was from obedbot');
      return;
    }

    if (!(await userExists(user))) {
      saveUser(user);
    }

    if (isObedbotMentioned(messageText) && isOrder(messageText)) {
      if (!alreadyReacted(reactions)) {
        confirmOrder(timestamp);
      }
    } else if (alreadyReacted(reactions)) {
      removeConfirmation(timestamp);
    }
  }
}

/**
 * Makes the last call for orders
 */
export async function makeLastCall() {
  if (config.dev) {
    return;
  }
  logger.devLog('Making last call');

  const messages = await getTodaysMessages();
  const filter = '({notifications} = 1)';
  const users = await listRecords(filter);
  const message = `Nezabudni si dnes objednať obed :slightly_smiling_face:\n${await getAllMenus()}`;

  for (let user of users) {
    if (!find(messages, ({text, user: userId}) => userId === user.user_id && isOrder(text))) {
      slack.web.chat.postMessage(user.channel_id, message, {as_user: true});
    }
  }
}

export function endOfOrders(restaurant) {
  slack.rtm.sendMessage(`Koniec objednávok ${restaurant}`, config.slack.lunchChannelId);
}
